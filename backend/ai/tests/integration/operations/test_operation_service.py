"""Public operation-service tests using SQLite and synthetic fixture assets."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "storage"))
from fixture_loader import seed_demo_state

from skullfix_ai.integrations.geometry import (
    DeterministicReconstructionMock,
    ReconstructionAdapterError,
)
from skullfix_ai.operations import OperationService, OperationServiceError
from skullfix_ai.schemas import ProvenanceSource, RunLifecycleState, DirectMechanicalRequest
from pydantic import TypeAdapter
from skullfix_ai.storage import (
    ArtifactAuthority,
    LocalArtifactStore,
    SQLiteApplicationStorage,
    StaleRevisionError,
    StorageError,
)


class CountingAdapter:
    def __init__(self, callback=None):
        self.calls = 0
        self.callback = callback

    def reconstruct(self, context):
        self.calls += 1
        if self.callback:
            return self.callback(context)
        return DeterministicReconstructionMock().reconstruct(context)


class OperationServiceTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.storage = SQLiteApplicationStorage(self.root / "application.sqlite")
        self.storage.initialize()
        self.addCleanup(self.storage.close)
        self.artifacts = LocalArtifactStore(self.root / "artifacts")
        seed_demo_state(self.storage, self.artifacts)
        fixture_root = Path(__file__).resolve().parents[3] / "evaluation" / "fixtures"
        samples = json.loads((fixture_root / "requests.json").read_text())
        self.command = next(
            item["expected_validated_command"]
            for item in samples["requests"]
            if item["sample_id"] == "request-mock-generate-ai"
        )
        self.adapter = CountingAdapter()

    def service(self, storage=None, adapter=None, **kwargs):
        return OperationService(
            storage if storage is not None else self.storage,
            self.artifacts,
            adapter if adapter is not None else self.adapter,
            **kwargs,
        )

    def test_fixture_generation_persists_and_reopens_without_changing_source(self):
        source = self.storage.get_source_anatomy("anatomy-revision-primary-v1")
        source_bytes = self.artifacts.read_bytes(
            self.storage.get_artifact(source.artifact_id).artifact
        )
        result = self.service().execute_reconstruction(self.command)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.source, "mock")
        self.assertIn("not a real reconstruction", " ".join(result.limitations))
        history = self.storage.get_candidate_history(result.output_candidate_id)
        self.assertEqual(history.candidate.current_revision_id, result.output_revision_id)
        self.assertEqual(len(history.revisions), 1)
        self.assertEqual(history.revisions[0].spatial_metadata, source.spatial_metadata)
        self.assertEqual(self.artifacts.read_bytes(
            self.storage.get_artifact(source.artifact_id).artifact), source_bytes)
        record = self.storage.get_artifact(result.artifacts[0].artifact_id)
        self.assertEqual(record.authority, ArtifactAuthority.AUTHORITATIVE)
        self.assertEqual(json.loads(self.artifacts.read_bytes(record.artifact))[
            "artifact_kind"], "synthetic-reconstruction-mock")
        self.storage.close()
        self.storage.initialize()
        retry = self.service().execute_reconstruction(self.command)
        self.assertEqual(retry, result)
        self.assertEqual(self.adapter.calls, 1)

    def test_conflicting_command_does_not_execute_again(self):
        self.service().execute_reconstruction(self.command)
        conflict = {**self.command, "parameters": {"fixture_variant": "different"}}
        with self.assertRaises(OperationServiceError) as caught:
            self.service().execute_reconstruction(conflict)
        self.assertEqual(caught.exception.code, "request-id-conflict")
        self.assertEqual(self.adapter.calls, 1)

    def test_invalid_adapter_provenance_is_rejected_before_publication(self):
        adapter = CountingAdapter(lambda context: replace(
            DeterministicReconstructionMock().reconstruct(context),
            provenance=ProvenanceSource.REAL_OPERATION,
        ))
        result = self.service(adapter=adapter).execute_reconstruction(self.command)
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error.code, "adapter-output-invalid")
        self.assertIsNone(result.output_revision_id)
        self.assertEqual(self.storage.get_run(result.run_id).state, RunLifecycleState.FAILED)
        self.assertEqual(len(self.storage.list_cases()), 2)

    def test_cross_case_and_incompatible_selection_stop_before_execution(self):
        command = {**self.command, "input_revisions": {
            "source_anatomy_revision_id": "anatomy-revision-secondary-v1"}}
        result = self.service().execute_reconstruction(command)
        self.assertEqual(result.error.code, "cross-case-reference")
        self.assertEqual(self.adapter.calls, 0)
        self.assertEqual(self.service().execute_reconstruction(command), result)
        command = {**self.command, "request_id": "bad-frame", "references": {
            "selection": {**self.command["references"]["selection"],
                          "coordinate_frame": "other-frame"}}}
        result = self.service().execute_reconstruction(command)
        self.assertEqual(result.error.code, "reference-mismatch")
        self.assertEqual(self.adapter.calls, 0)

    def test_pre_execution_stale_has_no_adapter_execution(self):
        def stale(_context):
            raise StaleRevisionError("old", "new")
        result = self.service(readiness_check=stale).execute_reconstruction(self.command)
        self.assertEqual(result.status, "stale")
        self.assertEqual(self.adapter.calls, 0)
        self.assertEqual(self.storage.get_run(result.run_id).state, RunLifecycleState.STALE)

    def test_adapter_failure_is_persisted_and_not_replayed(self):
        def fail(_context):
            raise ReconstructionAdapterError("synthetic-failure", "Synthetic failure.")
        adapter = CountingAdapter(fail)
        result = self.service(adapter=adapter).execute_reconstruction(self.command)
        self.assertEqual(result.error.code, "adapter-failed")
        self.assertEqual(result.artifacts, [])
        self.assertEqual(self.service(adapter=adapter).execute_reconstruction(self.command), result)
        self.assertEqual(adapter.calls, 1)

    def test_second_adapter_uses_same_service_and_result_contract(self):
        adapter = CountingAdapter(lambda context: replace(
            DeterministicReconstructionMock().reconstruct(context),
            provenance=ProvenanceSource.TEST_DOUBLE, content=b'second adapter output',
        ))
        result = self.service(adapter=adapter).execute_reconstruction(self.command)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.source, "test-double")
        record = self.storage.get_artifact(result.artifacts[0].artifact_id)
        self.assertEqual(self.artifacts.read_bytes(record.artifact), b'second adapter output')

    def test_competing_connection_attaches_without_independent_execution(self):
        other = SQLiteApplicationStorage(self.root / "application.sqlite")
        other.initialize()
        self.addCleanup(other.close)
        competitor = CountingAdapter()
        observations = []
        def during_execution(context):
            try:
                self.service(other, competitor).execute_reconstruction(self.command)
            except OperationServiceError as error:
                observations.append(error.code)
            return DeterministicReconstructionMock().reconstruct(context)
        owner = CountingAdapter(during_execution)
        result = self.service(adapter=owner).execute_reconstruction(self.command)
        self.assertEqual(observations, ["request-in-progress"])
        self.assertEqual(owner.calls, 1)
        self.assertEqual(competitor.calls, 0)
        self.assertEqual(self.service(other, competitor).execute_reconstruction(self.command), result)

    def test_commit_failure_keeps_artifact_inspectable(self):
        class RejectCommit:
            def __init__(proxy, real):
                proxy.real = real
            def __getattr__(proxy, name):
                return getattr(proxy.real, name)
            def create_initial_candidate(proxy, **kwargs):
                raise StorageError("Synthetic commit failure.")
        result = self.service(RejectCommit(self.storage)).execute_reconstruction(self.command)
        self.assertEqual(result.status, "failed")
        record = self.storage.get_artifact(result.artifacts[0].artifact_id)
        self.assertEqual(record.authority, ArtifactAuthority.NON_AUTHORITATIVE)
        self.assertIn(record, self.storage.list_non_authoritative_artifacts())

    def test_result_bookkeeping_failure_never_replays_committed_mutation(self):
        class FailCompletion:
            def __getattr__(proxy, name):
                return getattr(self.storage, name)
            def transition_run(proxy, run_id, state, **kwargs):
                if state is RunLifecycleState.COMPLETED:
                    raise StorageError("Synthetic outcome write failure.")
                return self.storage.transition_run(run_id, state, **kwargs)
        with self.assertRaises(OperationServiceError) as caught:
            self.service(FailCompletion()).execute_reconstruction(self.command)
        self.assertEqual(caught.exception.code, "reconciliation-required")
        run = self.storage.get_run(caught.exception.run_id)
        self.assertEqual(run.state, RunLifecycleState.READY_TO_COMMIT)
        with self.assertRaises(OperationServiceError) as retry:
            self.service().execute_reconstruction(self.command)
        self.assertEqual(retry.exception.code, "reconciliation-required")
        self.assertEqual(self.adapter.calls, 1)

    def test_source_artifact_io_failure_has_stable_sanitized_error(self):
        class UnreadableArtifacts:
            def read_bytes(proxy, artifact):
                raise OSError("Cannot read /private/patient/secret.json")
        service = OperationService(self.storage, UnreadableArtifacts(), self.adapter)
        result = service.execute_reconstruction(self.command)
        self.assertEqual(result.error.code, "artifact-failed")
        self.assertNotIn("/private/", result.model_dump_json())
        self.assertEqual(self.adapter.calls, 0)

    def test_unavailable_and_unsupported_requests_never_execute_adapter(self):
        service = self.service()
        request = {
            "request_id": "measurement-unavailable", "case_id": "case-demo-primary",
            "operation_id": "measure.candidate", "candidate_id": "candidate-demo-primary",
            "expected_revision_id": "candidate-revision-primary-r2", "parameters": {},
        }
        result = service.execute_request(request)
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.error.code, "operation-contract-missing")
        self.assertEqual(service.execute_request(request), result)
        self.assertEqual(service.execute_request({**request, "selection": None}), result)
        stale = service.execute_request({**request, "request_id": "measurement-stale",
            "expected_revision_id": "candidate-revision-primary-r1"})
        self.assertEqual(stale.status, "stale")
        unsupported = service.execute_request({
            "request_id": "unsupported-contour", "case_id": "case-demo-primary",
            "operation_id": "generate.candidate.from_contour", "parameters": {},
        })
        self.assertEqual(unsupported.status, "unsupported")
        self.assertEqual(self.adapter.calls, 0)

    def test_unrecorded_generated_file_is_identifiable_in_failed_run(self):
        class RejectArtifactRecord:
            def __getattr__(proxy, name):
                return getattr(self.storage, name)
            def record_artifact(proxy, record):
                raise StorageError("Synthetic record write failure.")
        result = self.service(RejectArtifactRecord()).execute_reconstruction(self.command)
        self.assertEqual(result.status, "failed")
        self.assertEqual(len(result.artifacts), 1)
        self.assertTrue(result.error.details["artifact_record_missing"])
        stored_result = self.storage.get_run(result.run_id).output
        self.assertEqual(stored_result["artifacts"][0]["artifact_id"],
                         result.artifacts[0].artifact_id)

    def test_direct_generation_reuses_the_canonical_operation_boundary(self):
        request = {
            "case_id": self.command["case_id"], "request_id": self.command["request_id"],
            "operation_id": "generate.candidate",
            "source_anatomy_revision_id": self.command["input_revisions"]["source_anatomy_revision_id"],
            "selection": self.command["references"]["selection"],
            "parameters": self.command["parameters"],
        }
        result = self.service().execute_request(request)
        self.assertEqual(self.service().execute_reconstruction(self.command), result)
        self.assertEqual(self.adapter.calls, 1)

    def test_commit_acknowledgement_failure_preserves_uncertain_success(self):
        class LostCommitAcknowledgement:
            def __getattr__(proxy, name):
                return getattr(self.storage, name)
            def create_initial_candidate(proxy, **kwargs):
                self.storage.create_initial_candidate(**kwargs)
                raise StorageError("Commit acknowledgement was lost.")
        with self.assertRaises(OperationServiceError) as caught:
            self.service(LostCommitAcknowledgement()).execute_reconstruction(self.command)
        self.assertEqual(caught.exception.code, "reconciliation-required")
        self.assertEqual(self.storage.get_run(caught.exception.run_id).state,
                         RunLifecycleState.READY_TO_COMMIT)
        with self.assertRaises(OperationServiceError):
            self.service().execute_reconstruction(self.command)
        self.assertEqual(self.adapter.calls, 1)

    def test_capability_entry_points_share_identity_and_validation(self):
        request = {
            "request_id": "alias-measure", "case_id": "case-demo-primary",
            "operation_id": "measure.candidate", "candidate_id": "candidate-demo-primary",
            "expected_revision_id": "candidate-revision-primary-r2", "parameters": {},
        }
        result = self.service().execute_request(request)
        parsed = TypeAdapter(DirectMechanicalRequest).validate_python(request)
        self.assertEqual(self.service().reject_unavailable(parsed), result)
        unsupported = self.service().execute_request({
            "request_id": "alias-unknown", "case_id": "case-demo-primary",
            "operation_id": "unknown-operation",
        })
        self.assertEqual(self.service().reject_unsupported(
            case_id="case-demo-primary", request_id="alias-unknown",
            operation_id="unknown-operation"), unsupported)


if __name__ == "__main__":
    unittest.main()
