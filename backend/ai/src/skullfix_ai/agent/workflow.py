"""Bounded fake-model workflow with genuine LangGraph orchestration."""

from __future__ import annotations

from copy import deepcopy
from typing import Literal, Mapping, Protocol, TypedDict, get_args

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from skullfix_ai.integrations.workspace import AppWorkspaceAdapter, WorkspaceError
from skullfix_ai.schemas.common import TerminalStatus
from skullfix_ai.schemas.workspace import AppObjectContext
from skullfix_ai.tools import ToolBoundaryError, ToolCall, ToolObservation, ToolRegistry

from .context import GraphRequest

# Align GraphOutcome with shared TerminalStatus (contracts.md / R13).
GraphTerminalStatus = Literal[
    "completed",
    "unsupported",
    "unavailable",
    "stale",
    "failed",
]
assert set(get_args(GraphTerminalStatus)) == {status.value for status in TerminalStatus}


class ToolModel(Protocol):
    def propose(self, message: str, context: AppObjectContext,
                tools: list[dict[str, JsonValue]]) -> Mapping[str, object]: ...


class FakeToolModel:
    """Deterministic model substitute. It makes no provider or network calls."""

    def __init__(self, name: str = "workspace.describe_selection", arguments: dict | None = None):
        self.name = name
        self.arguments = arguments if arguments is not None else {}
        self.calls: list[dict] = []

    def propose(self, message, context, tools):
        self.calls.append({"message": message, "context": context.model_dump(mode="json"), "tools": deepcopy(tools)})
        return {"name": self.name, "arguments": deepcopy(self.arguments)}


class GraphOutcome(BaseModel):
    """Internal graph outcome; operation_result retains the shared service envelope."""

    model_config = ConfigDict(extra="forbid")
    status: GraphTerminalStatus
    code: str | None = None
    context: AppObjectContext | None = None
    observation: ToolObservation | None = None
    explanation: str
    steps: list[str] = Field(default_factory=list)


class GraphState(TypedDict, total=False):
    request: GraphRequest
    context: AppObjectContext
    proposal: ToolCall
    validated: tuple
    observation: ToolObservation
    status: str
    code: str | None
    message: str
    explanation: str
    steps: list[str]


def _step(state: GraphState, name: str, **updates) -> dict:
    return {**updates, "steps": [*state.get("steps", []), name]}


def _failure(state: GraphState, node: str, code: str, message: str, status: str = "failed") -> dict:
    return _step(state, node, status=status, code=code, message=message)


class WorkspaceGraph:
    """Live reads plus opt-in sandbox tools; never a live candidate writer."""

    def __init__(self, workspace: AppWorkspaceAdapter, model: ToolModel, registry: ToolRegistry):
        self._workspace, self._model, self._registry = workspace, model, registry
        graph = StateGraph(GraphState)
        for name in ("load_context", "propose", "validate", "execute", "explain"):
            graph.add_node(name, getattr(self, "_" + name))
        graph.add_edge(START, "load_context")
        for first, second in zip(("load_context", "propose", "validate", "execute"),
                                 ("propose", "validate", "execute", "explain")):
            graph.add_edge(first, second)
        graph.add_edge("explain", END)
        self.compiled = graph.compile()

    def invoke(self, request: GraphRequest | Mapping[str, object]) -> GraphOutcome:
        parsed = GraphRequest.model_validate(request)
        state = self.compiled.invoke({"request": parsed, "steps": [], "code": None})
        return GraphOutcome(status=state["status"], code=state.get("code"),
                            context=state.get("context"), observation=state.get("observation"),
                            explanation=state["explanation"], steps=state["steps"])

    def _load_context(self, state):
        request = state["request"]
        try:
            context = self._workspace.load_context(
                request.project_id, request.object_id, case_id=request.case_id,
                expected_revision_id=request.expected_revision_id,
            )
            return _step(state, "load_context", context=context)
        except WorkspaceError as error:
            status = "stale" if error.code == "stale-revision" else "unavailable"
            return _failure(state, "load_context", error.code, str(error), status)
        except Exception:
            return _failure(state, "load_context", "workspace-read-failed", "Application context could not be loaded.")

    def _propose(self, state):
        if state.get("code"):
            return _step(state, "propose")
        try:
            proposal = self._model.propose(state["request"].message, state["context"].model_copy(deep=True), self._registry.catalog())
            return _step(state, "propose", proposal=ToolCall.model_validate(proposal))
        except ValidationError:
            return _failure(state, "propose", "tool-proposal-invalid", "Model did not propose a typed tool call.")
        except Exception:
            return _failure(state, "propose", "model-failed", "Model proposal could not be obtained.")

    def _validate(self, state):
        if state.get("code"):
            return _step(state, "validate")
        try:
            return _step(state, "validate", validated=self._registry.validate(state["proposal"]))
        except ToolBoundaryError as error:
            return _failure(state, "validate", error.code, error.message, error.status)

    def _execute(self, state):
        if state.get("code"):
            return _step(state, "execute")
        definition, arguments = state["validated"]
        try:
            observation = definition.execute(arguments, state["context"].model_copy(deep=True), state["request"].request_id)
            observation = ToolObservation.model_validate(observation)
            if observation.scope != definition.scope:
                raise ToolBoundaryError("tool-output-invalid", "Tool output scope differs from its registered capability.")
            result = observation.operation_result
            if observation.scope == "application-read":
                authoritative = state["context"].model_dump(mode="json")
                if (result is not None
                        or observation.metadata.get("selected_object_id") != authoritative["selected_object_id"]
                        or any(key not in authoritative or value != authoritative[key]
                               for key, value in observation.metadata.items())):
                    raise ToolBoundaryError("tool-output-invalid", "Read metadata differs from authoritative context.")
            elif result is None or result.request_id != state["request"].request_id:
                raise ToolBoundaryError("tool-output-invalid", "Sandbox output requires the matching shared operation result.")
            if result is not None and result.status != "completed":
                return _step(state, "execute", observation=observation, status=result.status,
                             code=result.error.code, message=result.error.message)
            return _step(state, "execute", observation=observation, status="completed")
        except ToolBoundaryError as error:
            return _failure(state, "execute", error.code, error.message, error.status)
        except Exception:
            return _failure(state, "execute", "tool-execution-failed", "The registered tool could not complete.")

    def _explain(self, state):
        if state.get("code"):
            explanation = f"Request {state.get('status', 'failed')}: {state['code']}. {state['message']}"
        elif state["observation"].scope == "application-read":
            metadata = state["observation"].metadata
            revision = metadata.get("revision_id")
            explanation = f"Read authoritative metadata for selected object {metadata['selected_object_id']}."
            if revision is not None:
                explanation += f" Current revision: {revision}."
            explanation += " No geometry operation was performed."
        else:
            result = state["observation"].operation_result
            if result is None:
                return _failure(state, "explain", "tool-output-invalid", "Sandbox output requires the shared operation result.") | {"explanation": "Sandbox result could not be explained."}
            explanation = f"Sandbox {result.source} operation {result.operation_id} {result.status}; candidate {result.output_candidate_id}, revision {result.output_revision_id}. "
            explanation += " ".join(result.limitations)
        return _step(state, "explain", explanation=explanation)
