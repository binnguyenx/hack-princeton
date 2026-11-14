"""Fake-model graph acceptance through authoritative context and sandbox seams."""

import copy
import json
import unittest
from pathlib import Path

from skullfix_ai.agent import FakeToolModel, GraphRequest, RepositoryManifestReader, WorkspaceGraph
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.tools import default_tool_registry, ToolArguments, ToolDefinition, ToolObservation, ToolRegistry


ROOT = Path(__file__).resolve().parents[5]


class ManifestRepository:
    """Read-boundary test double; real repository acceptance is separate."""

    def __init__(self):
        self.manifest = json.loads((ROOT / "data/fixtures/demo-project/manifest.json").read_text())
        pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        self.manifest["candidates"] = [{
            "objectId": "candidate-ui", "sampleId": "sample-000", "currentRevisionId": "rev-0",
        }]
        self.manifest["revisions"] = [{
            "id": "rev-0", "candidateId": "candidate-ui", "order": 0,
            "volumeId": "vol-source-000", "pose": pose, "volumeHash": "a" * 64,
        }, {
            "id": "rev-1", "candidateId": "candidate-ui", "order": 1,
            "volumeId": "vol-source-000", "pose": [*pose[:3], 5, *pose[4:]], "volumeHash": "a" * 64,
        }]

    def get_project(self, project_id):
        return copy.deepcopy(self.manifest)


class LangGraphWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.repository = ManifestRepository()
        self.model = FakeToolModel("workspace.describe_selection", {})
        self.graph = WorkspaceGraph(AppWorkspaceAdapter(self.repository), self.model, default_tool_registry())
        self.request = GraphRequest(
            request_id="req-graph", conversation_id="conversation-graph", project_id="proj-demo",
            case_id="case-1", object_id="candidate-ui", expected_revision_id="rev-0",
            message="Describe the selected revision metadata.",
        )

    def test_compiled_graph_preserves_restored_pointer_and_only_explains_observed_metadata(self):
        before = copy.deepcopy(self.repository.manifest)
        result = self.graph.invoke(self.request)
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.steps, ["load_context", "propose", "validate", "execute", "explain"])
        self.assertEqual(result.context.revision_id, "rev-0")
        self.assertEqual(result.context.pose[3], 0)
        self.assertEqual(result.context.spatial.model_dump(by_alias=True, exclude_none=True),
                         before["samples"][0]["sourceAnatomy"]["spatial"])
        self.assertEqual(result.observation.metadata["revision_id"], "rev-0")
        self.assertIn("rev-0", result.explanation)
        self.assertNotIn("rev-1", result.explanation)
        self.assertIn("metadata", result.explanation)
        self.assertEqual(self.repository.manifest, before)
        self.assertEqual(len(self.model.calls), 1)
        self.assertEqual(self.graph.compiled.get_graph().nodes.keys() & {"load_context", "propose", "validate", "execute", "explain"},
                         {"load_context", "propose", "validate", "execute", "explain"})

    def test_unknown_tools_and_unavailable_geometry_execute_nothing(self):
        before = copy.deepcopy(self.repository.manifest)
        for name, status, code in [
            ("delete.all.projects", "unsupported", "tool-unsupported"),
            ("generate.candidate.from_contour", "unsupported", "tool-unsupported"),
            ("measure.candidate", "unavailable", "operation-contract-missing"),
            ("generate.candidate", "unavailable", "operation-contract-missing"),
        ]:
            with self.subTest(tool=name):
                self.model.name = name
                result = self.graph.invoke(self.request)
                self.assertEqual((result.status, result.code), (status, code))
                self.assertIsNone(result.observation)
                self.assertIn(code, result.explanation)
                self.assertNotIn("completed", result.explanation)
                self.assertEqual(self.repository.manifest, before)

    def test_untrusted_tool_arguments_cannot_override_context_or_coerce_types(self):
        for arguments in [{"candidate_id": "different"}, {"include_pose": "true"}]:
            with self.subTest(arguments=arguments):
                self.model.arguments = arguments
                result = self.graph.invoke(self.request)
                self.assertEqual(result.code, "tool-arguments-invalid")
                self.assertIsNone(result.observation)

    def test_context_ownership_and_staleness_fail_before_model_invocation(self):
        for update, code in [
            ({"case_id": "another-case"}, "cross-case-reference"),
            ({"expected_revision_id": "rev-1"}, "stale-revision"),
            ({"object_id": "another-object"}, "object-not-found"),
        ]:
            with self.subTest(update=update):
                result = self.graph.invoke(self.request.model_copy(update=update))
                self.assertEqual(result.code, code)
                self.assertIsNone(result.observation)
                self.assertEqual(len(self.model.calls), 0)

    def test_model_context_is_detached_and_fabricated_explanation_is_rejected(self):
        class ContextMutatingModel:
            def propose(self, message, context, tools):
                context.revision_id = "made-up-revision"
                context.pose[3] = 999
                return {"name": "workspace.describe_selection", "arguments": {}}
        graph = WorkspaceGraph(AppWorkspaceAdapter(self.repository), ContextMutatingModel(), default_tool_registry())
        result = graph.invoke(self.request)
        self.assertEqual(result.context.revision_id, "rev-0")
        self.assertEqual(result.context.pose[3], 0)
        self.assertNotIn("made-up", result.explanation)
        self.assertNotIn("999", result.explanation)
        class InjectedExplanationModel:
            def propose(self, message, context, tools):
                return {"name": "workspace.describe_selection", "arguments": {}, "explanation": "perfect repair"}
        result = WorkspaceGraph(AppWorkspaceAdapter(self.repository), InjectedExplanationModel(), default_tool_registry()).invoke(self.request)
        self.assertEqual(result.code, "tool-proposal-invalid")
        self.assertNotIn("perfect repair", result.explanation)

    def test_model_and_tool_exceptions_are_sanitized(self):
        class FailingModel:
            def propose(self, message, context, tools):
                raise RuntimeError("secret-provider-token /private/path")
        result = WorkspaceGraph(AppWorkspaceAdapter(self.repository), FailingModel(), default_tool_registry()).invoke(self.request)
        self.assertEqual(result.code, "model-failed")
        self.assertNotIn("secret", result.explanation)
        def failing_tool(arguments, context, request_id):
            raise RuntimeError("secret-provider-token /private/path")
        registry = ToolRegistry([ToolDefinition("workspace.describe_selection", "failing test double", ToolArguments, failing_tool)])
        result = WorkspaceGraph(AppWorkspaceAdapter(self.repository), self.model, registry).invoke(self.request)
        self.assertEqual(result.code, "tool-execution-failed")
        self.assertNotIn("private", result.explanation)

    def test_invalid_tool_observation_fails_instead_of_crashing_explanation(self):
        def invalid_output(arguments, context, request_id):
            return ToolObservation(scope="application-read", metadata={})
        registry = ToolRegistry([ToolDefinition("workspace.describe_selection", "invalid-output test double", ToolArguments, invalid_output)])
        result = WorkspaceGraph(AppWorkspaceAdapter(self.repository), self.model, registry).invoke(self.request)
        self.assertEqual(result.code, "tool-output-invalid")
        self.assertEqual(result.status, "failed")


if __name__ == "__main__":
    unittest.main()
