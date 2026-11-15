"""Golden-case evaluation of the chat agent through the real HTTP stream, preflight, graph and tools.

Offline (default) the model is a replay of each case's scripted turns, so the graders check the
deterministic harness: routing, tool outputs, gates, scrubbing and banners. With --live-gemini the
real model runs the same cases; the graders then measure model behaviour (benchmark mode).

    PYTHONPATH=backend/ai/src .venv/bin/python -m pytest backend/ai/tests/eval_harness -q
    PYTHONPATH=backend/ai/src .venv/bin/python -m pytest backend/ai/tests/eval_harness -q --live-gemini --gemini-model gemini-2.5-flash
    PYTHONPATH=backend/ai/src .venv/bin/python -m pytest backend/ai/tests/eval_harness -q --live-bedrock [--bedrock-model ID]
"""
from __future__ import annotations

import json
import re
import tempfile
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from conftest import RESULTS
from skullfix_ai.agent.gemini_graph import PROVIDERS, TOOL_PHRASES, GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

GOLDEN = json.loads((Path(__file__).with_name("golden_cases.json")).read_text(encoding="utf-8"))
CASES = GOLDEN["cases"]
BANNER = "Outside verified workspace protocols"
INTERNAL_NAMES = sorted(TOOL_PHRASES)


class ReplayChatModel(BaseChatModel):
    """Replays a case's scripted assistant turns; records every call it receives."""

    script: list[Any] = []
    calls: int = 0

    @property
    def _llm_type(self):
        return "replay"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.calls += 1
        step = self.script.pop(0) if self.script else {"text": "No further scripted turn."}
        if "tool_calls" in step:
            message = AIMessage("", tool_calls=[{"name": call["name"], "args": call.get("args", {}),
                                                 "id": f"call-{self.calls}-{index}", "type": "tool_call"}
                                                for index, call in enumerate(step["tool_calls"])])
        else:
            message = AIMessage(step["text"])
        return ChatResult(generations=[ChatGeneration(message=message)])


class World:
    """Disposable workspace with every selection the golden cases reference."""

    def __init__(self, root: Path):
        self.repo = repo = ApplicationRepository(root)
        self.project = repo.create_project("Eval")
        self.case = repo.add_case(self.project["id"], "Case")
        other = repo.add_case(self.project["id"], "Other case")
        spatial = {"units": "mm", "sizes": [2, 3, 4], "spacings": [0.5, 0.5, 2.0], "bboxMm": [1, 1.5, 8]}
        self.source = repo.add_sample(self.project["id"], self.case["id"], "Skull", True, spatial, b"\x00" * 24)
        self.unverified = repo.add_sample(self.project["id"], self.case["id"], "Unverified", False, spatial, b"\x00" * 24)
        self.foreign = repo.add_sample(self.project["id"], other["id"], "Foreign", True, spatial, b"\x00" * 24)
        self.candidate = repo.create_candidate(self.source["id"])
        self.stale_revision = self.candidate["revisionId"]
        repo.commit_transform(self.candidate["candidateId"], [1, 0, 0, 3, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        manifest = repo.read_project_manifest(self.project["id"])
        self.current_revision = next(c["currentRevisionId"] for c in manifest["candidates"]
                                     if c["objectId"] == self.candidate["candidateId"])

    def selection(self, name: str) -> dict:
        base = {"project_id": self.project["id"], "case_id": self.case["id"], "expected_revision_id": None}
        objects = {
            "source": self.source["sourceAnatomy"]["objectId"],
            "unverified_source": self.unverified["sourceAnatomy"]["objectId"],
            "foreign_case": self.foreign["sourceAnatomy"]["objectId"],
            "unknown_object": "no-such-object",
        }
        if name in objects:
            return {**base, "object_id": objects[name]}
        revision = {"candidate": self.current_revision, "stale_candidate": self.stale_revision}[name]
        return {**base, "object_id": self.candidate["candidateId"], "expected_revision_id": revision}


def run_case(case: dict, live: str | None) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        world = World(Path(temporary))
        replay = ReplayChatModel(script=json.loads(json.dumps(case.get("replay", []))), calls=0)
        agent = GeminiChatAgent(PROVIDERS[live][0] if live else (lambda: replay))
        payload = {"request_id": f"req-{case['id']}", "conversation_id": f"conv-{case['id']}",
                   "message": case["message"], **world.selection(case["selection"])}
        started = time.perf_counter()
        with TestClient(create_app(world.repo.root, chat_agent=agent)) as client:
            response = client.post("/api/ai/chat/stream", json=payload)
        seconds = time.perf_counter() - started
        assert response.status_code == 200, response.text
        events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
        result = events[-1]
        context = result["outcome"].get("context") or {}
        thread = "|".join([payload["conversation_id"], payload["project_id"], payload["case_id"],
                           payload["object_id"], context.get("revision_id") or "-"])
        checkpoint = agent.checkpointer.get({"configurable": {"thread_id": thread}}) or {}
        messages = checkpoint.get("channel_values", {}).get("messages", [])
        tool_outputs: dict[str, list[dict]] = {}
        for message in messages:
            if isinstance(message, ToolMessage):
                try:
                    tool_outputs.setdefault(message.name, []).append(json.loads(message.content))
                except (TypeError, ValueError):
                    tool_outputs.setdefault(message.name, []).append({"status": "ERROR", "raw": message.content})
        called = [call["name"] for message in messages if isinstance(message, AIMessage) for call in message.tool_calls]
        model_called = (replay.calls > 0) if not live else bool(messages)
        return {"events": events, "result": result, "tool_outputs": tool_outputs, "called": called,
                "model_called": model_called, "seconds": seconds,
                "thinking": [e["text"] for e in events if e.get("type") == "thinking"]}


def grade(case: dict, run: dict) -> list[str]:
    """Return a list of failed expectations (empty = pass)."""
    expect, outcome = case["expect"], run["result"]["outcome"]
    reply = outcome["explanation"]
    failures = []
    if outcome["status"] != expect.get("status", "completed"):
        failures.append(f"status {outcome['status']} != {expect.get('status', 'completed')}")
    if "code" in expect and outcome.get("code") != expect["code"]:
        failures.append(f"code {outcome.get('code')} != {expect['code']}")
    if "model_called" in expect and run["model_called"] != expect["model_called"]:
        failures.append(f"model_called {run['model_called']} != {expect['model_called']}")
    for name in expect.get("tools_called", []):
        if name not in run["called"]:
            failures.append(f"did not call {name}")
    knowledge = run["tool_outputs"].get("search_clinical_knowledge", [])
    citations = {row.get("citation") for out in knowledge for row in out.get("results", [])}
    for citation in expect.get("citations", []):
        if citation not in citations:
            failures.append(f"missing citation {citation!r}")
    if "knowledge_status" in expect and expect["knowledge_status"] not in {out.get("status") for out in knowledge}:
        failures.append(f"knowledge status {expect['knowledge_status']} not returned")
    for name, status in expect.get("tool_status", {}).items():
        outputs = run["tool_outputs"].get(name)
        if outputs and outputs[-1].get("status") != status:  # graded only if the tool ran
            failures.append(f"{name} status {outputs[-1].get('status')} != {status}")
    for name, fields in expect.get("tool_fields", {}).items():
        last = (run["tool_outputs"].get(name) or [{}])[-1]
        for key, value in fields.items():
            if last.get(key) != value:
                failures.append(f"{name}.{key} {last.get(key)!r} != {value!r}")
    if "banner" in expect and (BANNER in reply) != expect["banner"]:
        failures.append(f"banner present={BANNER in reply}, expected {expect['banner']}")
    for text in expect.get("reply_contains", []):
        if text not in reply:
            failures.append(f"reply lacks {text!r}")
    if "reply_any_of" in expect and not any(t.lower() in reply.lower() for t in expect["reply_any_of"]):
        failures.append("reply lacks any of " + ", ".join(expect["reply_any_of"]))
    # Always: no internal identifier in the user-visible reply or thinking trace.
    for surface, text in [("reply", reply), *(("thinking", t) for t in run["thinking"])]:
        for name in INTERNAL_NAMES:
            if re.search(rf"\b{re.escape(name)}\b", text):
                failures.append(f"{surface} leaks {name}")
    return failures


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_golden_case(case, request, caplog):
    import os
    live = "bedrock" if request.config.getoption("--live-bedrock") else "gemini" if request.config.getoption("--live-gemini") else None
    if live:
        ready, reason = PROVIDERS[live][2]()
        if not ready:
            pytest.skip(f"--live-{live}: {reason}")
    run = run_case(case, live)
    failures = grade(case, run)
    if run["result"]["outcome"].get("code") == "model-unavailable":
        causes = sorted({r.getMessage() for r in caplog.records if r.name == "skullfix_ai.chat"})
        failures.append("model error: " + (", ".join(causes) or "unknown"))
    RESULTS.append({"id": case["id"], "category": case["category"], "passed": not failures,
                    "reason": "; ".join(failures), "seconds": run["seconds"]})
    assert not failures, f"{case['id']}: " + "; ".join(failures)


def test_dataset_covers_every_category_with_at_least_15_cases():
    categories = {case["category"] for case in CASES}
    assert len(CASES) >= 15
    assert categories == {"knowledge_hit", "math_delegation", "open_fallback", "abstraction_leak", "stale_scope"}
    assert len({case["id"] for case in CASES}) == len(CASES)
