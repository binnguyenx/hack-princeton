"""Typed terminal operation-result envelopes."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from .artifacts import PublicArtifactReference
from .commands import ReconstructionMockInputRevisions
from .common import (
    CandidateId,
    CandidateRevisionId,
    CaseId,
    ContractModel,
    Limitation,
    OperationId,
    ProvenanceSource,
    RequestId,
    RunId,
    StructuredError,
    SourceAnatomyRevisionId,
)
from .spatial import SpatialMetadata


class ResultInputRevisions(ContractModel):
    """Revision context retained even when no operation was selected."""

    source_anatomy_revision_id: SourceAnatomyRevisionId | None = None
    expected_revision_id: CandidateRevisionId | None = None
    comparison_revision_ids: Annotated[
        list[CandidateRevisionId], Field(min_length=2, max_length=2)
    ] | None = None


class ReconstructionMockOutput(ContractModel):
    """Mock output metadata without measurements or quality claims."""

    kind: Literal["candidate-generation"]
    spatial_metadata: SpatialMetadata


class CompletedReconstructionMockResult(ContractModel):
    run_id: RunId
    request_id: RequestId
    case_id: CaseId
    operation_id: Literal["generate.candidate"]
    status: Literal["completed"]
    input_revisions: ReconstructionMockInputRevisions
    output_candidate_id: CandidateId
    output_revision_id: CandidateRevisionId
    artifacts: Annotated[list[PublicArtifactReference], Field(min_length=1)]
    output: ReconstructionMockOutput
    source: Literal["mock", "test-double"]
    limitations: Annotated[list[Limitation], Field(min_length=1)]
    error: Literal[None]


class UnsuccessfulOperationResult(ContractModel):
    """Terminal non-success result; artifacts, if any, are non-authoritative."""

    run_id: RunId
    request_id: RequestId
    case_id: CaseId
    operation_id: OperationId | None
    status: Literal["unsupported", "unavailable", "stale", "failed"]
    input_revisions: ResultInputRevisions
    output_candidate_id: Literal[None]
    output_revision_id: Literal[None]
    artifacts: list[PublicArtifactReference]
    output: Literal[None]
    source: ProvenanceSource | None
    limitations: list[Limitation]
    error: StructuredError


OperationResult = Annotated[
    CompletedReconstructionMockResult | UnsuccessfulOperationResult,
    Field(discriminator="status"),
]

