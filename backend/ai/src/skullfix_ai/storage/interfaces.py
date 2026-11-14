"""SQLite-independent application storage records and interfaces."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Protocol, Sequence

from pydantic import JsonValue

from skullfix_ai.schemas import (
    ProvenanceSource,
    PublicArtifactReference,
    RunLifecycleState,
    SpatialMetadata,
    StructuredError,
    TerminalStatus,
)


class StorageError(Exception):
    """Base class for stable application-storage failures."""


class StorageNotFoundError(StorageError):
    pass


class StorageConflictError(StorageError):
    pass


class StorageSerializationError(StorageError):
    pass


class ReferenceMismatchError(StorageError):
    pass


class StaleRevisionError(StorageError):
    def __init__(self, expected_revision_id: str, actual_revision_id: str) -> None:
        self.expected_revision_id = expected_revision_id
        self.actual_revision_id = actual_revision_id
        super().__init__(
            f"expected current revision {expected_revision_id!r}, "
            f"found {actual_revision_id!r}"
        )


class RequestIdConflictError(StorageConflictError):
    code = "request-id-conflict"


class InvalidRunTransitionError(StorageConflictError):
    pass


class ArtifactStorageError(StorageError):
    pass


class ArtifactIntegrityError(ArtifactStorageError):
    pass


class PathContainmentError(ArtifactStorageError):
    pass


class ArtifactAuthorityError(ArtifactStorageError):
    pass


class ArtifactAuthority(str, Enum):
    PENDING = "pending"
    AUTHORITATIVE = "authoritative"
    NON_AUTHORITATIVE = "non-authoritative"


class ReconciliationState(str, Enum):
    NOT_REQUIRED = "not-required"
    PENDING = "pending"
    RETAINED = "retained"
    DELETED = "deleted"


@dataclass(frozen=True, slots=True)
class StoredArtifact:
    artifact_id: str
    content_hash: str
    media_type: str
    retrieval_url: str
    relative_path: str

    def to_public_reference(self) -> PublicArtifactReference:
        return PublicArtifactReference(
            artifact_id=self.artifact_id,
            content_hash=self.content_hash,
            media_type=self.media_type,
            retrieval_url=self.retrieval_url,
        )


@dataclass(frozen=True, slots=True)
class ArtifactRecord:
    case_id: str
    artifact: StoredArtifact
    provenance: ProvenanceSource
    limitations: tuple[str, ...]
    authority: ArtifactAuthority
    reconciliation_state: ReconciliationState
    non_authoritative_reason: str | None = None
    produced_by_run_id: str | None = None

    def to_public_reference(self) -> PublicArtifactReference:
        return self.artifact.to_public_reference()


@dataclass(frozen=True, slots=True)
class ArtifactCleanupClaim:
    """Durable authorization to delete one non-authoritative artifact."""

    artifact_id: str
    claim_token: str
    artifact: StoredArtifact


@dataclass(frozen=True, slots=True)
class CaseRecord:
    case_id: str
    label: str


@dataclass(frozen=True, slots=True)
class SourceAnatomyRecord:
    case_id: str
    revision_id: str
    artifact_id: str
    spatial_metadata: SpatialMetadata


@dataclass(frozen=True, slots=True)
class CandidateRecord:
    case_id: str
    candidate_id: str
    source_anatomy_revision_id: str
    current_revision_id: str


@dataclass(frozen=True, slots=True)
class CandidateRevisionRecord:
    case_id: str
    candidate_id: str
    revision_id: str
    parent_revision_id: str | None
    operation_id: str
    validated_parameters: dict[str, JsonValue]
    artifact_id: str
    spatial_metadata: SpatialMetadata
    provenance: ProvenanceSource


@dataclass(frozen=True, slots=True)
class NewCandidateRevision:
    revision_id: str
    parent_revision_id: str | None
    operation_id: str
    validated_parameters: dict[str, JsonValue]
    artifact_id: str
    spatial_metadata: SpatialMetadata
    provenance: ProvenanceSource


@dataclass(frozen=True, slots=True)
class ReviewResultRecord:
    review_result_id: str
    case_id: str
    candidate_id: str
    revision_id: str
    operation_id: str
    method_id: str
    output: dict[str, JsonValue]
    provenance: ProvenanceSource
    limitations: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class CandidateHistory:
    candidate: CandidateRecord
    revisions: tuple[CandidateRevisionRecord, ...]
    reviews: tuple[ReviewResultRecord, ...]


@dataclass(frozen=True, slots=True)
class RequestReservation:
    case_id: str
    request_id: str
    canonical_identity: str
    run_id: str | None


@dataclass(frozen=True, slots=True)
class OperationRunRecord:
    run_id: str
    case_id: str
    request_id: str
    operation_id: str | None
    state: RunLifecycleState
    terminal_status: TerminalStatus | None
    input_revisions: dict[str, JsonValue]
    output: dict[str, JsonValue] | None
    error: StructuredError | None


@dataclass(frozen=True, slots=True)
class OperationRunClaim:
    """Result of atomically claiming a canonical command and its run."""

    owner: bool
    run: OperationRunRecord


class ArtifactStore(Protocol):
    @property
    def root(self) -> Path: ...

    def write_bytes(
        self, artifact_id: str, content: bytes, media_type: str
    ) -> StoredArtifact: ...

    def ingest_file(
        self, artifact_id: str, source: Path, media_type: str
    ) -> StoredArtifact: ...

    def read_bytes(self, artifact: StoredArtifact) -> bytes: ...

    def delete_claimed(self, claim: ArtifactCleanupClaim) -> bool: ...


class ApplicationStorage(Protocol):
    @property
    def schema_version(self) -> int: ...

    def initialize(self) -> None: ...

    def close(self) -> None: ...

    def create_case(self, record: CaseRecord) -> None: ...

    def get_case(self, case_id: str) -> CaseRecord: ...

    def list_cases(self) -> Sequence[CaseRecord]: ...

    def record_artifact(self, record: ArtifactRecord) -> None: ...

    def get_artifact(self, artifact_id: str) -> ArtifactRecord: ...

    def list_non_authoritative_artifacts(self) -> Sequence[ArtifactRecord]: ...

    def mark_artifact_non_authoritative(
        self, artifact_id: str, reason: str
    ) -> ArtifactRecord: ...

    def mark_artifact_reconciled(
        self, artifact_id: str, state: ReconciliationState
    ) -> ArtifactRecord: ...

    def claim_artifact_cleanup(
        self, artifact_id: str, claim_token: str
    ) -> ArtifactCleanupClaim: ...

    def complete_artifact_cleanup(
        self,
        artifact_id: str,
        claim_token: str,
        state: ReconciliationState,
    ) -> ArtifactRecord: ...

    def create_source_anatomy(self, record: SourceAnatomyRecord) -> None: ...

    def get_source_anatomy(self, revision_id: str) -> SourceAnatomyRecord: ...

    def create_initial_candidate(
        self,
        case_id: str,
        candidate_id: str,
        source_anatomy_revision_id: str,
        revision: NewCandidateRevision,
    ) -> CandidateRecord: ...

    def commit_child_revision(
        self,
        case_id: str,
        candidate_id: str,
        expected_revision_id: str,
        revision: NewCandidateRevision,
    ) -> CandidateRevisionRecord: ...

    def get_candidate(self, candidate_id: str) -> CandidateRecord: ...

    def get_candidate_history(self, candidate_id: str) -> CandidateHistory: ...

    def add_review_result(self, record: ReviewResultRecord) -> None: ...

    def list_review_results(self, revision_id: str) -> Sequence[ReviewResultRecord]: ...

    def list_current_review_results(
        self, candidate_id: str
    ) -> Sequence[ReviewResultRecord]: ...

    def reserve_request(
        self, case_id: str, request_id: str, canonical_identity: str
    ) -> RequestReservation: ...

    def create_run(self, record: OperationRunRecord) -> None: ...

    def claim_operation_run(
        self, record: OperationRunRecord, canonical_identity: str
    ) -> OperationRunClaim: ...

    def get_run(self, run_id: str) -> OperationRunRecord: ...

    def transition_run(
        self,
        run_id: str,
        state: RunLifecycleState,
        *,
        terminal_status: TerminalStatus | None = None,
        output: dict[str, JsonValue] | None = None,
        error: StructuredError | None = None,
    ) -> OperationRunRecord: ...
