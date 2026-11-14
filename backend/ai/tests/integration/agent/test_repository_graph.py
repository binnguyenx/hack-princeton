"""Graph acceptance against real application storage and isolated mock service."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

from skullfix_ai.agent import FakeToolModel, GraphRequest, RepositoryManifestReader, WorkspaceGraph
from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE
from skullfix_ai.integrations.geometry import DeterministicReconstructionMock, ReconstructionAdapterError
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.operations import OperationService
from skullfix_ai.storage import LocalArtifactStore, SQLiteApplicationStorage
from skullfix_ai.tools import SandboxReconstructionBinding, default_tool_registry

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "storage"))
from fixture_loader import seed_demo_state


SPATIAL = {"units": "mm", "space": "left-posterior-superior", "sizes": [2, 3, 4],
           "spacings": [1, 2, 3], "bboxMm": [2, 6, 12]}


class RepositoryGraphTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repository = ApplicationRepository(self.root / "live-test-app")
        self.project = self.repository.create_project("Graph acceptance")
        self.case = self.repository.add_case(self.project["id"], "Graph case")
        self.sample = self.repository.add_sample(self.project["id"], self.case["id"], "Synthetic test volume", True,
                                                 SPATIAL, b"synthetic graph context bytes")
        self.candidate = self.repository.create_candidate(self.sample["id"])
        self.request = GraphRequest(
            request_id="req-graph-live-context", conversation_id="conversation-graph",
            project_id=self.project["id"], case_id=self.case["id"], object_id=self.candidate["candidateId"],
            message="Describe the selected revision metadata.",
        )
        self.workspace = AppWorkspaceAdapter(RepositoryManifestReader(self.repository))

    def test_fresh_authoritative_repository_context_tracks_restore_and_preserves_app_data(self):
        pose = list(IDENTITY_POSE)
        pose[3] = 77
        newer = self.repository.commit_transform(self.candidate["candidateId"], pose)
        self.repository.restore_revision(self.candidate["candidateId"], self.candidate["revisionId"])
        before = self.repository.get_project_manifest(self.project["id"])
        model = FakeToolModel()
        graph = WorkspaceGraph(self.workspace, model, default_tool_registry())
        restored = graph.invoke(self.request)
        self.assertEqual(restored.status, "completed")
        self.assertEqual(restored.context.revision_id, self.candidate["revisionId"])
        self.assertEqual(restored.context.pose, list(IDENTITY_POSE))
        self.assertEqual(restored.context.spatial.model_dump(by_alias=True), SPATIAL)
        self.assertEqual(restored.context.sample_id, self.sample["id"])
        self.assertEqual(restored.context.volume_hash, before["samples"][0]["sourceAnatomy"]["volumeHash"])
        self.assertEqual(self.repository.get_project_manifest(self.project["id"]), before)
        self.repository.restore_revision(self.candidate["candidateId"], newer)
        current = graph.invoke(self.request)
        self.assertEqual(current.context.revision_id, newer)
        self.assertEqual(current.context.pose[3], 77)
        stale = graph.invoke(self.request.model_copy(update={"expected_revision_id": self.candidate["revisionId"]}))
        self.assertEqual(stale.code, "stale-revision")
        self.assertEqual(len(model.calls), 2)

    def sandbox(self, adapter):
        storage = SQLiteApplicationStorage(self.root / "sandbox" / "application.sqlite")
        storage.initialize()
        self.addCleanup(storage.close)
        artifacts = LocalArtifactStore(self.root / "sandbox" / "artifacts")
        seed_demo_state(storage, artifacts)
        samples = json.loads((Path(__file__).resolve().parents[3] / "evaluation/fixtures/requests.json").read_text())
        command = next(item["expected_validated_command"] for item in samples["requests"]
                       if item["sample_id"] == "request-mock-generate-ai")
        service = OperationService(storage, artifacts, adapter)
        binding = SandboxReconstructionBinding(service, command["case_id"], command["input_revisions"]["source_anatomy_revision_id"])
        model = FakeToolModel("generate.candidate", command["parameters"])
        graph = WorkspaceGraph(self.workspace, model, default_tool_registry(sandbox=binding))
        return storage, command, graph

    def test_mock_uses_shared_service_and_sandbox_identities_without_writing_live_repository(self):
        storage, command, graph = self.sandbox(DeterministicReconstructionMock())
        before = self.repository.get_project_manifest(self.project["id"])
        result = graph.invoke(self.request)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.observation.scope, "sandbox")
        operation = result.observation.operation_result
        self.assertEqual(operation.status, "completed")
        self.assertEqual(operation.case_id, command["case_id"])
        self.assertNotEqual(operation.case_id, self.case["id"])
        self.assertEqual(operation.source, "mock")
        self.assertEqual(storage.get_candidate(operation.output_candidate_id).current_revision_id, operation.output_revision_id)
        self.assertIn("Sandbox mock", result.explanation)
        self.assertTrue(all(limitation in result.explanation for limitation in operation.limitations))
        self.assertTrue(all(artifact.media_type == "application/json" for artifact in operation.artifacts))
        self.assertEqual(self.repository.get_project_manifest(self.project["id"]), before)
        duplicate = graph.invoke(self.request)
        self.assertEqual(duplicate.observation.operation_result, operation)
        self.assertEqual(self.repository.get_project_manifest(self.project["id"]), before)

    def test_adapter_failure_explanation_is_grounded_in_the_unsuccessful_service_result(self):
        class FailingAdapter:
            def reconstruct(self, context):
                raise ReconstructionAdapterError("test-failure", "Controlled adapter failure.")
        _, _, graph = self.sandbox(FailingAdapter())
        before = self.repository.get_project_manifest(self.project["id"])
        result = graph.invoke(self.request)
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.code, "adapter-failed")
        self.assertEqual(result.observation.operation_result.status, "failed")
        self.assertIsNone(result.observation.operation_result.output_candidate_id)
        self.assertIn("Controlled adapter failure", result.explanation)
        self.assertNotIn("completed", result.explanation)
        self.assertEqual(self.repository.get_project_manifest(self.project["id"]), before)

    def test_legacy_malformed_metadata_is_unavailable_not_silently_rewritten(self):
        broken = self.repository.add_sample(self.project["id"], self.case["id"], "Legacy invalid metadata", False,
                                             {}, b"legacy bytes")
        before = self.repository.get_project_manifest(self.project["id"])
        model = FakeToolModel()
        graph = WorkspaceGraph(self.workspace, model, default_tool_registry())
        result = graph.invoke(self.request.model_copy(update={"object_id": broken["id"]}))
        self.assertEqual(result.code, "workspace-contract-invalid")
        self.assertEqual(model.calls, [])
        self.assertEqual(self.repository.get_project_manifest(self.project["id"]), before)


if __name__ == "__main__":
    unittest.main()
