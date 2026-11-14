"""Authoritative SQLite application storage."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from pydantic import JsonValue

from skullfix_ai.schemas import (
    ProvenanceSource,
    RunLifecycleState,
    SpatialMetadata,
    StructuredError,
    TerminalStatus,
)

from .interfaces import (
    ArtifactAuthority,
    ArtifactAuthorityError,
    ArtifactCleanupClaim,
    ArtifactRecord,
    CandidateHistory,
    CandidateRecord,
    CandidateRevisionRecord,
    CaseRecord,
    InvalidRunTransitionError,
    NewCandidateRevision,
    OperationRunRecord,
    OperationRunClaim,
    ReconciliationState,
    ReferenceMismatchError,
    RequestIdConflictError,
    RequestReservation,
    ReviewResultRecord,
    SourceAnatomyRecord,
    StaleRevisionError,
    StorageConflictError,
    StorageError,
    StorageNotFoundError,
    StorageSerializationError,
    StoredArtifact,
)


SCHEMA_VERSION = 2

SCHEMA_SQL = """
CREATE TABLE cases (
    case_id TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

CREATE TABLE artifacts (
    artifact_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    media_type TEXT NOT NULL,
    retrieval_url TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    provenance TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    authority TEXT NOT NULL CHECK (
        authority IN ('pending', 'authoritative', 'non-authoritative')
    ),
    reconciliation_state TEXT NOT NULL CHECK (
        reconciliation_state IN ('not-required', 'pending', 'retained', 'deleted')
    ),
    non_authoritative_reason TEXT,
    produced_by_run_id TEXT,
    cleanup_token TEXT,
    UNIQUE (case_id, artifact_id),
    FOREIGN KEY (case_id) REFERENCES cases(case_id),
    FOREIGN KEY (produced_by_run_id) REFERENCES operation_runs(run_id)
);

CREATE TABLE source_anatomy_revisions (
    revision_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    spatial_metadata_json TEXT NOT NULL,
    UNIQUE (case_id, revision_id),
    FOREIGN KEY (case_id) REFERENCES cases(case_id),
    FOREIGN KEY (case_id, artifact_id)
        REFERENCES artifacts(case_id, artifact_id)
);

CREATE TABLE candidates (
    candidate_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    source_anatomy_revision_id TEXT NOT NULL,
    current_revision_id TEXT NOT NULL,
    UNIQUE (case_id, candidate_id),
    FOREIGN KEY (case_id) REFERENCES cases(case_id),
    FOREIGN KEY (case_id, source_anatomy_revision_id)
        REFERENCES source_anatomy_revisions(case_id, revision_id),
    FOREIGN KEY (case_id, candidate_id, current_revision_id)
        REFERENCES candidate_revisions(case_id, candidate_id, revision_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE candidate_revisions (
    revision_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    parent_revision_id TEXT,
    operation_id TEXT NOT NULL,
    validated_parameters_json TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    spatial_metadata_json TEXT NOT NULL,
    provenance TEXT NOT NULL,
    UNIQUE (case_id, candidate_id, revision_id),
    UNIQUE (candidate_id, revision_id),
    FOREIGN KEY (case_id, candidate_id)
        REFERENCES candidates(case_id, candidate_id)
        DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (candidate_id, parent_revision_id)
        REFERENCES candidate_revisions(candidate_id, revision_id)
        DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (case_id, artifact_id)
        REFERENCES artifacts(case_id, artifact_id)
);

CREATE TABLE review_results (
    review_result_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    output_json TEXT NOT NULL,
    provenance TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    FOREIGN KEY (case_id, candidate_id, revision_id)
        REFERENCES candidate_revisions(case_id, candidate_id, revision_id)
);

CREATE TABLE request_reservations (
    case_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    canonical_identity TEXT NOT NULL,
    run_id TEXT,
    PRIMARY KEY (case_id, request_id),
    UNIQUE (run_id),
    FOREIGN KEY (case_id) REFERENCES cases(case_id)
);

CREATE TABLE operation_runs (
    run_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    operation_id TEXT,
    state TEXT NOT NULL,
    terminal_status TEXT,
    input_revisions_json TEXT NOT NULL,
    output_json TEXT,
    error_json TEXT,
    FOREIGN KEY (case_id, request_id)
        REFERENCES request_reservations(case_id, request_id)
);
"""


def _json_dump(value: object) -> str:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise StorageSerializationError(
            "storage value is not valid finite JSON"
        ) from error


class SQLiteApplicationStorage:
    """SQLite implementation of the application-storage interface."""

    def __init__(self, database_path: Path) -> None:
        self._database_path = database_path.expanduser().resolve()
        self._connection: sqlite3.Connection | None = None

    @property
    def schema_version(self) -> int:
        connection = self._require_connection()
        return int(connection.execute("PRAGMA user_version").fetchone()[0])

    def initialize(self) -> None:
        if self._connection is None:
            self._database_path.parent.mkdir(parents=True, exist_ok=True)
            self._connection = sqlite3.connect(
                self._database_path,
                isolation_level=None,
            )
            self._connection.row_factory = sqlite3.Row
            self._connection.execute("PRAGMA foreign_keys = ON")
            self._connection.execute("PRAGMA busy_timeout = 5000")

        version = self.schema_version
        if version == 0:
            with self._transaction() as connection:
                connection.executescript(SCHEMA_SQL)
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        elif version == 1:
            with self._transaction() as connection:
                connection.execute(
                    "ALTER TABLE artifacts ADD COLUMN cleanup_token TEXT"
                )
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        elif version != SCHEMA_VERSION:
            raise StorageError(
                f"unsupported application schema version {version}; "
                f"expected {SCHEMA_VERSION}"
            )

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def create_case(self, record: CaseRecord) -> None:
        try:
            with self._transaction() as connection:
                connection.execute(
                    "INSERT INTO cases(case_id, label) VALUES (?, ?)",
                    (record.case_id, record.label),
                )
        except sqlite3.IntegrityError as error:
            raise StorageConflictError(
                f"case {record.case_id!r} already exists"
            ) from error

    def get_case(self, case_id: str) -> CaseRecord:
        row = self._require_connection().execute(
            "SELECT case_id, label FROM cases WHERE case_id = ?",
            (case_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(f"case {case_id!r} does not exist")
        return CaseRecord(case_id=row["case_id"], label=row["label"])

    def list_cases(self) -> tuple[CaseRecord, ...]:
        rows = self._require_connection().execute(
            "SELECT case_id, label FROM cases ORDER BY case_id"
        ).fetchall()
        return tuple(
            CaseRecord(case_id=row["case_id"], label=row["label"])
            for row in rows
        )

    def record_artifact(self, record: ArtifactRecord) -> None:
        try:
            with self._transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO artifacts(
                        artifact_id, case_id, content_hash, media_type,
                        retrieval_url, relative_path, provenance,
                        limitations_json, authority, reconciliation_state,
                        non_authoritative_reason, produced_by_run_id,
                        cleanup_token
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                    """,
                    (
                        record.artifact.artifact_id,
                        record.case_id,
                        record.artifact.content_hash,
                        record.artifact.media_type,
                        record.artifact.retrieval_url,
                        record.artifact.relative_path,
                        record.provenance.value,
                        _json_dump(list(record.limitations)),
                        record.authority.value,
                        record.reconciliation_state.value,
                        record.non_authoritative_reason,
                        record.produced_by_run_id,
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise StorageConflictError(
                f"artifact {record.artifact.artifact_id!r} could not be recorded"
            ) from error

    def get_artifact(self, artifact_id: str) -> ArtifactRecord:
        row = self._require_connection().execute(
            "SELECT * FROM artifacts WHERE artifact_id = ?",
            (artifact_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(f"artifact {artifact_id!r} does not exist")
        return self._artifact_from_row(row)

    def list_non_authoritative_artifacts(self) -> tuple[ArtifactRecord, ...]:
        rows = self._require_connection().execute(
            """
            SELECT * FROM artifacts
            WHERE authority = ? AND reconciliation_state = ?
            ORDER BY artifact_id
            """,
            (
                ArtifactAuthority.NON_AUTHORITATIVE.value,
                ReconciliationState.PENDING.value,
            ),
        ).fetchall()
        return tuple(self._artifact_from_row(row) for row in rows)

    def mark_artifact_non_authoritative(
        self, artifact_id: str, reason: str
    ) -> ArtifactRecord:
        self._mark_artifact_non_authoritative(artifact_id, reason)
        return self.get_artifact(artifact_id)

    def mark_artifact_reconciled(
        self, artifact_id: str, state: ReconciliationState
    ) -> ArtifactRecord:
        raise ArtifactAuthorityError(
            "reconciliation requires an artifact cleanup claim"
        )

    def claim_artifact_cleanup(
        self, artifact_id: str, claim_token: str
    ) -> ArtifactCleanupClaim:
        if not claim_token:
            raise ArtifactAuthorityError("cleanup claim token cannot be empty")
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT * FROM artifacts WHERE artifact_id = ?",
                (artifact_id,),
            ).fetchone()
            if row is None:
                raise StorageNotFoundError(
                    f"artifact {artifact_id!r} does not exist"
                )
            if (
                row["authority"] != ArtifactAuthority.NON_AUTHORITATIVE.value
                or row["reconciliation_state"]
                != ReconciliationState.PENDING.value
                or row["cleanup_token"] is not None
            ):
                raise ArtifactAuthorityError(
                    "artifact is not eligible for cleanup"
                )
            connection.execute(
                "UPDATE artifacts SET cleanup_token = ? WHERE artifact_id = ?",
                (claim_token, artifact_id),
            )
        artifact = self.get_artifact(artifact_id)
        return ArtifactCleanupClaim(
            artifact_id=artifact_id,
            claim_token=claim_token,
            artifact=artifact.artifact,
        )

    def complete_artifact_cleanup(
        self,
        artifact_id: str,
        claim_token: str,
        state: ReconciliationState,
    ) -> ArtifactRecord:
        if state not in {
            ReconciliationState.RETAINED,
            ReconciliationState.DELETED,
        }:
            raise ArtifactAuthorityError(
                "reconciliation must explicitly retain or delete content"
            )
        with self._transaction() as connection:
            row = connection.execute(
                """
                SELECT authority, reconciliation_state, cleanup_token
                FROM artifacts WHERE artifact_id = ?
                """,
                (artifact_id,),
            ).fetchone()
            if row is None:
                raise StorageNotFoundError(
                    f"artifact {artifact_id!r} does not exist"
                )
            if row["authority"] != ArtifactAuthority.NON_AUTHORITATIVE.value:
                raise ArtifactAuthorityError(
                    "only non-authoritative artifacts can be reconciled"
                )
            if (
                row["reconciliation_state"] != ReconciliationState.PENDING.value
                or row["cleanup_token"] != claim_token
            ):
                raise ArtifactAuthorityError(
                    "artifact cleanup claim is missing or no longer current"
                )
            connection.execute(
                """
                UPDATE artifacts
                SET reconciliation_state = ?, cleanup_token = NULL
                WHERE artifact_id = ?
                """,
                (state.value, artifact_id),
            )
        return self.get_artifact(artifact_id)

    def create_source_anatomy(self, record: SourceAnatomyRecord) -> None:
        try:
            with self._transaction() as connection:
                self._require_artifact_in_case(connection, record.case_id, record.artifact_id)
                artifact = connection.execute(
                    "SELECT case_id FROM artifacts WHERE artifact_id = ?",
                    (record.artifact_id,),
                ).fetchone()
                if artifact is None:
                    raise StorageNotFoundError(
                        f"artifact {record.artifact_id!r} does not exist"
                    )
                if artifact["case_id"] != record.case_id:
                    raise StorageConflictError(
                        "source anatomy artifact belongs to another case"
                    )
                connection.execute(
                    """
                    INSERT INTO source_anatomy_revisions(
                        revision_id, case_id, artifact_id, spatial_metadata_json
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        record.revision_id,
                        record.case_id,
                        record.artifact_id,
                        record.spatial_metadata.model_dump_json(),
                    ),
                )
                self._mark_artifact_authoritative(connection, record.artifact_id)
        except sqlite3.IntegrityError as error:
            raise StorageConflictError(
                f"source anatomy {record.revision_id!r} could not be created"
            ) from error

    def get_source_anatomy(self, revision_id: str) -> SourceAnatomyRecord:
        row = self._require_connection().execute(
            "SELECT * FROM source_anatomy_revisions WHERE revision_id = ?",
            (revision_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(
                f"source anatomy revision {revision_id!r} does not exist"
            )
        return SourceAnatomyRecord(
            case_id=row["case_id"],
            revision_id=row["revision_id"],
            artifact_id=row["artifact_id"],
            spatial_metadata=SpatialMetadata.model_validate_json(
                row["spatial_metadata_json"]
            ),
        )

    def create_initial_candidate(
        self,
        case_id: str,
        candidate_id: str,
        source_anatomy_revision_id: str,
        revision: NewCandidateRevision,
    ) -> CandidateRecord:
        try:
            if revision.parent_revision_id is not None:
                raise ReferenceMismatchError(
                    "an initial candidate revision cannot have a parent"
                )
            with self._transaction() as connection:
                self._require_source_in_case(
                    connection, case_id, source_anatomy_revision_id
                )
                self._require_artifact_in_case(
                    connection, case_id, revision.artifact_id
                )
                connection.execute(
                    """
                    INSERT INTO candidates(
                        candidate_id, case_id, source_anatomy_revision_id,
                        current_revision_id
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        candidate_id,
                        case_id,
                        source_anatomy_revision_id,
                        revision.revision_id,
                    ),
                )
                self._insert_revision(
                    connection, case_id, candidate_id, revision
                )
                self._mark_artifact_authoritative(
                    connection, revision.artifact_id
                )
        except sqlite3.IntegrityError as error:
            self._mark_artifact_non_authoritative(
                revision.artifact_id, "initial-candidate-commit-failed"
            )
            raise StorageConflictError(
                f"candidate {candidate_id!r} could not be created"
            ) from error
        except StorageError:
            self._mark_artifact_non_authoritative(
                revision.artifact_id, "initial-candidate-commit-failed"
            )
            raise
        return self.get_candidate(candidate_id)

    def commit_child_revision(
        self,
        case_id: str,
        candidate_id: str,
        expected_revision_id: str,
        revision: NewCandidateRevision,
    ) -> CandidateRevisionRecord:
        try:
            if revision.parent_revision_id != expected_revision_id:
                raise ReferenceMismatchError(
                    "child parent_revision_id must equal expected_revision_id"
                )
            with self._transaction() as connection:
                candidate = connection.execute(
                    """
                    SELECT * FROM candidates
                    WHERE case_id = ? AND candidate_id = ?
                    """,
                    (case_id, candidate_id),
                ).fetchone()
                if candidate is None:
                    raise ReferenceMismatchError(
                        "candidate does not belong to the requested case"
                    )
                expected = connection.execute(
                    """
                    SELECT candidate_id FROM candidate_revisions
                    WHERE revision_id = ?
                    """,
                    (expected_revision_id,),
                ).fetchone()
                if expected is None or expected["candidate_id"] != candidate_id:
                    raise ReferenceMismatchError(
                        "expected revision does not belong to the candidate"
                    )
                actual_revision_id = candidate["current_revision_id"]
                if actual_revision_id != expected_revision_id:
                    raise StaleRevisionError(
                        expected_revision_id, actual_revision_id
                    )
                self._require_artifact_in_case(
                    connection, case_id, revision.artifact_id
                )
                self._insert_revision(
                    connection, case_id, candidate_id, revision
                )
                updated = connection.execute(
                    """
                    UPDATE candidates
                    SET current_revision_id = ?
                    WHERE case_id = ? AND candidate_id = ?
                      AND current_revision_id = ?
                    """,
                    (
                        revision.revision_id,
                        case_id,
                        candidate_id,
                        expected_revision_id,
                    ),
                )
                if updated.rowcount != 1:
                    current = connection.execute(
                        """
                        SELECT current_revision_id FROM candidates
                        WHERE candidate_id = ?
                        """,
                        (candidate_id,),
                    ).fetchone()
                    raise StaleRevisionError(
                        expected_revision_id, current["current_revision_id"]
                    )
                self._mark_artifact_authoritative(
                    connection, revision.artifact_id
                )
        except sqlite3.IntegrityError as error:
            self._mark_artifact_non_authoritative(
                revision.artifact_id, "child-revision-commit-failed"
            )
            raise StorageConflictError(
                f"revision {revision.revision_id!r} could not be committed"
            ) from error
        except StorageError as error:
            reason = (
                "stale-revision"
                if isinstance(error, StaleRevisionError)
                else "child-revision-commit-failed"
            )
            self._mark_artifact_non_authoritative(revision.artifact_id, reason)
            raise
        return self._get_revision(revision.revision_id)

    def get_candidate(self, candidate_id: str) -> CandidateRecord:
        row = self._require_connection().execute(
            "SELECT * FROM candidates WHERE candidate_id = ?",
            (candidate_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(
                f"candidate {candidate_id!r} does not exist"
            )
        return CandidateRecord(
            case_id=row["case_id"],
            candidate_id=row["candidate_id"],
            source_anatomy_revision_id=row["source_anatomy_revision_id"],
            current_revision_id=row["current_revision_id"],
        )

    def get_candidate_history(self, candidate_id: str) -> CandidateHistory:
        candidate = self.get_candidate(candidate_id)
        revision_rows = self._require_connection().execute(
            """
            SELECT * FROM candidate_revisions
            WHERE candidate_id = ?
            ORDER BY rowid
            """,
            (candidate_id,),
        ).fetchall()
        return CandidateHistory(
            candidate=candidate,
            revisions=tuple(
                self._revision_from_row(row) for row in revision_rows
            ),
            reviews=tuple(
                self._review_from_row(row)
                for row in self._require_connection().execute(
                    """
                    SELECT review_results.*
                    FROM review_results
                    JOIN candidate_revisions USING (revision_id)
                    WHERE candidate_revisions.candidate_id = ?
                    ORDER BY review_results.rowid
                    """,
                    (candidate_id,),
                ).fetchall()
            ),
        )

    def add_review_result(self, record: ReviewResultRecord) -> None:
        try:
            with self._transaction() as connection:
                connection.execute(
                    """
                    INSERT INTO review_results(
                        review_result_id, case_id, candidate_id, revision_id,
                        operation_id, method_id, output_json, provenance,
                        limitations_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record.review_result_id,
                        record.case_id,
                        record.candidate_id,
                        record.revision_id,
                        record.operation_id,
                        record.method_id,
                        _json_dump(record.output),
                        record.provenance.value,
                        _json_dump(list(record.limitations)),
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise ReferenceMismatchError(
                "review result references an unknown case/candidate/revision"
            ) from error

    def list_review_results(
        self, revision_id: str
    ) -> tuple[ReviewResultRecord, ...]:
        rows = self._require_connection().execute(
            """
            SELECT * FROM review_results
            WHERE revision_id = ?
            ORDER BY rowid
            """,
            (revision_id,),
        ).fetchall()
        return tuple(self._review_from_row(row) for row in rows)

    def list_current_review_results(
        self, candidate_id: str
    ) -> tuple[ReviewResultRecord, ...]:
        candidate = self.get_candidate(candidate_id)
        return self.list_review_results(candidate.current_revision_id)

    def reserve_request(
        self, case_id: str, request_id: str, canonical_identity: str
    ) -> RequestReservation:
        with self._transaction() as connection:
            existing = connection.execute(
                """
                SELECT * FROM request_reservations
                WHERE case_id = ? AND request_id = ?
                """,
                (case_id, request_id),
            ).fetchone()
            if existing is None:
                try:
                    connection.execute(
                        """
                        INSERT INTO request_reservations(
                            case_id, request_id, canonical_identity, run_id
                        ) VALUES (?, ?, ?, NULL)
                        """,
                        (case_id, request_id, canonical_identity),
                    )
                except sqlite3.IntegrityError as error:
                    raise StorageConflictError(
                        "request reservation could not be created"
                    ) from error
                existing = connection.execute(
                    """
                    SELECT * FROM request_reservations
                    WHERE case_id = ? AND request_id = ?
                    """,
                    (case_id, request_id),
                ).fetchone()
            elif existing["canonical_identity"] != canonical_identity:
                raise RequestIdConflictError(
                    f"request id {request_id!r} has conflicting input"
                )
        return self._request_from_row(existing)

    def create_run(self, record: OperationRunRecord) -> None:
        if (
            record.state is not RunLifecycleState.ACCEPTED
            or record.terminal_status is not None
        ):
            raise InvalidRunTransitionError(
                "a new run must start accepted and non-terminal"
            )
        try:
            with self._transaction() as connection:
                reservation = connection.execute(
                    """
                    SELECT run_id FROM request_reservations
                    WHERE case_id = ? AND request_id = ?
                    """,
                    (record.case_id, record.request_id),
                ).fetchone()
                if reservation is None:
                    raise ReferenceMismatchError(
                        "run requires an existing request reservation"
                    )
                if reservation["run_id"] is not None:
                    raise StorageConflictError(
                        "request reservation already has a run"
                    )
                connection.execute(
                    """
                    INSERT INTO operation_runs(
                        run_id, case_id, request_id, operation_id, state,
                        terminal_status, input_revisions_json, output_json,
                        error_json
                    ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL)
                    """,
                    (
                        record.run_id,
                        record.case_id,
                        record.request_id,
                        record.operation_id,
                        record.state.value,
                        _json_dump(record.input_revisions),
                    ),
                )
                connection.execute(
                    """
                    UPDATE request_reservations SET run_id = ?
                    WHERE case_id = ? AND request_id = ?
                    """,
                    (record.run_id, record.case_id, record.request_id),
                )
        except sqlite3.IntegrityError as error:
            raise StorageConflictError(
                f"run {record.run_id!r} could not be created"
            ) from error

    def claim_operation_run(
        self, record: OperationRunRecord, canonical_identity: str
    ) -> OperationRunClaim:
        """Atomically bind one canonical case-scoped request to one run."""
        if (
            record.state is not RunLifecycleState.ACCEPTED
            or record.terminal_status is not None
        ):
            raise InvalidRunTransitionError(
                "a claimed run must start accepted and non-terminal"
            )
        owner = False
        try:
            with self._transaction() as connection:
                reservation = connection.execute(
                    """
                    SELECT * FROM request_reservations
                    WHERE case_id = ? AND request_id = ?
                    """,
                    (record.case_id, record.request_id),
                ).fetchone()
                if reservation is not None:
                    if reservation["canonical_identity"] != canonical_identity:
                        raise RequestIdConflictError(
                            f"request id {record.request_id!r} has conflicting input"
                        )
                    if reservation["run_id"] is None:
                        raise StorageConflictError(
                            "request reservation has no operation owner"
                        )
                    run_id = reservation["run_id"]
                else:
                    connection.execute(
                        """
                        INSERT INTO request_reservations(
                            case_id, request_id, canonical_identity, run_id
                        ) VALUES (?, ?, ?, ?)
                        """,
                        (
                            record.case_id,
                            record.request_id,
                            canonical_identity,
                            record.run_id,
                        ),
                    )
                    connection.execute(
                        """
                        INSERT INTO operation_runs(
                            run_id, case_id, request_id, operation_id, state,
                            terminal_status, input_revisions_json, output_json,
                            error_json
                        ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL)
                        """,
                        (
                            record.run_id,
                            record.case_id,
                            record.request_id,
                            record.operation_id,
                            record.state.value,
                            _json_dump(record.input_revisions),
                        ),
                    )
                    run_id = record.run_id
                    owner = True
        except sqlite3.IntegrityError as error:
            raise StorageConflictError(
                f"run {record.run_id!r} could not be claimed"
            ) from error
        return OperationRunClaim(owner=owner, run=self.get_run(run_id))

    def get_run(self, run_id: str) -> OperationRunRecord:
        row = self._require_connection().execute(
            "SELECT * FROM operation_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(f"run {run_id!r} does not exist")
        return self._run_from_row(row)

    def transition_run(
        self,
        run_id: str,
        state: RunLifecycleState,
        *,
        terminal_status: TerminalStatus | None = None,
        output: dict[str, JsonValue] | None = None,
        error: StructuredError | None = None,
    ) -> OperationRunRecord:
        terminal_states = {
            RunLifecycleState.COMPLETED: TerminalStatus.COMPLETED,
            RunLifecycleState.UNSUPPORTED: TerminalStatus.UNSUPPORTED,
            RunLifecycleState.UNAVAILABLE: TerminalStatus.UNAVAILABLE,
            RunLifecycleState.STALE: TerminalStatus.STALE,
            RunLifecycleState.FAILED: TerminalStatus.FAILED,
        }
        allowed = {
            RunLifecycleState.ACCEPTED: {
                RunLifecycleState.EXECUTING,
                RunLifecycleState.UNSUPPORTED,
                RunLifecycleState.UNAVAILABLE,
                RunLifecycleState.STALE,
                RunLifecycleState.FAILED,
            },
            RunLifecycleState.EXECUTING: {
                RunLifecycleState.READY_TO_COMMIT,
                RunLifecycleState.STALE,
                RunLifecycleState.FAILED,
            },
            RunLifecycleState.READY_TO_COMMIT: {
                RunLifecycleState.COMPLETED,
                RunLifecycleState.STALE,
                RunLifecycleState.FAILED,
            },
        }
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT * FROM operation_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            if row is None:
                raise StorageNotFoundError(f"run {run_id!r} does not exist")
            current = RunLifecycleState(row["state"])
            if state not in allowed.get(current, set()):
                raise InvalidRunTransitionError(
                    f"run cannot transition from {current.value} to {state.value}"
                )
            required_status = terminal_states.get(state)
            if required_status is None and terminal_status is not None:
                raise InvalidRunTransitionError(
                    "non-terminal run states cannot have terminal_status"
                )
            if required_status is not None and terminal_status is not required_status:
                raise InvalidRunTransitionError(
                    "terminal state requires its matching terminal_status"
                )
            connection.execute(
                """
                UPDATE operation_runs
                SET state = ?, terminal_status = ?, output_json = ?,
                    error_json = ?
                WHERE run_id = ?
                """,
                (
                    state.value,
                    terminal_status.value if terminal_status else None,
                    _json_dump(output) if output is not None else None,
                    error.model_dump_json() if error is not None else None,
                    run_id,
                ),
            )
        return self.get_run(run_id)

    def _get_revision(self, revision_id: str) -> CandidateRevisionRecord:
        row = self._require_connection().execute(
            "SELECT * FROM candidate_revisions WHERE revision_id = ?",
            (revision_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(
                f"candidate revision {revision_id!r} does not exist"
            )
        return self._revision_from_row(row)

    @staticmethod
    def _revision_from_row(row: sqlite3.Row) -> CandidateRevisionRecord:
        return CandidateRevisionRecord(
            case_id=row["case_id"],
            candidate_id=row["candidate_id"],
            revision_id=row["revision_id"],
            parent_revision_id=row["parent_revision_id"],
            operation_id=row["operation_id"],
            validated_parameters=json.loads(
                row["validated_parameters_json"]
            ),
            artifact_id=row["artifact_id"],
            spatial_metadata=SpatialMetadata.model_validate_json(
                row["spatial_metadata_json"]
            ),
            provenance=ProvenanceSource(row["provenance"]),
        )

    @staticmethod
    def _review_from_row(row: sqlite3.Row) -> ReviewResultRecord:
        return ReviewResultRecord(
            review_result_id=row["review_result_id"],
            case_id=row["case_id"],
            candidate_id=row["candidate_id"],
            revision_id=row["revision_id"],
            operation_id=row["operation_id"],
            method_id=row["method_id"],
            output=json.loads(row["output_json"]),
            provenance=ProvenanceSource(row["provenance"]),
            limitations=tuple(json.loads(row["limitations_json"])),
        )

    @staticmethod
    def _request_from_row(row: sqlite3.Row) -> RequestReservation:
        return RequestReservation(
            case_id=row["case_id"],
            request_id=row["request_id"],
            canonical_identity=row["canonical_identity"],
            run_id=row["run_id"],
        )

    @staticmethod
    def _run_from_row(row: sqlite3.Row) -> OperationRunRecord:
        return OperationRunRecord(
            run_id=row["run_id"],
            case_id=row["case_id"],
            request_id=row["request_id"],
            operation_id=row["operation_id"],
            state=RunLifecycleState(row["state"]),
            terminal_status=(
                TerminalStatus(row["terminal_status"])
                if row["terminal_status"] is not None
                else None
            ),
            input_revisions=json.loads(row["input_revisions_json"]),
            output=(
                json.loads(row["output_json"])
                if row["output_json"] is not None
                else None
            ),
            error=(
                StructuredError.model_validate_json(row["error_json"])
                if row["error_json"] is not None
                else None
            ),
        )

    @staticmethod
    def _insert_revision(
        connection: sqlite3.Connection,
        case_id: str,
        candidate_id: str,
        revision: NewCandidateRevision,
    ) -> None:
        connection.execute(
            """
            INSERT INTO candidate_revisions(
                revision_id, case_id, candidate_id, parent_revision_id,
                operation_id, validated_parameters_json, artifact_id,
                spatial_metadata_json, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                revision.revision_id,
                case_id,
                candidate_id,
                revision.parent_revision_id,
                revision.operation_id,
                _json_dump(revision.validated_parameters),
                revision.artifact_id,
                revision.spatial_metadata.model_dump_json(),
                revision.provenance.value,
            ),
        )

    @staticmethod
    def _require_source_in_case(
        connection: sqlite3.Connection,
        case_id: str,
        source_revision_id: str,
    ) -> None:
        row = connection.execute(
            """
            SELECT case_id FROM source_anatomy_revisions
            WHERE revision_id = ?
            """,
            (source_revision_id,),
        ).fetchone()
        if row is None or row["case_id"] != case_id:
            raise ReferenceMismatchError(
                "source anatomy does not belong to the requested case"
            )

    @staticmethod
    def _require_artifact_in_case(
        connection: sqlite3.Connection,
        case_id: str,
        artifact_id: str,
    ) -> None:
        row = connection.execute(
            """
            SELECT case_id, authority, reconciliation_state, cleanup_token
            FROM artifacts WHERE artifact_id = ?
            """,
            (artifact_id,),
        ).fetchone()
        if row is None:
            raise StorageNotFoundError(
                f"artifact {artifact_id!r} does not exist"
            )
        if row["case_id"] != case_id:
            raise ReferenceMismatchError(
                "artifact does not belong to the requested case"
            )
        eligible_pending = (
            row["authority"] == ArtifactAuthority.PENDING.value
            and row["reconciliation_state"] == ReconciliationState.PENDING.value
            and row["cleanup_token"] is None
        )
        eligible_reuse = (
            row["authority"] == ArtifactAuthority.AUTHORITATIVE.value
            and row["reconciliation_state"]
            == ReconciliationState.NOT_REQUIRED.value
            and row["cleanup_token"] is None
        )
        if not (eligible_pending or eligible_reuse):
            raise ArtifactAuthorityError(
                "artifact lifecycle is not eligible for an authoritative commit"
            )

    def _mark_artifact_authoritative(
        self, connection: sqlite3.Connection, artifact_id: str
    ) -> None:
        connection.execute(
            """
            UPDATE artifacts
            SET authority = ?, reconciliation_state = ?,
                non_authoritative_reason = NULL, cleanup_token = NULL
            WHERE artifact_id = ?
            """,
            (
                ArtifactAuthority.AUTHORITATIVE.value,
                ReconciliationState.NOT_REQUIRED.value,
                artifact_id,
            ),
        )

    def _mark_artifact_non_authoritative(
        self, artifact_id: str, reason: str
    ) -> None:
        with self._transaction() as connection:
            connection.execute(
                """
                UPDATE artifacts
                SET authority = ?, reconciliation_state = ?,
                    non_authoritative_reason = ?
                WHERE artifact_id = ? AND authority = ?
                """,
                (
                    ArtifactAuthority.NON_AUTHORITATIVE.value,
                    ReconciliationState.PENDING.value,
                    reason,
                    artifact_id,
                    ArtifactAuthority.PENDING.value,
                ),
            )

    @staticmethod
    def _artifact_from_row(row: sqlite3.Row) -> ArtifactRecord:
        return ArtifactRecord(
            case_id=row["case_id"],
            artifact=StoredArtifact(
                artifact_id=row["artifact_id"],
                content_hash=row["content_hash"],
                media_type=row["media_type"],
                retrieval_url=row["retrieval_url"],
                relative_path=row["relative_path"],
            ),
            provenance=ProvenanceSource(row["provenance"]),
            limitations=tuple(json.loads(row["limitations_json"])),
            authority=ArtifactAuthority(row["authority"]),
            reconciliation_state=ReconciliationState(
                row["reconciliation_state"]
            ),
            non_authoritative_reason=row["non_authoritative_reason"],
            produced_by_run_id=row["produced_by_run_id"],
        )

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._require_connection()
        connection.execute("BEGIN IMMEDIATE")
        try:
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise

    def _require_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise StorageError("storage is not initialized")
        return self._connection
