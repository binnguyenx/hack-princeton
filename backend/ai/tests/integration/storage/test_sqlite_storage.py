"""Behavioral integration tests for authoritative SQLite application storage."""

from __future__ import annotations

import tempfile
import unittest
import sqlite3
from pathlib import Path

from skullfix_ai.schemas import (
    ProvenanceSource,
    RunLifecycleState,
    SpatialMetadata,
    StructuredError,
    TerminalStatus,
)
from skullfix_ai.storage import (
    ArtifactAuthority,
    ArtifactAuthorityError,
    ArtifactRecord,
    CaseRecord,
    InvalidRunTransitionError,
    LocalArtifactStore,
    NewCandidateRevision,
    OperationRunRecord,
    ReconciliationState,
    ReferenceMismatchError,
    RequestIdConflictError,
    ReviewResultRecord,
    SQLiteApplicationStorage,
    SourceAnatomyRecord,
    StaleRevisionError,
    StorageConflictError,
)
from fixture_loader import seed_demo_state


def identity_spatial_metadata(frame: str = "fixture-primary-local") -> SpatialMetadata:
    return SpatialMetadata.model_validate(
        {
            "units": "unitless",
            "coordinate_frame": frame,
            "transforms": [
                {
                    "from_frame": frame,
                    "to_frame": frame,
                    "matrix": [
                        [1, 0, 0, 0],
                        [0, 1, 0, 0],
                        [0, 0, 1, 0],
                        [0, 0, 0, 1],
                    ],
                }
            ],
        }
    )


class SQLiteApplicationStorageTest(unittest.TestCase):
    @staticmethod
    def record_pending_artifact(
        storage: SQLiteApplicationStorage,
        artifact_store: LocalArtifactStore,
        case_id: str,
        artifact_id: str,
        content: bytes,
        provenance: ProvenanceSource = ProvenanceSource.MOCK,
    ) -> ArtifactRecord:
        record = ArtifactRecord(
            case_id=case_id,
            artifact=artifact_store.write_bytes(
                artifact_id=artifact_id,
                content=content,
                media_type="application/json",
            ),
            provenance=provenance,
            limitations=("Synthetic test artifact.",),
            authority=ArtifactAuthority.PENDING,
            reconciliation_state=ReconciliationState.PENDING,
        )
        storage.record_artifact(record)
        return record

    def seed_case_with_candidate(
        self,
        storage: SQLiteApplicationStorage,
        artifact_store: LocalArtifactStore,
        suffix: str,
    ) -> tuple[str, str, str]:
        case_id = f"case-{suffix}"
        source_revision_id = f"source-revision-{suffix}"
        candidate_id = f"candidate-{suffix}"
        initial_revision_id = f"candidate-revision-{suffix}-r1"
        storage.create_case(CaseRecord(case_id, f"Synthetic case {suffix}"))
        self.record_pending_artifact(
            storage,
            artifact_store,
            case_id,
            f"artifact-source-{suffix}",
            f"source-{suffix}".encode(),
            ProvenanceSource.TEST_DOUBLE,
        )
        storage.create_source_anatomy(
            SourceAnatomyRecord(
                case_id=case_id,
                revision_id=source_revision_id,
                artifact_id=f"artifact-source-{suffix}",
                spatial_metadata=identity_spatial_metadata(
                    f"fixture-{suffix}-local"
                ),
            )
        )
        self.record_pending_artifact(
            storage,
            artifact_store,
            case_id,
            f"artifact-candidate-{suffix}-r1",
            f"candidate-{suffix}-r1".encode(),
        )
        storage.create_initial_candidate(
            case_id=case_id,
            candidate_id=candidate_id,
            source_anatomy_revision_id=source_revision_id,
            revision=NewCandidateRevision(
                revision_id=initial_revision_id,
                parent_revision_id=None,
                operation_id="generate.candidate",
                validated_parameters={"fixture_variant": "initial"},
                artifact_id=f"artifact-candidate-{suffix}-r1",
                spatial_metadata=identity_spatial_metadata(
                    f"fixture-{suffix}-local"
                ),
                provenance=ProvenanceSource.MOCK,
            ),
        )
        return case_id, candidate_id, initial_revision_id

    def test_initialized_state_survives_close_and_reopen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            database = base / "application.sqlite"
            artifact_store = LocalArtifactStore(base / "artifacts")
            stored = artifact_store.write_bytes(
                artifact_id="artifact-source-001",
                content=b"synthetic-source",
                media_type="application/json",
            )

            storage = SQLiteApplicationStorage(database)
            storage.initialize()
            self.assertEqual(storage.schema_version, 2)
            storage.create_case(CaseRecord("case-001", "Synthetic case"))
            storage.record_artifact(
                ArtifactRecord(
                    case_id="case-001",
                    artifact=stored,
                    provenance=ProvenanceSource.TEST_DOUBLE,
                    limitations=("Synthetic source only.",),
                    authority=ArtifactAuthority.PENDING,
                    reconciliation_state=ReconciliationState.PENDING,
                )
            )
            storage.create_source_anatomy(
                SourceAnatomyRecord(
                    case_id="case-001",
                    revision_id="source-revision-001",
                    artifact_id="artifact-source-001",
                    spatial_metadata=identity_spatial_metadata(),
                )
            )
            storage.close()

            reopened = SQLiteApplicationStorage(database)
            reopened.initialize()
            self.assertEqual(
                reopened.get_case("case-001"),
                CaseRecord("case-001", "Synthetic case"),
            )
            source = reopened.get_source_anatomy("source-revision-001")
            self.assertEqual(source.spatial_metadata, identity_spatial_metadata())
            self.assertEqual(
                reopened.get_artifact("artifact-source-001").authority,
                ArtifactAuthority.AUTHORITATIVE,
            )
            reopened.close()

    def test_competing_connections_reject_stale_commit_and_track_artifact(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            database = base / "application.sqlite"
            artifact_store = LocalArtifactStore(base / "artifacts")
            first = SQLiteApplicationStorage(database)
            first.initialize()
            case_id, candidate_id, revision_r1 = self.seed_case_with_candidate(
                first, artifact_store, "primary"
            )

            second = SQLiteApplicationStorage(database)
            second.initialize()
            self.assertEqual(
                first.get_candidate(candidate_id).current_revision_id,
                revision_r1,
            )
            self.assertEqual(
                second.get_candidate(candidate_id).current_revision_id,
                revision_r1,
            )
            self.record_pending_artifact(
                first,
                artifact_store,
                case_id,
                "artifact-candidate-primary-r2",
                b"candidate-primary-r2",
            )
            first.commit_child_revision(
                case_id=case_id,
                candidate_id=candidate_id,
                expected_revision_id=revision_r1,
                revision=NewCandidateRevision(
                    revision_id="candidate-revision-primary-r2",
                    parent_revision_id=revision_r1,
                    operation_id="generate.candidate",
                    validated_parameters={"fixture_variant": "winner"},
                    artifact_id="artifact-candidate-primary-r2",
                    spatial_metadata=identity_spatial_metadata(),
                    provenance=ProvenanceSource.TEST_DOUBLE,
                ),
            )
            self.record_pending_artifact(
                second,
                artifact_store,
                case_id,
                "artifact-candidate-primary-stale",
                b"stale-output",
            )

            with self.assertRaises(StaleRevisionError):
                second.commit_child_revision(
                    case_id=case_id,
                    candidate_id=candidate_id,
                    expected_revision_id=revision_r1,
                    revision=NewCandidateRevision(
                        revision_id="candidate-revision-primary-stale",
                        parent_revision_id=revision_r1,
                        operation_id="generate.candidate",
                        validated_parameters={"fixture_variant": "loser"},
                        artifact_id="artifact-candidate-primary-stale",
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )

            history = second.get_candidate_history(candidate_id)
            self.assertEqual(
                history.candidate.current_revision_id,
                "candidate-revision-primary-r2",
            )
            self.assertNotIn(
                "candidate-revision-primary-stale",
                [revision.revision_id for revision in history.revisions],
            )
            stale_artifact = second.get_artifact(
                "artifact-candidate-primary-stale"
            )
            self.assertEqual(
                stale_artifact.authority,
                ArtifactAuthority.NON_AUTHORITATIVE,
            )
            self.assertEqual(
                stale_artifact.non_authoritative_reason,
                "stale-revision",
            )
            first.close()
            second.close()

    def test_cross_case_cross_candidate_and_failed_insert_leave_no_child(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "application.sqlite")
            storage.initialize()
            artifact_store = LocalArtifactStore(base / "artifacts")
            case_a, candidate_a, revision_a = self.seed_case_with_candidate(
                storage, artifact_store, "a"
            )
            case_b, _, revision_b = self.seed_case_with_candidate(
                storage, artifact_store, "b"
            )
            self.record_pending_artifact(
                storage,
                artifact_store,
                case_a,
                "artifact-cross-candidate",
                b"cross-candidate",
            )

            with self.assertRaises(ReferenceMismatchError):
                storage.commit_child_revision(
                    case_id=case_a,
                    candidate_id=candidate_a,
                    expected_revision_id=revision_b,
                    revision=NewCandidateRevision(
                        revision_id="revision-cross-candidate",
                        parent_revision_id=revision_b,
                        operation_id="generate.candidate",
                        validated_parameters={},
                        artifact_id="artifact-cross-candidate",
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )

            self.record_pending_artifact(
                storage,
                artifact_store,
                case_a,
                "artifact-cross-case-initial",
                b"cross-case-initial",
            )
            with self.assertRaises(ReferenceMismatchError):
                storage.create_initial_candidate(
                    case_id=case_a,
                    candidate_id="candidate-cross-case",
                    source_anatomy_revision_id="source-revision-b",
                    revision=NewCandidateRevision(
                        revision_id="revision-cross-case-initial",
                        parent_revision_id=None,
                        operation_id="generate.candidate",
                        validated_parameters={},
                        artifact_id="artifact-cross-case-initial",
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )

            self.record_pending_artifact(
                storage,
                artifact_store,
                case_a,
                "artifact-rollback",
                b"rollback",
            )
            with self.assertRaises(StorageConflictError):
                storage.commit_child_revision(
                    case_id=case_a,
                    candidate_id=candidate_a,
                    expected_revision_id=revision_a,
                    revision=NewCandidateRevision(
                        revision_id=revision_b,
                        parent_revision_id=revision_a,
                        operation_id="generate.candidate",
                        validated_parameters={"fixture_variant": "duplicate-id"},
                        artifact_id="artifact-rollback",
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )

            history = storage.get_candidate_history(candidate_a)
            self.assertEqual(history.candidate.current_revision_id, revision_a)
            self.assertEqual(len(history.revisions), 1)
            self.assertEqual(
                storage.get_artifact("artifact-rollback").authority,
                ArtifactAuthority.NON_AUTHORITATIVE,
            )
            self.assertEqual(storage.get_case(case_b).case_id, case_b)
            storage.close()

    def test_initial_and_child_revisions_are_immutable_atomic_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "application.sqlite")
            storage.initialize()
            artifact_store = LocalArtifactStore(base / "artifacts")
            storage.create_case(CaseRecord("case-001", "Synthetic case"))
            self.record_pending_artifact(
                storage,
                artifact_store,
                "case-001",
                "artifact-source-001",
                b"source",
                ProvenanceSource.TEST_DOUBLE,
            )
            storage.create_source_anatomy(
                SourceAnatomyRecord(
                    case_id="case-001",
                    revision_id="source-revision-001",
                    artifact_id="artifact-source-001",
                    spatial_metadata=identity_spatial_metadata(),
                )
            )
            initial_artifact = self.record_pending_artifact(
                storage,
                artifact_store,
                "case-001",
                "artifact-candidate-r1",
                b"candidate-r1",
            )

            candidate = storage.create_initial_candidate(
                case_id="case-001",
                candidate_id="candidate-001",
                source_anatomy_revision_id="source-revision-001",
                revision=NewCandidateRevision(
                    revision_id="candidate-revision-r1",
                    parent_revision_id=None,
                    operation_id="generate.candidate",
                    validated_parameters={"fixture_variant": "initial"},
                    artifact_id="artifact-candidate-r1",
                    spatial_metadata=identity_spatial_metadata(),
                    provenance=ProvenanceSource.MOCK,
                ),
            )
            self.assertEqual(candidate.current_revision_id, "candidate-revision-r1")
            self.assertEqual(
                storage.get_artifact("artifact-candidate-r1").authority,
                ArtifactAuthority.AUTHORITATIVE,
            )

            child_artifact = self.record_pending_artifact(
                storage,
                artifact_store,
                "case-001",
                "artifact-candidate-r2",
                b"candidate-r2",
                ProvenanceSource.TEST_DOUBLE,
            )
            child = storage.commit_child_revision(
                case_id="case-001",
                candidate_id="candidate-001",
                expected_revision_id="candidate-revision-r1",
                revision=NewCandidateRevision(
                    revision_id="candidate-revision-r2",
                    parent_revision_id="candidate-revision-r1",
                    operation_id="generate.candidate",
                    validated_parameters={
                        "fixture_variant": "child",
                        "flags": [True, 3, {"name": "preserved"}],
                    },
                    artifact_id="artifact-candidate-r2",
                    spatial_metadata=identity_spatial_metadata("fixture-child-local"),
                    provenance=ProvenanceSource.TEST_DOUBLE,
                ),
            )

            history = storage.get_candidate_history("candidate-001")
            self.assertEqual(child.parent_revision_id, "candidate-revision-r1")
            self.assertEqual(history.candidate.current_revision_id, child.revision_id)
            self.assertEqual(
                [revision.revision_id for revision in history.revisions],
                ["candidate-revision-r1", "candidate-revision-r2"],
            )
            self.assertEqual(
                history.revisions[0].artifact_id,
                initial_artifact.artifact.artifact_id,
            )
            self.assertEqual(
                history.revisions[1].artifact_id,
                child_artifact.artifact.artifact_id,
            )
            self.assertEqual(
                history.revisions[1].spatial_metadata.coordinate_frame,
                "fixture-child-local",
            )
            self.assertEqual(
                history.revisions[1].provenance,
                ProvenanceSource.TEST_DOUBLE,
            )
            self.assertEqual(
                history.revisions[1].validated_parameters,
                {
                    "fixture_variant": "child",
                    "flags": [True, 3, {"name": "preserved"}],
                },
            )
            self.assertEqual(
                artifact_store.read_bytes(initial_artifact.artifact),
                b"candidate-r1",
            )
            storage.close()

    def test_review_history_stays_on_parent_revision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "application.sqlite")
            storage.initialize()
            artifact_store = LocalArtifactStore(base / "artifacts")
            case_id, candidate_id, revision_r1 = self.seed_case_with_candidate(
                storage, artifact_store, "reviews"
            )
            sentinel = ReviewResultRecord(
                review_result_id="review-sentinel-r1",
                case_id=case_id,
                candidate_id=candidate_id,
                revision_id=revision_r1,
                operation_id="measure.candidate",
                method_id="fixture-history-sentinel",
                output={"sentinel": "attached-to-r1-only"},
                provenance=ProvenanceSource.TEST_DOUBLE,
                limitations=("Nonnumeric persistence sentinel.",),
            )
            storage.add_review_result(sentinel)
            self.record_pending_artifact(
                storage,
                artifact_store,
                case_id,
                "artifact-reviews-r2",
                b"reviews-r2",
            )
            storage.commit_child_revision(
                case_id=case_id,
                candidate_id=candidate_id,
                expected_revision_id=revision_r1,
                revision=NewCandidateRevision(
                    revision_id="candidate-revision-reviews-r2",
                    parent_revision_id=revision_r1,
                    operation_id="generate.candidate",
                    validated_parameters={"fixture_variant": "child"},
                    artifact_id="artifact-reviews-r2",
                    spatial_metadata=identity_spatial_metadata(),
                    provenance=ProvenanceSource.TEST_DOUBLE,
                ),
            )

            self.assertEqual(
                tuple(storage.list_review_results(revision_r1)),
                (sentinel,),
            )
            self.assertEqual(
                tuple(storage.list_current_review_results(candidate_id)),
                (),
            )
            self.assertEqual(
                storage.get_candidate_history(candidate_id).reviews,
                (sentinel,),
            )
            storage.close()

    def test_request_reservations_and_run_lifecycle_are_storage_primitives(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = SQLiteApplicationStorage(
                Path(directory) / "application.sqlite"
            )
            storage.initialize()
            storage.create_case(CaseRecord("case-001", "Synthetic case"))

            reservation = storage.reserve_request(
                "case-001", "request-001", "canonical-direct-command-v1"
            )
            self.assertEqual(
                storage.reserve_request(
                    "case-001",
                    "request-001",
                    "canonical-direct-command-v1",
                ),
                reservation,
            )
            with self.assertRaises(RequestIdConflictError) as conflict:
                storage.reserve_request(
                    "case-001",
                    "request-001",
                    "different-canonical-identity",
                )
            self.assertEqual(conflict.exception.code, "request-id-conflict")

            storage.create_run(
                OperationRunRecord(
                    run_id="run-001",
                    case_id="case-001",
                    request_id="request-001",
                    operation_id="generate.candidate",
                    state=RunLifecycleState.ACCEPTED,
                    terminal_status=None,
                    input_revisions={
                        "source_anatomy_revision_id": "source-revision-001"
                    },
                    output=None,
                    error=None,
                )
            )
            storage.transition_run(
                "run-001", RunLifecycleState.EXECUTING
            )
            storage.transition_run(
                "run-001", RunLifecycleState.READY_TO_COMMIT
            )
            completed = storage.transition_run(
                "run-001",
                RunLifecycleState.COMPLETED,
                terminal_status=TerminalStatus.COMPLETED,
                output={"stored": True},
            )
            self.assertEqual(completed.output, {"stored": True})
            self.assertEqual(
                storage.reserve_request(
                    "case-001",
                    "request-001",
                    "canonical-direct-command-v1",
                ).run_id,
                "run-001",
            )
            with self.assertRaises(InvalidRunTransitionError):
                storage.transition_run(
                    "run-001", RunLifecycleState.EXECUTING
                )
            storage.close()

    def test_non_authoritative_artifact_reconciliation_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "application.sqlite")
            storage.initialize()
            artifact_store = LocalArtifactStore(base / "artifacts")
            storage.create_case(CaseRecord("case-001", "Synthetic case"))
            artifact = self.record_pending_artifact(
                storage,
                artifact_store,
                "case-001",
                "artifact-orphan-001",
                b"orphan",
            )
            storage.mark_artifact_non_authoritative(
                "artifact-orphan-001", "execution-failed"
            )

            pending = tuple(storage.list_non_authoritative_artifacts())
            self.assertEqual(
                [record.artifact.artifact_id for record in pending],
                ["artifact-orphan-001"],
            )
            claim = storage.claim_artifact_cleanup(
                "artifact-orphan-001", "cleanup-orphan-001"
            )
            self.assertTrue(artifact_store.delete_claimed(claim))
            storage.complete_artifact_cleanup(
                "artifact-orphan-001",
                claim.claim_token,
                ReconciliationState.DELETED,
            )
            reconciled = storage.get_artifact("artifact-orphan-001")
            self.assertEqual(
                reconciled.reconciliation_state,
                ReconciliationState.DELETED,
            )
            self.assertFalse(
                (artifact_store.root / artifact.artifact.relative_path).exists()
            )
            storage.close()

    def test_deleted_artifact_cannot_become_authoritative(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "application.sqlite")
            storage.initialize()
            artifact_store = LocalArtifactStore(base / "artifacts")
            case_id, candidate_id, current_revision = self.seed_case_with_candidate(
                storage, artifact_store, "deleted"
            )
            artifact = self.record_pending_artifact(
                storage,
                artifact_store,
                case_id,
                "artifact-deleted-child",
                b"deleted-child",
            )
            storage.mark_artifact_non_authoritative(
                artifact.artifact.artifact_id, "execution-failed"
            )
            claim = storage.claim_artifact_cleanup(
                artifact.artifact.artifact_id, "cleanup-deleted-child"
            )
            artifact_store.delete_claimed(claim)
            storage.complete_artifact_cleanup(
                artifact.artifact.artifact_id,
                claim.claim_token,
                ReconciliationState.DELETED,
            )

            with self.assertRaises(ArtifactAuthorityError):
                storage.commit_child_revision(
                    case_id=case_id,
                    candidate_id=candidate_id,
                    expected_revision_id=current_revision,
                    revision=NewCandidateRevision(
                        revision_id="candidate-revision-deleted-r2",
                        parent_revision_id=current_revision,
                        operation_id="generate.candidate",
                        validated_parameters={"fixture_variant": "deleted"},
                        artifact_id=artifact.artifact.artifact_id,
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )

            self.assertEqual(
                storage.get_candidate(candidate_id).current_revision_id,
                current_revision,
            )
            self.assertEqual(
                storage.get_artifact(artifact.artifact.artifact_id).authority,
                ArtifactAuthority.NON_AUTHORITATIVE,
            )
            storage.close()

    def test_source_publication_rejects_deleted_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            storage = SQLiteApplicationStorage(base / "app.sqlite")
            storage.initialize()
            self.addCleanup(storage.close)
            artifacts = LocalArtifactStore(base / "artifacts")
            storage.create_case(CaseRecord("case-deleted-source", "Synthetic"))
            self.record_pending_artifact(storage, artifacts, "case-deleted-source",
                                         "deleted-source", b"source")
            storage.mark_artifact_non_authoritative("deleted-source", "execution-failed")
            claim = storage.claim_artifact_cleanup("deleted-source", "source-cleanup")
            artifacts.delete_claimed(claim)
            storage.complete_artifact_cleanup("deleted-source", "source-cleanup",
                                              ReconciliationState.DELETED)
            with self.assertRaises(ArtifactAuthorityError):
                storage.create_source_anatomy(SourceAnatomyRecord(
                    "case-deleted-source", "invalid-source-revision", "deleted-source",
                    identity_spatial_metadata(),
                ))
            self.assertEqual(storage.get_artifact("deleted-source").reconciliation_state,
                             ReconciliationState.DELETED)

    def test_accepted_run_can_terminate_stale_without_executing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            storage = SQLiteApplicationStorage(
                Path(directory) / "application.sqlite"
            )
            storage.initialize()
            storage.create_case(CaseRecord("case-001", "Synthetic case"))
            storage.reserve_request(
                "case-001", "request-stale", "canonical-stale-command"
            )
            storage.create_run(
                OperationRunRecord(
                    run_id="run-stale",
                    case_id="case-001",
                    request_id="request-stale",
                    operation_id="generate.candidate",
                    state=RunLifecycleState.ACCEPTED,
                    terminal_status=None,
                    input_revisions={"expected_revision_id": "already-stale"},
                    output=None,
                    error=None,
                )
            )

            stale = storage.transition_run(
                "run-stale",
                RunLifecycleState.STALE,
                terminal_status=TerminalStatus.STALE,
                error=StructuredError(
                    code="stale-revision",
                    message="Expected revision is no longer current.",
                ),
            )
            self.assertEqual(stale.state, RunLifecycleState.STALE)
            self.assertEqual(stale.terminal_status, TerminalStatus.STALE)
            with self.assertRaises(InvalidRunTransitionError):
                storage.transition_run("run-stale", RunLifecycleState.EXECUTING)

            storage.reserve_request(
                "case-001", "request-invalid-stale", "canonical-invalid-stale"
            )
            storage.create_run(
                OperationRunRecord(
                    run_id="run-invalid-stale",
                    case_id="case-001",
                    request_id="request-invalid-stale",
                    operation_id="generate.candidate",
                    state=RunLifecycleState.ACCEPTED,
                    terminal_status=None,
                    input_revisions={},
                    output=None,
                    error=None,
                )
            )
            with self.assertRaises(InvalidRunTransitionError):
                storage.transition_run(
                    "run-invalid-stale",
                    RunLifecycleState.STALE,
                    terminal_status=TerminalStatus.FAILED,
                )
            storage.close()

    def test_cleanup_claim_and_commit_are_mutually_exclusive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            database = base / "application.sqlite"
            artifact_store = LocalArtifactStore(base / "artifacts")
            first = SQLiteApplicationStorage(database)
            first.initialize()
            case_id, candidate_id, current_revision = self.seed_case_with_candidate(
                first, artifact_store, "coordination"
            )
            pending = self.record_pending_artifact(
                first,
                artifact_store,
                case_id,
                "artifact-coordination-r2",
                b"coordination-r2",
            )
            stale_snapshot = pending
            first.mark_artifact_non_authoritative(
                pending.artifact.artifact_id, "execution-failed"
            )
            claim = first.claim_artifact_cleanup(
                pending.artifact.artifact_id, "cleanup-coordination"
            )

            second = SQLiteApplicationStorage(database)
            second.initialize()
            with self.assertRaises(ArtifactAuthorityError):
                second.commit_child_revision(
                    case_id=case_id,
                    candidate_id=candidate_id,
                    expected_revision_id=current_revision,
                    revision=NewCandidateRevision(
                        revision_id="candidate-revision-coordination-r2",
                        parent_revision_id=current_revision,
                        operation_id="generate.candidate",
                        validated_parameters={"fixture_variant": "claimed"},
                        artifact_id=pending.artifact.artifact_id,
                        spatial_metadata=identity_spatial_metadata(),
                        provenance=ProvenanceSource.TEST_DOUBLE,
                    ),
                )
            self.assertEqual(
                second.get_candidate(candidate_id).current_revision_id,
                current_revision,
            )
            self.assertEqual(
                second.get_artifact(pending.artifact.artifact_id).authority,
                ArtifactAuthority.NON_AUTHORITATIVE,
            )
            self.assertEqual(
                stale_snapshot.authority,
                ArtifactAuthority.PENDING,
            )
            artifact_store.delete_claimed(claim)
            first.complete_artifact_cleanup(
                pending.artifact.artifact_id,
                claim.claim_token,
                ReconciliationState.DELETED,
            )
            first.close()
            second.close()

    def test_version_one_database_migrates_without_losing_records(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "application.sqlite"
            storage = SQLiteApplicationStorage(database)
            storage.initialize()
            storage.create_case(CaseRecord("case-preserved", "Preserved"))
            storage.close()

            legacy = sqlite3.connect(database)
            legacy.execute("ALTER TABLE artifacts DROP COLUMN cleanup_token")
            legacy.execute("PRAGMA user_version = 1")
            legacy.commit()
            legacy.close()

            migrated = SQLiteApplicationStorage(database)
            migrated.initialize()
            self.assertEqual(migrated.schema_version, 2)
            self.assertEqual(
                migrated.get_case("case-preserved"),
                CaseRecord("case-preserved", "Preserved"),
            )
            migrated.close()

    def test_commit_first_prevents_cleanup_from_stale_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            database = base / "application.sqlite"
            artifact_store = LocalArtifactStore(base / "artifacts")
            first = SQLiteApplicationStorage(database)
            first.initialize()
            case_id, candidate_id, current_revision = self.seed_case_with_candidate(
                first, artifact_store, "commit-first"
            )
            stale_snapshot = self.record_pending_artifact(
                first,
                artifact_store,
                case_id,
                "artifact-commit-first-r2",
                b"authoritative-r2",
            )
            second = SQLiteApplicationStorage(database)
            second.initialize()
            second.commit_child_revision(
                case_id=case_id,
                candidate_id=candidate_id,
                expected_revision_id=current_revision,
                revision=NewCandidateRevision(
                    revision_id="candidate-revision-commit-first-r2",
                    parent_revision_id=current_revision,
                    operation_id="generate.candidate",
                    validated_parameters={"fixture_variant": "winner"},
                    artifact_id=stale_snapshot.artifact.artifact_id,
                    spatial_metadata=identity_spatial_metadata(),
                    provenance=ProvenanceSource.TEST_DOUBLE,
                ),
            )

            with self.assertRaises(ArtifactAuthorityError):
                first.claim_artifact_cleanup(
                    stale_snapshot.artifact.artifact_id, "stale-cleanup"
                )
            self.assertEqual(
                first.get_artifact(stale_snapshot.artifact.artifact_id).authority,
                ArtifactAuthority.AUTHORITATIVE,
            )
            self.assertEqual(
                artifact_store.read_bytes(stale_snapshot.artifact),
                b"authoritative-r2",
            )
            first.close()
            second.close()

    def test_fixture_state_reopens_without_checkpoint_storage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            database = base / "application.sqlite"
            artifact_root = base / "artifacts"
            storage = SQLiteApplicationStorage(database)
            storage.initialize()
            seed_demo_state(storage, LocalArtifactStore(artifact_root))
            storage.close()

            reopened = SQLiteApplicationStorage(database)
            reopened.initialize()
            self.assertEqual(
                [record.case_id for record in reopened.list_cases()],
                ["case-demo-primary", "case-demo-secondary"],
            )
            history = reopened.get_candidate_history("candidate-demo-primary")
            self.assertEqual(
                history.candidate.current_revision_id,
                "candidate-revision-primary-r2",
            )
            self.assertEqual(
                [revision.revision_id for revision in history.revisions],
                [
                    "candidate-revision-primary-r1",
                    "candidate-revision-primary-r2",
                ],
            )
            self.assertEqual(
                [review.method_id for review in history.reviews],
                ["fixture-history-sentinel"],
            )
            self.assertEqual(
                tuple(
                    reopened.list_current_review_results(
                        "candidate-demo-primary"
                    )
                ),
                (),
            )
            source_artifact = reopened.get_artifact(
                "artifact-source-primary-v1"
            )
            self.assertTrue(
                LocalArtifactStore(artifact_root).read_bytes(
                    source_artifact.artifact
                )
            )
            self.assertFalse((base / "checkpoints.sqlite").exists())
            reopened.close()


if __name__ == "__main__":
    unittest.main()
