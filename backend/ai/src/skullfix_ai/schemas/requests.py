"""Direct mechanical and AI-assisted request envelopes."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, JsonValue

from .commands import ReconstructionMockParameters
from .common import (
    CandidateId,
    CandidateRevisionId,
    CaseId,
    ContractModel,
    ConversationId,
    NonEmptyString,
    RequestId,
    SourceAnatomyRevisionId,
)
from .spatial import SelectionReference


class ReconstructionMockMechanicalRequest(ContractModel):
    """Approved initial-generation request; no existing candidate is required."""

    request_id: RequestId
    case_id: CaseId
    operation_id: Literal["generate.candidate"]
    source_anatomy_revision_id: SourceAnatomyRevisionId
    selection: SelectionReference | None = None
    parameters: ReconstructionMockParameters


class UnavailableCandidateOperationRequest(ContractModel):
    """Envelope for known candidate operations whose real contracts are absent."""

    request_id: RequestId
    case_id: CaseId
    operation_id: Literal[
        "measure.candidate",
        "inspect.candidate",
        "edit.local",
    ]
    candidate_id: CandidateId
    expected_revision_id: CandidateRevisionId
    selection: SelectionReference | None = None
    parameters: dict[str, JsonValue]


class UnavailableComparisonRequest(ContractModel):
    """Comparison envelope only; comparison parameters remain unresolved."""

    request_id: RequestId
    case_id: CaseId
    operation_id: Literal["compare.revisions"]
    candidate_id: CandidateId
    revision_ids: Annotated[
        list[CandidateRevisionId], Field(min_length=2, max_length=2)
    ]
    parameters: dict[str, JsonValue]


DirectMechanicalRequest = Annotated[
    ReconstructionMockMechanicalRequest
    | UnavailableCandidateOperationRequest
    | UnavailableComparisonRequest,
    Field(discriminator="operation_id"),
]


class AIAssistedRequest(ContractModel):
    """AI request before operation selection."""

    request_id: RequestId
    case_id: CaseId
    conversation_id: ConversationId
    message: NonEmptyString
    source_anatomy_revision_id: SourceAnatomyRevisionId | None = None
    candidate_id: CandidateId | None = None
    expected_revision_id: CandidateRevisionId | None = None
    comparison_revision_ids: Annotated[
        list[CandidateRevisionId], Field(min_length=2, max_length=2)
    ] | None = None
    selection: SelectionReference | None = None

