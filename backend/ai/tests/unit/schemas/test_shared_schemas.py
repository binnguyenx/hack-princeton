"""Behavioral tests for the shared AI/backend contract schemas."""

from __future__ import annotations

import unittest

from pydantic import TypeAdapter, ValidationError

from skullfix_ai.schemas import (
    AIAssistedRequest,
    CompletedReconstructionMockResult,
    CoordinateTransform,
    DirectMechanicalRequest,
    OperationEvent,
    OperationResult,
    ProgressEvent,
    PublicArtifactReference,
    ReconstructionMockCommand,
    SelectionReference,
    SpatialMetadata,
    TerminalResultEvent,
    UnsuccessfulOperationResult,
)


class ArtifactSchemaTests(unittest.TestCase):
    def test_public_artifact_round_trips_only_the_canonical_retrieval_field(self) -> None:
        payload = {
            "artifact_id": "artifact-demo-001",
            "content_hash": "sha256:" + "a" * 64,
            "media_type": "application/json",
            "retrieval_url": "/api/artifacts/artifact-demo-001",
        }

        artifact = PublicArtifactReference.model_validate(payload)

        self.assertEqual(artifact.model_dump(mode="json"), payload)

        legacy_payload = dict(payload)
        legacy_payload["retrieval_reference"] = legacy_payload.pop("retrieval_url")
        with self.assertRaises(ValidationError):
            PublicArtifactReference.model_validate(legacy_payload)
        with self.assertRaises(ValidationError):
            PublicArtifactReference.model_validate(
                {**payload, "retrieval_url": "artifacts/local-file.json"}
            )


class SpatialSchemaTests(unittest.TestCase):
    def test_spatial_metadata_preserves_unit_frame_and_transform_direction(self) -> None:
        payload = {
            "units": "unitless",
            "coordinate_frame": "fixture-primary-local",
            "transforms": [
                {
                    "from_frame": "fixture-primary-local",
                    "to_frame": "fixture-primary-local",
                    "matrix": [
                        [1, 0, 0, 0],
                        [0, 1, 0, 0],
                        [0, 0, 1, 0],
                        [0, 0, 0, 1],
                    ],
                }
            ],
        }

        metadata = SpatialMetadata.model_validate(payload)

        self.assertEqual(metadata.model_dump(mode="json"), payload)

    def test_transform_rejects_wrong_dimensions_and_nonfinite_values(self) -> None:
        base = {
            "from_frame": "source",
            "to_frame": "target",
            "matrix": [[1.0, 0.0, 0.0, 0.0]] * 4,
        }
        CoordinateTransform.model_validate(base)

        with self.assertRaises(ValidationError):
            CoordinateTransform.model_validate({**base, "matrix": base["matrix"][:3]})

        nonfinite = [row[:] for row in base["matrix"]]
        nonfinite[0][0] = float("nan")
        with self.assertRaises(ValidationError):
            CoordinateTransform.model_validate({**base, "matrix": nonfinite})
        with self.assertRaises(ValidationError):
            SpatialMetadata.model_validate(
                {
                    "units": "unitless",
                    "coordinate_frame": "fixture-primary-local",
                    "transforms": [],
                }
            )

    def test_selection_reference_requires_revision_and_frame_context(self) -> None:
        payload = {
            "selection_id": "selection-source-primary",
            "kind": "source-anatomy",
            "geometry_revision_id": "anatomy-revision-primary-v1",
            "coordinate_frame": "fixture-primary-local",
        }

        self.assertEqual(
            SelectionReference.model_validate(payload).model_dump(
                mode="json", exclude_none=True
            ),
            payload,
        )

        with self.assertRaises(ValidationError):
            SelectionReference.model_validate(
                {key: value for key, value in payload.items() if key != "coordinate_frame"}
            )


class RequestAndCommandSchemaTests(unittest.TestCase):
    def test_initial_generation_requires_source_but_not_existing_candidate(self) -> None:
        payload = {
            "request_id": "request-demo-001",
            "case_id": "case-demo-primary",
            "operation_id": "generate.candidate",
            "source_anatomy_revision_id": "anatomy-revision-primary-v1",
            "parameters": {"fixture_variant": "deterministic-default"},
        }

        request = TypeAdapter(DirectMechanicalRequest).validate_python(payload)

        self.assertEqual(request.model_dump(mode="json", exclude_none=True), payload)

        with self.assertRaises(ValidationError):
            TypeAdapter(DirectMechanicalRequest).validate_python(
                {
                    **payload,
                    "candidate_id": "candidate-that-must-not-be-required-or-accepted",
                }
            )

    def test_candidate_dependent_unavailable_request_requires_candidate_revision(self) -> None:
        payload = {
            "request_id": "request-measure-001",
            "case_id": "case-demo-primary",
            "operation_id": "measure.candidate",
            "candidate_id": "candidate-demo-primary",
            "expected_revision_id": "candidate-revision-primary-r2",
            "parameters": {},
        }

        request = TypeAdapter(DirectMechanicalRequest).validate_python(payload)
        self.assertEqual(request.operation_id, "measure.candidate")

        payload.pop("expected_revision_id")
        with self.assertRaises(ValidationError):
            TypeAdapter(DirectMechanicalRequest).validate_python(payload)

    def test_comparison_requires_two_explicit_revisions(self) -> None:
        payload = {
            "request_id": "request-compare-001",
            "case_id": "case-demo-primary",
            "operation_id": "compare.revisions",
            "candidate_id": "candidate-demo-primary",
            "revision_ids": [
                "candidate-revision-primary-r1",
                "candidate-revision-primary-r2",
            ],
            "parameters": {},
        }
        TypeAdapter(DirectMechanicalRequest).validate_python(payload)

        payload["revision_ids"] = ["candidate-revision-primary-r1"]
        with self.assertRaises(ValidationError):
            TypeAdapter(DirectMechanicalRequest).validate_python(payload)

    def test_ai_request_requires_message_but_does_not_accept_operation_selection(self) -> None:
        payload = {
            "request_id": "request-ai-001",
            "conversation_id": "conversation-demo-001",
            "case_id": "case-demo-primary",
            "message": "Generate the available demo candidate.",
            "selection": {
                "selection_id": "selection-source-primary",
                "kind": "source-anatomy",
                "geometry_revision_id": "anatomy-revision-primary-v1",
                "coordinate_frame": "fixture-primary-local",
            },
        }

        request = AIAssistedRequest.model_validate(payload)
        self.assertFalse(hasattr(request, "operation_id"))

        with self.assertRaises(ValidationError):
            AIAssistedRequest.model_validate(
                {**payload, "operation_id": "generate.candidate"}
            )
        with self.assertRaises(ValidationError):
            AIAssistedRequest.model_validate({**payload, "request_id": 123})

    def test_canonical_mock_command_preserves_full_selection_context(self) -> None:
        payload = {
            "request_id": "request-ai-001",
            "case_id": "case-demo-primary",
            "operation_id": "generate.candidate",
            "input_revisions": {
                "source_anatomy_revision_id": "anatomy-revision-primary-v1"
            },
            "references": {
                "selection": {
                    "selection_id": "selection-source-primary",
                    "kind": "source-anatomy",
                    "geometry_revision_id": "anatomy-revision-primary-v1",
                    "coordinate_frame": "fixture-primary-local",
                }
            },
            "parameters": {"fixture_variant": "deterministic-default"},
        }

        command = ReconstructionMockCommand.model_validate(payload)
        self.assertEqual(
            command.model_dump(mode="json", exclude_none=True),
            payload,
        )

        payload["references"] = {"selection_id": "selection-source-primary"}
        with self.assertRaises(ValidationError):
            ReconstructionMockCommand.model_validate(payload)


class ResultAndEventSchemaTests(unittest.TestCase):
    def completed_payload(self) -> dict[str, object]:
        return {
            "run_id": "run-demo-001",
            "request_id": "request-demo-001",
            "case_id": "case-demo-primary",
            "operation_id": "generate.candidate",
            "status": "completed",
            "input_revisions": {
                "source_anatomy_revision_id": "anatomy-revision-primary-v1"
            },
            "output_candidate_id": "candidate-demo-generated",
            "output_revision_id": "candidate-revision-generated-r1",
            "artifacts": [
                {
                    "artifact_id": "artifact-candidate-demo-r1",
                    "content_hash": "sha256:" + "a" * 64,
                    "media_type": "application/json",
                    "retrieval_url": "/api/artifacts/artifact-candidate-demo-r1",
                }
            ],
            "output": {
                "kind": "candidate-generation",
                "spatial_metadata": {
                    "units": "unitless",
                    "coordinate_frame": "fixture-primary-local",
                    "transforms": [
                        {
                            "from_frame": "fixture-primary-local",
                            "to_frame": "fixture-primary-local",
                            "matrix": [
                                [1, 0, 0, 0],
                                [0, 1, 0, 0],
                                [0, 0, 1, 0],
                                [0, 0, 0, 1],
                            ],
                        }
                    ],
                },
            },
            "source": "mock",
            "limitations": [
                "Synthetic mock only; no anatomical or geometric-quality claim."
            ],
            "error": None,
        }

    def test_completed_mock_result_requires_typed_output_and_mock_disclosure(self) -> None:
        payload = self.completed_payload()

        result = CompletedReconstructionMockResult.model_validate(payload)

        self.assertEqual(result.output.spatial_metadata.units, "unitless")
        self.assertEqual(
            TypeAdapter(OperationResult)
            .validate_python(payload)
            .model_dump(mode="json"),
            payload,
        )

        with self.assertRaises(ValidationError):
            CompletedReconstructionMockResult.model_validate(
                {**payload, "source": "real-operation"}
            )
        CompletedReconstructionMockResult.model_validate(
            {**payload, "source": "test-double"}
        )
        with self.assertRaises(ValidationError):
            CompletedReconstructionMockResult.model_validate(
                {**payload, "limitations": []}
            )

    def test_unsuccessful_result_requires_error_and_never_claims_committed_revision(self) -> None:
        payload = {
            "run_id": "run-demo-failed-001",
            "request_id": "request-demo-failed-001",
            "case_id": "case-demo-primary",
            "operation_id": None,
            "status": "failed",
            "input_revisions": {},
            "output_candidate_id": None,
            "output_revision_id": None,
            "artifacts": [],
            "output": None,
            "source": None,
            "limitations": [],
            "error": {
                "code": "operation-selection-failed",
                "message": "No operation was selected.",
                "details": {},
            },
        }
        UnsuccessfulOperationResult.model_validate(payload)

        with self.assertRaises(ValidationError):
            UnsuccessfulOperationResult.model_validate(
                {**payload, "error": None}
            )
        with self.assertRaises(ValidationError):
            UnsuccessfulOperationResult.model_validate(
                {**payload, "output_revision_id": "revision-not-committed"}
            )

        stale_with_artifact = {
            **payload,
            "operation_id": "generate.candidate",
            "status": "stale",
            "artifacts": self.completed_payload()["artifacts"],
            "source": "mock",
            "limitations": ["Produced artifact is non-authoritative."],
        }
        UnsuccessfulOperationResult.model_validate(stale_with_artifact)

    def test_events_distinguish_progress_from_the_single_terminal_shape(self) -> None:
        progress = {
            "event": "progress",
            "run_id": "run-demo-001",
            "request_id": "request-demo-001",
            "case_id": "case-demo-primary",
            "step": "executing",
        }
        terminal = {
            "event": "result",
            "result": self.completed_payload(),
        }

        self.assertIsInstance(
            TypeAdapter(OperationEvent).validate_python(progress), ProgressEvent
        )
        self.assertIsInstance(
            TypeAdapter(OperationEvent).validate_python(terminal),
            TerminalResultEvent,
        )

        with self.assertRaises(ValidationError):
            ProgressEvent.model_validate({**progress, "step": "completed"})


if __name__ == "__main__":
    unittest.main()
