"""Shared event payloads; SSE transport and ordering are runtime concerns."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from .common import CaseId, ContractModel, RequestId, RunId
from .results import OperationResult


class ProgressEvent(ContractModel):
    event: Literal["progress"]
    run_id: RunId
    request_id: RequestId
    case_id: CaseId
    step: Literal["accepted", "executing", "ready-to-commit"]


class TerminalResultEvent(ContractModel):
    event: Literal["result"]
    result: OperationResult


OperationEvent = Annotated[
    ProgressEvent | TerminalResultEvent,
    Field(discriminator="event"),
]

