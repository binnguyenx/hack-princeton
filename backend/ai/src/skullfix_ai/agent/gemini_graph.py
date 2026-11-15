"""Native LangGraph tool-calling chat over read-only workspace tools (AWS Bedrock by default, or Gemini).

StateGraph(MessagesState) -> agent -> tools_condition -> ToolNode -> agent ... -> END.
Conversation turns are checkpointed in-process with InMemorySaver, keyed by the
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
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest
from skullfix_ai.tools.clinical_calc_tools import build_clinical_calc_tools
from skullfix_ai.tools.knowledge_tools import build_knowledge_tools
from skullfix_ai.tools.langchain_read_tools import build_read_only_tools

LOGGER = logging.getLogger("skullfix_ai.chat")
GEMINI_MODEL = "gemini-3.1-flash-lite"
MAX_GRAPH_STEPS = 12

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
}
FALLBACK_DISCLAIMER = ("**Outside verified workspace protocols:** this topic is not covered by the workspace's "
                       "clinical knowledge base, so the answer below relies on general medical knowledge. "
                       "Verify it against current literature and your institutional guidance.")


def scrub_tool_names(text: str, names) -> str:
    """Replace internal tool identifiers (bare or in backticks/with parentheses) by plain language."""
    for name in sorted(names, key=len, reverse=True):
        phrase = TOOL_PHRASES.get(name, "a workspace check")
        text = re.sub(rf"`?\b{re.escape(name)}\b(?:\(\))?`?", phrase, text)
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


class ChatModelUnavailable(Exception):
    """Provider or configuration failure; surfaced without provider details."""


class GeminiChatAgent:
    """Per-turn graph compiled over request-bound read tools; checkpointer is shared."""

    mode = "gemini-read-only"

    def __init__(self, model_factory: Callable[[], BaseChatModel] = make_gemini_model, *, checkpointer=None,
                 proposal_tool_factories: Iterable[Callable] = (), mode: str | None = None,
                 readiness: Callable[[], tuple[bool, str | None]] | None = None):
        self._model_factory = model_factory
        self._readiness = readiness
        if mode is not None:
            self.mode = mode
        # Each factory(sink, context) -> BaseTool may only *stage* proposals through the sink.
        self._proposal_tool_factories = tuple(proposal_tool_factories)
        self._model: BaseChatModel | None = None
        self._lock = threading.Lock()
        self.checkpointer = checkpointer if checkpointer is not None else InMemorySaver()

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
                    geometry=None):
        return self._build(context, manifest, capabilities, sink, geometry)[0]

    def _build(self, context, manifest, capabilities=None, sink=None, geometry=None):
        """Compile the per-turn graph; also return the bound tool names (kept local, not on self)."""
        tools = [*build_read_only_tools(context, manifest), *build_knowledge_tools(),
                 *build_clinical_calc_tools(capabilities)]
        if geometry is not None:
            from skullfix_ai.tools.geometry_tools import build_geometry_tools
            tools += build_geometry_tools(geometry)
        if sink is not None:
            tools += [factory(sink, context) for factory in self._proposal_tool_factories]
        llm = self._chat_model().bind_tools(tools)
        system = SYSTEM_PROMPT if capabilities is None else f"{SYSTEM_PROMPT}\n\n{capabilities.prompt_block()}"

        def agent(state: MessagesState):
            return {"messages": [llm.invoke([SystemMessage(system), *state["messages"]])]}

        graph = StateGraph(MessagesState)
        graph.add_node("agent", agent)
        graph.add_node("tools", ToolNode(tools, handle_tool_errors=True))  # tool failures go back to the model as errors
        graph.add_edge(START, "agent")
        graph.add_conditional_edges("agent", tools_condition)
        graph.add_edge("tools", "agent")
        return graph.compile(checkpointer=self.checkpointer), {tool.name for tool in tools}

    @staticmethod
    def thread_id(conversation_id: str, context: AppObjectContext) -> str:
        return "|".join([conversation_id, context.project_id, context.case_id,
                         context.selected_object_id, context.revision_id or "-"])

    def stream_turn(self, *, conversation_id: str, message: str, history: Iterable, context: AppObjectContext,
                    manifest: AppProjectManifest, capabilities=None, sink=None, geometry=None) -> Iterator[dict]:
        """Run one turn, yielding thinking events, then one ``final`` event.

        Thinking events are ``{"type": "thinking", "id", "kind": "step" | "reasoning", "text"}``.
        Steps describe tool activity in plain language; reasoning is the model's own thought
        summary (when the provider returns one), re-sent in full as it grows so tool identifiers
        can be scrubbed across chunk boundaries. The final event is
        ``{"type": "final", "text", "tools"}``.
        """
        compiled, bound = self._build(context, manifest, capabilities, sink, geometry)
        names = {*TOOL_PHRASES, *bound}
        config = {"configurable": {"thread_id": self.thread_id(conversation_id, context)},
                  "recursion_limit": MAX_GRAPH_STEPS}
        new_messages = []
        if not compiled.get_state(config).values.get("messages"):
            # Server restarted or first turn: seed client turns as conversation text only.
            for turn in history:
                new_messages.append(HumanMessage(turn.content) if turn.role == "human" else AIMessage(turn.content))
        new_messages.append(HumanMessage(message))
        before = len(compiled.get_state(config).values.get("messages", []))
        reasoning: dict[str, str] = {}
        steps = 0
        try:
            for mode, payload in compiled.stream({"messages": new_messages}, config, stream_mode=["messages", "updates"]):
                if mode == "messages":
                    chunk, metadata = payload
                    if metadata.get("langgraph_node") != "agent" or not isinstance(chunk, (AIMessage, AIMessageChunk)):
                        continue
                    piece = reasoning_text(chunk)
                    if piece:
                        key = f"reasoning-{chunk.id or 'model'}"
                        reasoning[key] = reasoning.get(key, "") + piece
                        yield {"type": "thinking", "id": key, "kind": "reasoning",
                               "text": scrub_tool_names(reasoning[key], names)}
                    continue
                for node, update in (payload or {}).items():
                    for item in (update or {}).get("messages", []):
                        if node == "agent" and isinstance(item, AIMessage):
                            for call in item.tool_calls:
                                steps += 1
                                yield {"type": "thinking", "id": f"step-{call.get('id') or steps}", "kind": "step",
                                       "text": STEP_LABELS.get(call["name"], "Running a workspace check") + "…"}
                        elif node == "tools" and isinstance(item, ToolMessage):
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
               "viewport_overlay": geometry.latest_overlay() if geometry is not None else None}

    def reply(self, *, conversation_id: str, message: str, history: Iterable, context: AppObjectContext,
              manifest: AppProjectManifest) -> tuple[str, list[str]]:
        """Run one turn; returns (assistant text, names of tools the model called this turn)."""
        final = None
        for event in self.stream_turn(conversation_id=conversation_id, message=message, history=history,
                                      context=context, manifest=manifest):
            if event["type"] == "final":
                final = event
        return final["text"], final["tools"]
