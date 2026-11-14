"""Read contracts for the shipped TypeScript ProjectManifest, not demo records.

Camel-case aliases match app/src/domain/types.ts and io/projectPackage.ts.
Unknown additive app fields are retained, rather than silently discarded.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from .common import NonEmptyString


FiniteNumber = Annotated[float, Field(allow_inf_nan=False)]
Pose16 = Annotated[list[FiniteNumber], Field(min_length=16, max_length=16)]
Vector3 = Annotated[list[FiniteNumber], Field(min_length=3, max_length=3)]


class AppReadModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True, serialize_by_alias=True)


class AppUser(AppReadModel):
    id: NonEmptyString
    display_name: str = Field(alias="displayName")


class AppProject(AppReadModel):
    id: NonEmptyString
    owner_user_id: NonEmptyString = Field(alias="ownerUserId")
    name: str


class AppCase(AppReadModel):
    id: NonEmptyString
    project_id: NonEmptyString = Field(alias="projectId")
    name: str


class AppSpatialMeta(AppReadModel):
    units: NonEmptyString
    space: str | None = None
    sizes: Annotated[list[Annotated[int, Field(strict=True, gt=0)]], Field(min_length=3, max_length=3)]
    spacings: Vector3
    bbox_mm: Vector3 = Field(alias="bboxMm")


class AppSourceAnatomy(AppReadModel):
    object_id: NonEmptyString = Field(alias="objectId")
    sample_id: NonEmptyString = Field(alias="sampleId")
    volume_id: NonEmptyString = Field(alias="volumeId")
    spatial: AppSpatialMeta
    # Portable packages permit an empty hash; live imports populate it. No prefix conversion.
    volume_hash: str = Field(alias="volumeHash")


class AppSample(AppReadModel):
    id: NonEmptyString
    case_id: NonEmptyString = Field(alias="caseId")
    display_name: str | None = Field(default=None, alias="displayName")
    license: str
    spatially_verified: bool = Field(alias="spatiallyVerified", strict=True)
    source_anatomy: AppSourceAnatomy = Field(alias="sourceAnatomy")


class AppCandidate(AppReadModel):
    object_id: NonEmptyString = Field(alias="objectId")
    sample_id: NonEmptyString = Field(alias="sampleId")
    current_revision_id: NonEmptyString = Field(alias="currentRevisionId")


class AppCandidateRevision(AppReadModel):
    id: NonEmptyString
    candidate_id: NonEmptyString = Field(alias="candidateId")
    order: Annotated[int, Field(strict=True, ge=0)]
    volume_id: NonEmptyString = Field(alias="volumeId")
    pose: Pose16
    volume_hash: str = Field(alias="volumeHash")


class AppProjectManifest(AppReadModel):
    format_version: Literal[1] = Field(alias="formatVersion")
    user: AppUser
    project: AppProject
    cases: list[AppCase]
    samples: list[AppSample]
    candidates: list[AppCandidate]
    revisions: list[AppCandidateRevision]
    view_state: dict[str, JsonValue] = Field(alias="viewState")


class AppObjectContext(BaseModel):
    """A point-in-time app read; it is not a lock or a demo mutation command."""

    project_id: str
    case_id: str
    sample_id: str
    selected_object_id: str
    source_object_id: str
    candidate_id: str | None
    revision_id: str | None
    volume_id: str
    volume_hash: str
    pose: Pose16 | None
    spatial: AppSpatialMeta
    spatially_verified: bool
