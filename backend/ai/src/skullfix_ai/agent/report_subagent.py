"""Case report subagent (features/ai-case-report R1–R4, R6).

The subagent only reads the workspace and the current chat session, then submits a report plan.
Submitting stores the plan in the in-memory ReportStore; nothing touches application data.
"""

from __future__ import annotations

import json
from typing import Iterable

from langchain_core.tools import BaseTool, StructuredTool, tool

from skullfix_ai.reports.plan import CaseFacts, PlanError, ReportPlan, build_plan
from skullfix_ai.reports.store import Report, ReportStore

MAX_TURNS = 24
TURN_CHARS = 4000
REPORT_SUBAGENT_NAME = "case_report"
REPORT_DESCRIPTION = (
    "Builds a printable case report (PDF) for the selected case: defect, annotations, measurements, the current "
    "conversation and any cited sources. Use when the user asks for a case report, report, summary PDF or similar.")
REPORT_PROMPT = """You prepare a cranial-reconstruction case report for the selected case.

1. Read the workspace (selected object, case overview, revision history, annotations) and, when available,
   run the measurement tools. Read the conversation once.
2. Then call submit_report_plan exactly once with:
   - title (short), summary (at most 1200 characters, factual, from workspace data and the conversation),
   - findings (short bullet strings), measurements (name, value, unit, source; mark user-typed numbers as
     "user-supplied"), sources (only links that appeared in the conversation),
   - conversation_summary (what was discussed and decided),
   - callouts: up to 6 annotations worth highlighting, by their exact ids, each with a label of at most 40 characters.
   Leave `shots` empty: the standard report views are filled in for you.
3. If the tool returns INVALID, fix exactly what it names and submit again.
Never invent measurements, annotation ids or sources. This is a demonstration report, not clinical documentation.
Reply with one short sentence saying the plan was submitted (or why it could not be)."""


class ReportSink:
    """Per-request access for the case report subagent: read-only workspace facts, this session's turns, store."""

    def __init__(self, store: ReportStore, repository, context, manifest, conversation_id: str,
                 history: Iterable = (), message: str = ""):
        self._store, self._repository = store, repository
        self.context, self.manifest, self.conversation_id = context, manifest, conversation_id
        self._history = list(history)
        self._message = message
        self._latest: Report | None = None
        self._annotations: list[dict] | None = None

    def case_name(self) -> str:
        return next((case.name for case in self.manifest.cases if case.id == self.context.case_id), self.context.case_id)

    def annotations(self) -> list[dict]:
        """Annotations on the current revision of every candidate in the selected case (read-only)."""
        if self._annotations is None:
            samples = {s.id for s in self.manifest.samples if s.case_id == self.context.case_id}
            rows = []
            for candidate in self.manifest.candidates:
                if candidate.sample_id in samples and candidate.current_revision_id:
                    for item in self._repository.list_annotations(candidate.current_revision_id):
                        rows.append({"id": item["id"], "name": item["name"], "type": item["type"],
                                     "candidate_id": candidate.object_id, "visible": item["visible"]})
            self._annotations = rows
        return self._annotations

    def facts(self) -> CaseFacts:
        samples = [s for s in self.manifest.samples if s.case_id == self.context.case_id]
        sample_ids = {s.id for s in samples}
        return CaseFacts(
            case_name=self.case_name(),
            source_object_ids={s.source_anatomy.object_id for s in samples},
            candidate_object_ids={c.object_id for c in self.manifest.candidates if c.sample_id in sample_ids},
            annotations={row["id"]: row for row in self.annotations()})

    def transcript(self) -> list[dict]:
        """This chat session only: the client's turns plus the current request (R3)."""
        turns = [{"role": turn.role, "content": turn.content} for turn in self._history]
        if self._message:
            turns.append({"role": "human", "content": self._message})
        return [{"role": t["role"], "content": t["content"][:TURN_CHARS]} for t in turns[-MAX_TURNS:]]

    def submit(self, raw: dict) -> Report:
        plan = build_plan(raw, self.facts())
        context = self.context.model_dump(mode="json")
        context["project_name"] = self.manifest.project.name
        report = self._store.create(self.conversation_id, plan, case_name=self.case_name(), context=context)
        self._latest = report
        return report

    def latest_job(self) -> dict | None:
        return self._latest.job() if self._latest is not None else None


def build_report_tools(sink: ReportSink) -> list[BaseTool]:
    @tool
    def list_case_annotations() -> str:
        """List the annotations (id, name, type, candidate) on the current revisions in the selected case.
        Use these exact ids for report callouts."""
        return json.dumps({"annotations": sink.annotations()}, ensure_ascii=False)

    @tool
    def read_session_transcript() -> str:
        """Return the current chat session's turns (human and assistant text), oldest first."""
        return json.dumps({"turns": sink.transcript()}, ensure_ascii=False)

    def submit_report_plan(**plan) -> str:
        try:
            report = sink.submit(plan)
        except PlanError as error:
            return json.dumps({"status": "INVALID", "error": str(error)})
        return json.dumps({"status": "SUBMITTED", "report_id": report.id, "shots": len(report.plan.shots)})

    submit = StructuredTool.from_function(
        func=submit_report_plan, name="submit_report_plan", args_schema=ReportPlan,
        description="Submit the case report plan once. Returns SUBMITTED, or INVALID with what to fix.")
    return [list_case_annotations, read_session_transcript, submit]


def case_report_subagent(sink: ReportSink, workspace_tools: list[BaseTool]) -> dict:
    """Declarative Deep Agents subagent spec, bounded like the research subagent (R2)."""
    from langchain.agents.middleware import ModelCallLimitMiddleware

    from skullfix_ai.agent.gemini_graph import tool_error_middleware

    return {
        "name": REPORT_SUBAGENT_NAME,
        "description": REPORT_DESCRIPTION,
        "system_prompt": REPORT_PROMPT,
        "tools": [*workspace_tools, *build_report_tools(sink)],
        "middleware": [ModelCallLimitMiddleware(run_limit=8, exit_behavior="error"), tool_error_middleware()],
    }
