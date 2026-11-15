"""Native LangGraph tool-calling chat over read-only workspace tools (Gemini by default).

StateGraph(MessagesState) -> agent -> tools_condition -> ToolNode -> agent ... -> END.
Conversation turns are checkpointed in-process with InMemorySaver, keyed by the
conversation id plus the full selection identity, so a context change never
inherits another selection's turns. Nothing here can write application data.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Callable, Iterable

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest
from skullfix_ai.tools.langchain_read_tools import build_read_only_tools

GEMINI_MODEL = "gemini-3-flash-preview"
MAX_GRAPH_STEPS = 12

SYSTEM_PROMPT = (Path(__file__).with_name('system_prompt.md').read_text(encoding='utf-8').strip())


def make_gemini_model() -> BaseChatModel:
    """Construct the Gemini chat model; raises if no API key is configured."""
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Set GOOGLE_API_KEY (or GEMINI_API_KEY) to enable Gemini chat.")
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(model=os.environ.get("SKULLFIX_GEMINI_MODEL", GEMINI_MODEL),
                                  temperature=0.0, api_key=api_key, max_retries=1, timeout=25)


class ChatModelUnavailable(Exception):
    """Provider or configuration failure; surfaced without provider details."""


class GeminiChatAgent:
    """Per-turn graph compiled over request-bound read tools; checkpointer is shared."""

    mode = "gemini-read-only"

    def __init__(self, model_factory: Callable[[], BaseChatModel] = make_gemini_model, *, checkpointer=None):
        self._model_factory = model_factory
        self._model: BaseChatModel | None = None
        self._lock = threading.Lock()
        self.checkpointer = checkpointer if checkpointer is not None else InMemorySaver()

    def _chat_model(self) -> BaseChatModel:
        with self._lock:
            if self._model is None:
                try:
                    self._model = self._model_factory()
                except Exception as error:
                    raise ChatModelUnavailable(str(error)) from error
            return self._model

    def build_graph(self, context: AppObjectContext, manifest: AppProjectManifest):
        tools = build_read_only_tools(context, manifest)
        llm = self._chat_model().bind_tools(tools)

        def agent(state: MessagesState):
            return {"messages": [llm.invoke([SystemMessage(SYSTEM_PROMPT), *state["messages"]])]}

        graph = StateGraph(MessagesState)
        graph.add_node("agent", agent)
        graph.add_node("tools", ToolNode(tools))
        graph.add_edge(START, "agent")
        graph.add_conditional_edges("agent", tools_condition)
        graph.add_edge("tools", "agent")
        return graph.compile(checkpointer=self.checkpointer)

    @staticmethod
    def thread_id(conversation_id: str, context: AppObjectContext) -> str:
        return "|".join([conversation_id, context.project_id, context.case_id,
                         context.selected_object_id, context.revision_id or "-"])

    def reply(self, *, conversation_id: str, message: str, history: Iterable, context: AppObjectContext,
              manifest: AppProjectManifest) -> tuple[str, list[str]]:
        """Run one turn; returns (assistant text, names of tools the model called this turn)."""
        compiled = self.build_graph(context, manifest)
        config = {"configurable": {"thread_id": self.thread_id(conversation_id, context)},
                  "recursion_limit": MAX_GRAPH_STEPS}
        new_messages = []
        if not compiled.get_state(config).values.get("messages"):
            # Server restarted or first turn: seed client turns as conversation text only.
            for turn in history:
                new_messages.append(HumanMessage(turn.content) if turn.role == "human" else AIMessage(turn.content))
        new_messages.append(HumanMessage(message))
        before = len(compiled.get_state(config).values.get("messages", []))
        try:
            final = compiled.invoke({"messages": new_messages}, config)
        except ChatModelUnavailable:
            raise
        except Exception as error:
            raise ChatModelUnavailable(type(error).__name__) from error
        turn = final["messages"][before:]
        called = [call["name"] for item in turn if isinstance(item, AIMessage) for call in item.tool_calls]
        text = final["messages"][-1].text if final["messages"] else ""
        return (text.strip() or "The model returned no text."), called
