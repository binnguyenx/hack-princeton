"""In-memory case reports, scoped to a chat conversation (ai-case-report R10, R13, R14).

Reports live for the server process only (like conversation memory) and are never written to the
application database or a project package.
"""

from __future__ import annotations

import secrets
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Callable

from skullfix_ai.reports.plan import ReportPlan

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_REPORTS_PER_CONVERSATION = 5
MAX_CAPTURE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_CAPTURE_BYTES = 24 * 1024 * 1024
MAX_PDF_BYTES = 30 * 1024 * 1024


class ReportError(Exception):
    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code, self.status = code, status


@dataclass
class Report:
    id: str
    conversation_id: str
    plan: ReportPlan
    case_name: str
    context: dict
    created_at: float
    status: str = "needs-captures"  # needs-captures | ready | failed
    pdf: bytes | None = None
    pages: int = 0
    error: str | None = None
    meta: dict = field(default_factory=dict)

    def job(self) -> dict:
        """What the browser needs to capture (the envelope's `report_job`, R6)."""
        return {"report_id": self.id, "conversation_id": self.conversation_id, "status": self.status,
                "title": self.plan.title, "shots": [shot.model_dump(mode="json") for shot in self.plan.shots]}

    def public(self) -> dict:
        return {"report_id": self.id, "conversation_id": self.conversation_id, "status": self.status,
                "title": self.plan.title, "pages": self.pages, "error": self.error, "created_at": self.created_at}


class ReportStore:
    def __init__(self, *, max_per_conversation: int = MAX_REPORTS_PER_CONVERSATION,
                 max_capture_bytes: int = MAX_CAPTURE_BYTES, max_total_capture_bytes: int = MAX_TOTAL_CAPTURE_BYTES,
                 max_pdf_bytes: int = MAX_PDF_BYTES, clock: Callable[[], float] = time.time):
        self._reports: OrderedDict[str, Report] = OrderedDict()
        self._lock = threading.Lock()
        self.max_per_conversation = max_per_conversation
        self.max_capture_bytes = max_capture_bytes
        self.max_total_capture_bytes = max_total_capture_bytes
        self.max_pdf_bytes = max_pdf_bytes
        self._clock = clock

    def create(self, conversation_id: str, plan: ReportPlan, *, case_name: str, context: dict | None = None) -> Report:
        report = Report(id=secrets.token_hex(16), conversation_id=conversation_id, plan=plan, case_name=case_name,
                        context=dict(context or {}), created_at=self._clock())
        with self._lock:
            self._reports[report.id] = report
            mine = [r for r in self._reports.values() if r.conversation_id == conversation_id]
            for old in mine[: max(0, len(mine) - self.max_per_conversation)]:
                del self._reports[old.id]
        return report

    def get(self, report_id: str) -> Report | None:
        with self._lock:
            return self._reports.get(report_id)

    def list(self, conversation_id: str) -> list[Report]:
        with self._lock:
            return [r for r in self._reports.values() if r.conversation_id == conversation_id]

    def owned(self, report_id: str, conversation_id: str) -> Report:
        report = self.get(report_id)
        if report is None or report.conversation_id != conversation_id:
            raise ReportError("report-not-found", "Report not found.", 404)
        return report

    def check_captures(self, report_id: str, conversation_id: str, captures: dict[str, bytes]) -> Report:
        """Validate an upload against the plan; raises before anything is built (R10)."""
        report = self.owned(report_id, conversation_id)
        expected = {shot.id for shot in report.plan.shots}
        unknown = sorted(set(captures) - expected)
        if unknown:
            raise ReportError("unknown-shot", f"Unknown shot id {unknown[0]!r}.", 422)
        missing = sorted(expected - set(captures))
        if missing:
            raise ReportError("missing-shot", f"Missing capture for {missing[0]!r}.", 422)
        total = 0
        for shot_id, data in captures.items():
            if not data.startswith(PNG_MAGIC):
                raise ReportError("not-png", f"Capture {shot_id!r} is not a PNG.", 422)
            if len(data) > self.max_capture_bytes:
                raise ReportError("capture-too-large", f"Capture {shot_id!r} is larger than 2 MB.", 422)
            total += len(data)
        if total > self.max_total_capture_bytes:
            raise ReportError("captures-too-large", "Captures exceed the per-report size limit.", 422)
        return report

    def set_pdf(self, report_id: str, pdf: bytes, *, pages: int) -> Report | None:
        with self._lock:
            report = self._reports.get(report_id)
            if report is None:
                return None
            if len(pdf) > self.max_pdf_bytes:
                report.status, report.pdf, report.pages, report.error = "failed", None, 0, "pdf-too-large"
            else:
                report.status, report.pdf, report.pages, report.error = "ready", pdf, pages, None
            return report

    def mark_failed(self, report_id: str, reason: str) -> Report | None:
        with self._lock:
            report = self._reports.get(report_id)
            if report is not None:
                report.status, report.pdf, report.error = "failed", None, reason
            return report
