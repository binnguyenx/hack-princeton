"""Spatial metadata and immutable geometry references."""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import Field, field_validator, model_validator

from .common import (
    CandidateId,
    CandidateRevisionId,
    ContractModel,
    NonEmptyString,
    RegionId,
    SelectionId,
    SourceAnatomyRevisionId,
)


UnitName = NonEmptyString
CoordinateFrameName = NonEmptyString
FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Matrix4x4 = list[list[FiniteNumber]]


class CoordinateTransform(ContractModel):
    """A row-major 4×4 transform with an explicit direction."""

    from_frame: CoordinateFrameName
    to_frame: CoordinateFrameName
    matrix: Matrix4x4

    @field_validator("matrix")
    @classmethod
    def require_four_by_four(cls, matrix: Matrix4x4) -> Matrix4x4:
        if len(matrix) != 4 or any(len(row) != 4 for row in matrix):
            raise ValueError("matrix must contain exactly four rows of four values")
        return matrix


class SpatialMetadata(ContractModel):
    """Declared spatial context; it does not prove geometric correctness."""

    units: UnitName
    coordinate_frame: CoordinateFrameName
    transforms: Annotated[list[CoordinateTransform], Field(min_length=1)]


class SourceAnatomyReference(ContractModel):
    source_anatomy_revision_id: SourceAnatomyRevisionId


class CandidateReference(ContractModel):
    candidate_id: CandidateId


class CandidateRevisionReference(ContractModel):
    candidate_id: CandidateId
    revision_id: CandidateRevisionId


class SelectionKind(str, Enum):
    SOURCE_ANATOMY = "source-anatomy"
    PERSISTED_REGION = "persisted-region"
    REGION = "region"


class SelectionReference(ContractModel):
    selection_id: SelectionId
    kind: SelectionKind
    reference_id: NonEmptyString | None = None
    geometry_revision_id: NonEmptyString
    coordinate_frame: CoordinateFrameName

    @model_validator(mode="after")
    def require_persisted_reference_identity(self) -> "SelectionReference":
        if self.kind in {SelectionKind.PERSISTED_REGION, SelectionKind.REGION}:
            if self.reference_id is None:
                raise ValueError("region selections require reference_id")
        return self


class PersistedRegionReference(ContractModel):
    region_id: RegionId
    geometry_revision_id: NonEmptyString
    coordinate_frame: CoordinateFrameName


class OperationInputRevisions(ContractModel):
    """Revision inputs represented without testing freshness."""

    source_anatomy_revision_id: SourceAnatomyRevisionId | None = None
    expected_revision_id: CandidateRevisionId | None = None
    comparison_revision_ids: Annotated[
        list[CandidateRevisionId], Field(min_length=2, max_length=2)
    ] | None = None

    @model_validator(mode="after")
    def require_at_least_one_revision(self) -> "OperationInputRevisions":
        if (
            self.source_anatomy_revision_id is None
            and self.expected_revision_id is None
            and self.comparison_revision_ids is None
        ):
            raise ValueError("at least one input revision reference is required")
        return self

