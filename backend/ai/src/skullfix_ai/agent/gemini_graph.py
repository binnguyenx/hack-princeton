"""Deep Agents tool-calling chat over read-only workspace tools (AWS Bedrock by default, or Gemini).

`deepagents.create_deep_agent` with the workspace tools plus read-only subagents spawned via `task`
(features/ai-deep-agent-research). Deep Agents' filesystem tools and its general-purpose subagent are
excluded. Conversation turns are checkpointed in-process with InMemorySaver, keyed by the
conversation id plus the full selection identity, so a context change never
inherits another selection's turns. Nothing here can write application data.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Callable, Iterable, Iterator

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest
from skullfix_ai.tools.clinical_calc_tools import build_clinical_calc_tools
from skullfix_ai.tools.knowledge_tools import build_knowledge_tools
from skullfix_ai.tools.langchain_read_tools import build_read_only_tools
from skullfix_ai.tools.research_tools import (SOURCE_NAMES, TOOL_FOR_SOURCE, build_research_tools,
                                              research_subagent)

LOGGER = logging.getLogger("skullfix_ai.chat")
GEMINI_MODEL = "gemini-3.1-flash-lite"
MAX_GRAPH_STEPS = 12
# Today's 12-step agent/tools loop allows 6 model calls per turn; the deep agent keeps that budget (R8).
MAX_MODEL_CALLS = 6
# Backstop only: Deep Agents adds middleware nodes, so graph steps no longer equal model calls.
DEEP_RECURSION_LIMIT = 60
# Deep Agents built-ins that a read-only workspace assistant must not offer (R3).
EXCLUDED_DEEP_AGENT_TOOLS = frozenset({"ls", "read_file", "write_file", "edit_file", "delete", "glob", "grep",
                                       "write_todos", "execute"})
SUBAGENT_LABELS = {"research": "Research", "case_report": "Case report"}

SYSTEM_PROMPT = (Path(__file__).with_name('system_prompt.md').read_text(encoding='utf-8').strip())

# Plain-language names used when a model leaks an internal tool identifier into its reply.
TOOL_PHRASES = {
    "describe_selection": "the selected object's metadata",
    "list_case_objects": "the case overview",
    "list_candidate_revisions": "the revision history",
    "search_clinical_knowledge": "the clinical knowledge base",
    "calculate_voxel_volume": "the volume calculation",
    "evaluate_fixation_safety": "the fixation safety check",
    "evaluate_implant_fit_metrics": "the implant fit check",
    "measure_workspace_volumes": "the volume measurement",
    "measure_defect_rim_thickness": "the rim thickness measurement",
    "measure_implant_rim_fit": "the rim fit measurement",
    "task": "a subagent",
    "search_wikipedia": "a Wikipedia search",
    "search_arxiv": "an arXiv search",
    "search_pubmed": "a PubMed search",
    "list_case_annotations": "the annotation list",
    "read_session_transcript": "the conversation",
    "submit_report_plan": "the report plan",
}
FALLBACK_DISCLAIMER = ("**Outside verified workspace protocols:** this topic is not covered by the workspace's "
                       "clinical knowledge base, so the answer below relies on general medical knowledge. "
                       "Verify it against current literature and your institutional guidance.")


def tool_name_pattern(name: str) -> str:
    """Regex for a leaked tool identifier.

    snake_case names are never prose, so they match bare. A name that is also an ordinary word
    (e.g. ``task``) only matches when written as code: in backticks or followed by ``()``.
    """
    word = re.escape(name)
    if "_" in name:
        return rf"`?\b{word}\b(?:\(\))?`?"
    return rf"`{word}(?:\(\))?`|\b{word}\(\)"


def scrub_tool_names(text: str, names) -> str:
    """Replace internal tool identifiers by plain language (see ``tool_name_pattern``)."""
    for name in sorted(names, key=len, reverse=True):
        phrase = TOOL_PHRASES.get(name, "a workspace check")
        text = re.sub(tool_name_pattern(name), phrase, text)
    return text


STEP_LABELS = {
    "describe_selection": "Reading the selected object's metadata",
    "list_case_objects": "Reviewing the objects in this case",
    "list_candidate_revisions": "Reviewing the revision history",
    "search_clinical_knowledge": "Searching the clinical knowledge base",
    "calculate_voxel_volume": "Calculating physical volume",
    "evaluate_fixation_safety": "Checking fixation against safety thresholds",
    "evaluate_implant_fit_metrics": "Checking implant fit tolerances",
    "measure_workspace_volumes": "Measuring volumes from the scan",
    "measure_defect_rim_thickness": "Measuring bone thickness around the defect rim",
    "measure_implant_rim_fit": "Measuring implant fit at the defect rim",
    "list_case_annotations": "Reading the case annotations",
    "read_session_transcript": "Reading the conversation",
    "submit_report_plan": "Drafting the report sections",
}


def reasoning_text(message) -> str:
    """Thought-summary text in a model message (Gemini `thinking` or standard `reasoning` blocks)."""
    content = message.content
    if not isinstance(content, list):
        return ""
    parts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "thinking" and isinstance(block.get("thinking"), str):
            parts.append(block["thinking"])
        elif isinstance(block, dict) and block.get("type") == "reasoning" and isinstance(block.get("reasoning"), str):
            parts.append(block["reasoning"])
        elif isinstance(block, dict) and block.get("type") == "reasoning_content":
            inner = block.get("reasoning_content")  # Bedrock Converse reasoning block
            text = inner.get("text") if isinstance(inner, dict) else None
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


def step_result_label(message: ToolMessage) -> str:
    """Plain-language outcome of one tool call; never the tool name or raw JSON."""
    label = STEP_LABELS.get(message.name or "", "Workspace check")
    if getattr(message, "status", None) == "error":
        return f"{label}: not available"
    try:
        result = json.loads(message.content)
    except (TypeError, ValueError):
        return f"{label}: done"
    if not isinstance(result, dict):
        return f"{label}: done"
    status = result.get("status")
    if message.name == "search_clinical_knowledge":
        if status == "FOUND":
            sections = [row.get("section") for row in result.get("results", []) if isinstance(row, dict)]
            return f"{label}: found {', '.join(s for s in sections if s)}"
        return f"{label}: no verified protocol covers this"
    if status in {"PASS", "FAIL", "INDETERMINATE"}:
        return f"{label}: {status}"
    return f"{label}: done"


def knowledge_outcome(messages) -> str | None:
    """FOUND if any knowledge search this turn found something, NOT_FOUND if all missed, else None."""
    statuses = []
    for message in messages:
        if isinstance(message, ToolMessage) and message.name == "search_clinical_knowledge":
            try:
                statuses.append(json.loads(message.content).get("status"))
            except (TypeError, ValueError, AttributeError):
                statuses.append(None)
    if not statuses:
        return None
    return "FOUND" if "FOUND" in statuses else "NOT_FOUND"


def _clip(text: str, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def subagent_label(name: str | None) -> str:
    return SUBAGENT_LABELS.get(name or "", "Specialist")


def subagent_step_label(call: dict) -> str:
    """Plain-language label for a tool call made inside a subagent."""
    name = call.get("name", "")
    for source, tool_name in TOOL_FOR_SOURCE.items():
        if name == tool_name:
            query = _clip((call.get("args") or {}).get("query", ""), 80)
            return f"Searching {SOURCE_NAMES[source]} for “{query}”…"
    return STEP_LABELS.get(name, "Working") + "…"


def subagent_result_label(message: ToolMessage) -> str:
    for source, tool_name in TOOL_FOR_SOURCE.items():
        if message.name == tool_name:
            label = SOURCE_NAMES[source]
            try:
                result = json.loads(message.content)
            except (TypeError, ValueError):
                return f"{label}: done"
            status = result.get("status") if isinstance(result, dict) else None
            if status == "FOUND":
                count = len(result.get("results") or [])
                return f"{label}: {count} result{'s' if count != 1 else ''}"
            if status == "NO_RESULTS":
                return f"{label}: no results"
            return f"{label}: unavailable"
    return step_result_label(message)


def subagent_returned_text(name: str | None, content: str) -> str:
    sources = len(set(re.findall(r"https?://\S+", content or "")))
    first = next((line for line in (content or "").splitlines() if line.strip()), "")
    lead = f"{subagent_label(name)} subagent returned"
    if sources:
        lead += f" {sources} source{'s' if sources != 1 else ''}"
    return f"{lead}: {_clip(first, 140)}" if first else lead


def make_gemini_model() -> BaseChatModel:
    """Construct the Gemini chat model; raises if no API key is configured."""
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Set GOOGLE_API_KEY (or GEMINI_API_KEY) to enable Gemini chat.")
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(model=os.environ.get("SKULLFIX_GEMINI_MODEL", GEMINI_MODEL),
                                  temperature=0.0, api_key=api_key, max_retries=1, timeout=25,
                                  include_thoughts=True)


BEDROCK_DEFAULT_MODEL = "us.anthropic.claude-3-7-sonnet-20250219-v1:0"


def bedrock_model_id() -> str:
    """SKULLFIX_BEDROCK_MODEL, else legacy SKULLFIX_AI_MODEL_ID, else the project default."""
    for name in ("SKULLFIX_BEDROCK_MODEL", "SKULLFIX_AI_MODEL_ID"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return BEDROCK_DEFAULT_MODEL


def aws_region() -> str | None:
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if region:
        return region
    try:
        import boto3
        return boto3.Session().region_name  # region from AWS_PROFILE / ~/.aws/config
    except Exception:
        return None


def bedrock_readiness() -> tuple[bool, str | None]:
    """Local check only (no AWS call): a region and resolvable credentials (env, profile, SSO, role)."""
    if not aws_region():
        return False, "AWS region is not configured (set AWS_REGION or a profile region)."
    try:
        import boto3
        if boto3.Session().get_credentials() is None:
            return False, "AWS credentials were not found (set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)."
    except Exception:
        return False, "AWS credentials could not be resolved."
    return True, None


def gemini_readiness() -> tuple[bool, str | None]:
    if os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"):
        return True, None
    return False, "GOOGLE_API_KEY (or GEMINI_API_KEY) is not set."


def make_bedrock_model() -> BaseChatModel:
    """Construct the AWS Bedrock Converse chat model (temperature 0, bounded timeouts/retries)."""
    region = aws_region()
    if not region:
        raise RuntimeError("Set AWS_REGION (or AWS_DEFAULT_REGION) for Bedrock chat.")
    from botocore.config import Config
    from langchain_aws import ChatBedrockConverse

    return ChatBedrockConverse(model=bedrock_model_id(), region_name=region, temperature=0.0, max_tokens=2048,
                               config=Config(connect_timeout=10, read_timeout=60,
                                             retries={"max_attempts": 2, "mode": "standard"}))


# provider -> (model factory, response mode reported to the client, local readiness check)
PROVIDERS: dict[str, tuple[Callable[[], BaseChatModel], str, Callable[[], tuple[bool, str | None]]]] = {
    "bedrock": (make_bedrock_model, "bedrock-read-only", bedrock_readiness),
    "gemini": (make_gemini_model, "gemini-read-only", gemini_readiness),
}
DEFAULT_PROVIDER = "bedrock"


def chat_agent_for(provider: str, **options) -> "GeminiChatAgent":
    factory, mode, readiness = PROVIDERS[provider]
    return GeminiChatAgent(factory, mode=mode, readiness=readiness, **options)


def tool_error_middleware():
    """Tool exceptions go back to the model as error ToolMessages, exactly as the previous
    ToolNode(handle_tool_errors=True) did, instead of failing the turn (R6, R9)."""
    from langchain.agents.middleware import AgentMiddleware
    from langgraph.prebuilt.tool_node import TOOL_CALL_ERROR_TEMPLATE

    class ToolErrorsToModel(AgentMiddleware):
        def wrap_tool_call(self, request, handler):
            try:
                return handler(request)
            except Exception as error:
                call = request.tool_call
                return ToolMessage(content=TOOL_CALL_ERROR_TEMPLATE.format(error=repr(error)),
                                   name=call["name"], tool_call_id=call["id"], status="error")

    return ToolErrorsToModel()


class TranscriptCheckpointer(InMemorySaver):
    """In-process checkpointer whose `get()` still exposes the full `messages` list.

    Deep Agents stores `messages` as a delta channel, so a raw checkpoint no longer carries the
    transcript. Callers that read `agent.checkpointer.get(...)` (the eval harness, operators) keep
    seeing `channel_values["messages"]` as before (R5). LangGraph itself uses `get_tuple`, unchanged.
    """

    def get(self, config):
        checkpoint = super().get(config)
        if checkpoint is None:
            return None
        values = checkpoint.get("channel_values", {})
        if "messages" not in values:
            messages = self._reader().get_state(config).values.get("messages", [])
            checkpoint = {**checkpoint, "channel_values": {**values, "messages": messages}}
        return checkpoint

    def _reader(self):
        from deepagents.graph import DeepAgentState
        from langgraph.graph import START, StateGraph

        graph = StateGraph(DeepAgentState)
        graph.add_node("read", lambda state: {})
        graph.add_edge(START, "read")
        return graph.compile(checkpointer=self)


_PROFILED_PROVIDERS: set[str] = set()
_PROFILE_LOCK = threading.Lock()


def _ensure_read_only_profile(model: BaseChatModel) -> None:
    """Register a Deep Agents harness profile for this model's provider: no filesystem tools, no
    general-purpose subagent (R3). Profiles are looked up by provider, so register once per provider."""
    from deepagents import GeneralPurposeSubagentProfile, HarnessProfile, register_harness_profile

    try:
        provider = (model._get_ls_params() or {}).get("ls_provider")
    except Exception:
        provider = None
    provider = provider or type(model).__name__.lower()
    with _PROFILE_LOCK:
        if provider in _PROFILED_PROVIDERS:
            return
        register_harness_profile(provider, HarnessProfile(
            excluded_tools=EXCLUDED_DEEP_AGENT_TOOLS,
            general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False)))
        _PROFILED_PROVIDERS.add(provider)


class ChatModelUnavailable(Exception):
    """Provider or configuration failure; surfaced without provider details."""


class GeminiChatAgent:
    """Per-turn graph compiled over request-bound read tools; checkpointer is shared."""

    mode = "gemini-read-only"

    def __init__(self, model_factory: Callable[[], BaseChatModel] = make_gemini_model, *, checkpointer=None,
                 proposal_tool_factories: Iterable[Callable] = (), mode: str | None = None,
                 readiness: Callable[[], tuple[bool, str | None]] | None = None,
                 research_wrappers: dict | None = None):
        self._model_factory = model_factory
        # Literature API wrappers for the research subagent (None = real clients, built lazily).
        self._research_wrappers = research_wrappers
        self._readiness = readiness
        if mode is not None:
            self.mode = mode
        # Each factory(sink, context) -> BaseTool may only *stage* proposals through the sink.
        self._proposal_tool_factories = tuple(proposal_tool_factories)
        self._model: BaseChatModel | None = None
        self._lock = threading.Lock()
        self.checkpointer = checkpointer if checkpointer is not None else TranscriptCheckpointer()

    def ready(self) -> tuple[bool, str | None]:
        """Provider readiness without a model call; agents built from a bare factory are always ready."""
        return self._readiness() if self._readiness is not None else (True, None)

    def _chat_model(self) -> BaseChatModel:
        with self._lock:
            if self._model is None:
                try:
                    self._model = self._model_factory()
                except Exception as error:
                    raise ChatModelUnavailable(str(error)) from error
            return self._model

    def build_graph(self, context: AppObjectContext, manifest: AppProjectManifest, capabilities=None, sink=None,
                    geometry=None, reports=None):
        return self._build(context, manifest, capabilities, sink, geometry, reports)[0]

    def _build(self, context, manifest, capabilities=None, sink=None, geometry=None, reports=None):
        """Compile the per-turn deep agent; also return the bound tool names (kept local, not on self)."""
        from deepagents import create_deep_agent
        from langchain.agents.middleware import ModelCallLimitMiddleware

        tools = [*build_read_only_tools(context, manifest), *build_knowledge_tools(),
                 *build_clinical_calc_tools(capabilities)]
        if geometry is not None:
            from skullfix_ai.tools.geometry_tools import build_geometry_tools
            tools += build_geometry_tools(geometry)
        if sink is not None:
            tools += [factory(sink, context) for factory in self._proposal_tool_factories]
        research_tools = build_research_tools(self._research_wrappers)
        subagents = [research_subagent(research_tools)]
        if reports is not None:
            # Case report subagent (ai-case-report R1, R2): read-only workspace tools + report tools.
            from skullfix_ai.agent.report_subagent import case_report_subagent

            workspace = [*build_read_only_tools(context, manifest)]
            if geometry is not None:
                from skullfix_ai.tools.geometry_tools import build_geometry_tools
                workspace += build_geometry_tools(geometry)
            subagents.append(case_report_subagent(reports, workspace))
        model = self._chat_model()
        _ensure_read_only_profile(model)
        system = SYSTEM_PROMPT if capabilities is None else f"{SYSTEM_PROMPT}\n\n{capabilities.prompt_block()}"
        graph = create_deep_agent(
            model=model, tools=tools, system_prompt=system, subagents=subagents,
            middleware=[ModelCallLimitMiddleware(run_limit=MAX_MODEL_CALLS, exit_behavior="error"),
                        tool_error_middleware()],
            checkpointer=self.checkpointer)
        names = {tool.name for tool in tools} | {tool.name for tool in research_tools} | {"task"}
        for spec in subagents[1:]:
            names |= {getattr(item, "name", "") for item in spec.get("tools", [])}
        return graph, names

    @staticmethod
    def thread_id(conversation_id: str, context: AppObjectContext) -> str:
        return "|".join([conversation_id, context.project_id, context.case_id,
                         context.selected_object_id, context.revision_id or "-"])

    def stream_turn(self, *, conversation_id: str, message: str, history: Iterable, context: AppObjectContext,
                    manifest: AppProjectManifest, capabilities=None, sink=None, geometry=None,
                    reports=None) -> Iterator[dict]:
        """Run one turn, yielding thinking events, then one ``final`` event.

        Thinking events are ``{"type": "thinking", "id", "kind": "step" | "reasoning", "text"}``.
        Steps describe tool activity in plain language; reasoning is the model's own thought
        summary (when the provider returns one), re-sent in full as it grows so tool identifiers
        can be scrubbed across chunk boundaries. The final event is
        ``{"type": "final", "text", "tools"}``.
        """
        compiled, bound = self._build(context, manifest, capabilities, sink, geometry, reports)
        names = {*TOOL_PHRASES, *bound}
        config = {"configurable": {"thread_id": self.thread_id(conversation_id, context)},
                  "recursion_limit": DEEP_RECURSION_LIMIT}
        new_messages = []
        if not compiled.get_state(config).values.get("messages"):
            # Server restarted or first turn: seed client turns as conversation text only.
            for turn in history:
                new_messages.append(HumanMessage(turn.content) if turn.role == "human" else AIMessage(turn.content))
        new_messages.append(HumanMessage(message))
        before = len(compiled.get_state(config).values.get("messages", []))
        reasoning: dict[str, str] = {}
        steps = 0
        # task tool_call_id -> subagent name, in spawn order; subgraph namespace -> task tool_call_id.
        spawned: dict[str, str] = {}
        namespace_task: dict[str, str] = {}

        def task_for(namespace) -> str | None:
            key = namespace[0] if namespace else ""
            if key not in namespace_task:
                taken = set(namespace_task.values())
                pending = [call_id for call_id in spawned if call_id not in taken]
                if not pending:
                    return None
                namespace_task[key] = pending[0]
            return namespace_task[key]

        try:
            for namespace, mode, payload in compiled.stream({"messages": new_messages}, config,
                                                            stream_mode=["messages", "updates"], subgraphs=True):
                if namespace:
                    yield from self._subagent_events(task_for(namespace), spawned, mode, payload)
                    continue
                if mode == "messages":
                    chunk, metadata = payload
                    if metadata.get("langgraph_node") != "model" or not isinstance(chunk, (AIMessage, AIMessageChunk)):
                        continue
                    piece = reasoning_text(chunk)
                    if piece:
                        key = f"reasoning-{chunk.id or 'model'}"
                        reasoning[key] = reasoning.get(key, "") + piece
                        yield {"type": "thinking", "id": key, "kind": "reasoning",
                               "text": scrub_tool_names(reasoning[key], names)}
                    continue
                for node, update in (payload or {}).items():
                    for item in (update or {}).get("messages", []) if isinstance(update, dict) else []:
                        if node == "model" and isinstance(item, AIMessage):
                            for call in item.tool_calls:
                                if call["name"] == "task":
                                    sub = (call.get("args") or {}).get("subagent_type") or ""
                                    spawned[call.get("id") or f"task-{len(spawned)}"] = sub
                                    yield {"type": "thinking", "id": f"subagent-{call.get('id')}", "kind": "subagent",
                                           "subagent": sub, "phase": "spawned",
                                           "text": f"Spawned {subagent_label(sub).lower()} subagent: "
                                                   f"{_clip((call.get('args') or {}).get('description', ''), 120)}"}
                                    continue
                                steps += 1
                                yield {"type": "thinking", "id": f"step-{call.get('id') or steps}", "kind": "step",
                                       "text": STEP_LABELS.get(call["name"], "Running a workspace check") + "…"}
                        elif node == "tools" and isinstance(item, ToolMessage):
                            if item.name == "task":
                                sub = spawned.get(item.tool_call_id, "")
                                failed = getattr(item, "status", None) == "error"
                                yield {"type": "thinking", "id": f"subagent-{item.tool_call_id}-done", "kind": "subagent",
                                       "subagent": sub, "phase": "failed" if failed else "returned",
                                       "text": (f"{subagent_label(sub)} subagent could not finish" if failed
                                                else scrub_tool_names(subagent_returned_text(sub, str(item.content)), names))}
                                continue
                            yield {"type": "thinking", "id": f"step-{item.tool_call_id}", "kind": "step",
                                   "text": step_result_label(item)}
        except ChatModelUnavailable:
            raise
        except Exception as error:
            # Operators get the failure class; users get a generic "unavailable" outcome.
            LOGGER.warning("chat turn failed: %s", type(error).__name__)
            raise ChatModelUnavailable(type(error).__name__) from error
        messages = compiled.get_state(config).values.get("messages", [])
        turn = messages[before:]
        called = [call["name"] for item in turn if isinstance(item, AIMessage) for call in item.tool_calls]
        text = messages[-1].text if messages else ""
        text = scrub_tool_names(text.strip(), names) or "The model returned no text."
        if knowledge_outcome(turn) == "NOT_FOUND" and "Outside verified workspace protocols" not in text:
            text = f"{FALLBACK_DISCLAIMER}\n\n{text}"
        yield {"type": "final", "text": text, "tools": called,
               "staged_proposal": sink.latest_pending() if sink is not None else None,
               "viewport_overlay": geometry.latest_overlay() if geometry is not None else None,
               "report_job": reports.latest_job() if reports is not None else None}

    @staticmethod
    def _subagent_events(task_id: str | None, spawned: dict, mode: str, payload) -> Iterator[dict]:
        """Steps a subagent takes, as `subagent` thinking events grouped under its task id (R17)."""
        if mode != "updates" or task_id is None:
            return
        sub = spawned.get(task_id, "")
        for node, update in (payload or {}).items():
            for item in (update or {}).get("messages", []) if isinstance(update, dict) else []:
                if node == "model" and isinstance(item, AIMessage):
                    for call in item.tool_calls:
                        yield {"type": "thinking", "id": f"subagent-{task_id}-{call.get('id')}", "kind": "subagent",
                               "subagent": sub, "phase": "step", "text": subagent_step_label(call)}
                elif node == "tools" and isinstance(item, ToolMessage):
                    yield {"type": "thinking", "id": f"subagent-{task_id}-{item.tool_call_id}", "kind": "subagent",
                           "subagent": sub, "phase": "step", "text": subagent_result_label(item)}

    def reply(self, *, conversation_id: str, message: str, history: Iterable, context: AppObjectContext,
              manifest: AppProjectManifest) -> tuple[str, list[str]]:
        """Run one turn; returns (assistant text, names of tools the model called this turn)."""
        final = None
        for event in self.stream_turn(conversation_id=conversation_id, message=message, history=history,
                                      context=context, manifest=manifest):
            if event["type"] == "final":
                final = event
        return final["text"], final["tools"]
