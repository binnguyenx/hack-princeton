"""Canonical structurally validated operation commands."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import (
    CaseId,
    ContractModel,
    NonEmptyString,
    RequestId,
    SourceAnatomyRevisionId,
)
from .spatial import SelectionReference


class ReconstructionMockParameters(ContractModel):
    """Approved provisional parameters for deterministic fixture generation."""

    fixture_variant: NonEmptyString


class ReconstructionMockInputRevisions(ContractModel):
    source_anatomy_revision_id: SourceAnatomyRevisionId


class ReconstructionMockReferences(ContractModel):
    selection: SelectionReference | None = None


class ReconstructionMockCommand(ContractModel):
    """Canonical mock command shared by direct and AI request paths.

    Validation proves structure only. Application code must still establish
    case membership, capability availability, authoritative context, revision
    freshness, idempotency, and execution permission.
    """

    request_id: RequestId
    case_id: CaseId
    operation_id: Literal["generate.candidate"]
    input_revisions: ReconstructionMockInputRevisions
    references: ReconstructionMockReferences = Field(
        default_factory=ReconstructionMockReferences
    )
    parameters: ReconstructionMockParameters

