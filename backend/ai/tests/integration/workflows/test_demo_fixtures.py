"""Validate deterministic demo fixtures through shared production schemas."""

import hashlib
import json
import unittest
from pathlib import Path

from pydantic import TypeAdapter

from skullfix_ai.schemas import (
    AIAssistedRequest,
    DirectMechanicalRequest,
    FixtureArtifactLocation,
    OperationResult,
    ProvenanceSource,
    ReconstructionMockCommand,
    SelectionReference,
    Sha256Digest,
    SpatialMetadata,
)


FIXTURE_DIRECTORY = Path(__file__).resolve().parents[3] / "evaluation" / "fixtures"


def load_json(name):
    return json.loads((FIXTURE_DIRECTORY / name).read_text(encoding="utf-8"))


def spatial_metadata_records(state):
    for case in state["cases"]:
        yield case["source_anatomy"]["spatial_metadata"]
        for candidate in case["candidates"]:
            for revision in candidate["revisions"]:
                yield revision["spatial_metadata"]


class DemoFixtureValidationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = load_json("demo-state.json")
        cls.requests = load_json("requests.json")
        cls.results = load_json("expected-results.json")

    def test_fixture_versions_match(self):
        versions = {
            self.state["fixture_version"],
            self.requests["fixture_version"],
            self.results["fixture_version"],
        }
        self.assertEqual(versions, {"skullfix-demo-v1"})

    def test_persistent_ids_are_globally_unique(self):
        ids = []
        ids.extend(artifact["artifact_id"] for artifact in self.state["artifacts"])
        for case in self.state["cases"]:
            ids.append(case["case_id"])
            ids.append(case["source_anatomy"]["revision_id"])
            for candidate in case["candidates"]:
                ids.append(candidate["candidate_id"])
                ids.extend(revision["revision_id"] for revision in candidate["revisions"])
            ids.extend(region["region_id"] for region in case["persisted_regions"])
        ids.extend(result["review_result_id"] for result in self.state["review_results"])

        self.assertEqual(len(ids), len(set(ids)))

    def test_artifact_paths_resolve_and_hashes_match(self):
        base = (FIXTURE_DIRECTORY / self.state["artifact_base_directory"]).resolve()
        self.assertTrue(base.is_dir())

        for artifact in self.state["artifacts"]:
            FixtureArtifactLocation.model_validate(
                {"relative_path": artifact["path"]}
            )
            TypeAdapter(Sha256Digest).validate_python(artifact["content_hash"])
            TypeAdapter(ProvenanceSource).validate_python(artifact["provenance"])
            relative_path = Path(artifact["path"])
            self.assertFalse(relative_path.is_absolute())
            resolved = (base / relative_path).resolve()
            self.assertTrue(resolved.is_relative_to(base))
            self.assertTrue(resolved.is_file())
            digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
            self.assertEqual(artifact["content_hash"], f"sha256:{digest}")

    def test_revision_parentage_and_current_pointers_are_consistent(self):
        artifact_ids = {artifact["artifact_id"] for artifact in self.state["artifacts"]}

        for case in self.state["cases"]:
            self.assertIn(case["source_anatomy"]["artifact_id"], artifact_ids)
            for candidate in case["candidates"]:
                revisions = {
                    revision["revision_id"]: revision
                    for revision in candidate["revisions"]
                }
                self.assertIn(candidate["current_revision_id"], revisions)

                for revision in revisions.values():
                    self.assertIn(revision["artifact_id"], artifact_ids)
                    parent = revision["parent_revision_id"]
                    if parent is not None:
                        self.assertIn(parent, revisions)
                        self.assertNotEqual(parent, revision["revision_id"])

                for revision_id in revisions:
                    visited = set()
                    current = revision_id
                    while current is not None:
                        self.assertNotIn(current, visited)
                        visited.add(current)
                        current = revisions[current]["parent_revision_id"]

    def test_spatial_metadata_conforms_to_shared_contract(self):
        for metadata in spatial_metadata_records(self.state):
            self.assertEqual(
                SpatialMetadata.model_validate(metadata).model_dump(mode="json"),
                metadata,
            )

    def test_selections_and_review_results_reference_one_case(self):
        revision_cases = {}
        candidate_cases = {}
        frames = {}
        for case in self.state["cases"]:
            case_id = case["case_id"]
            source = case["source_anatomy"]
            revision_cases[source["revision_id"]] = case_id
            frames[source["revision_id"]] = source["spatial_metadata"]["coordinate_frame"]
            for candidate in case["candidates"]:
                candidate_cases[candidate["candidate_id"]] = case_id
                for revision in candidate["revisions"]:
                    revision_cases[revision["revision_id"]] = case_id
                    frames[revision["revision_id"]] = revision["spatial_metadata"][
                        "coordinate_frame"
                    ]

        selection_ids = set()
        for selection in self.state["selections"]:
            SelectionReference.model_validate(
                {
                    key: value
                    for key, value in selection.items()
                    if key != "case_id"
                }
            )
            self.assertNotIn(selection["selection_id"], selection_ids)
            selection_ids.add(selection["selection_id"])
            revision_id = selection["geometry_revision_id"]
            self.assertEqual(revision_cases[revision_id], selection["case_id"])
            self.assertEqual(frames[revision_id], selection["coordinate_frame"])

        for review in self.state["review_results"]:
            self.assertEqual(revision_cases[review["revision_id"]], review["case_id"])
            self.assertEqual(candidate_cases[review["candidate_id"]], review["case_id"])
            self.assertEqual(review["provenance"], "test-double")
            self.assertNotIn("value", review["output"])

    def test_mock_artifacts_and_revisions_are_explicitly_labeled(self):
        artifacts = {
            artifact["artifact_id"]: artifact for artifact in self.state["artifacts"]
        }
        for case in self.state["cases"]:
            for candidate in case["candidates"]:
                for revision in candidate["revisions"]:
                    self.assertEqual(revision["provenance"], "mock")
                    artifact = artifacts[revision["artifact_id"]]
                    self.assertEqual(artifact["provenance"], "mock")
                    limitations = " ".join(artifact["limitations"]).lower()
                    self.assertIn("not a real reconstruction", limitations)

        for path in (
            FIXTURE_DIRECTORY / self.state["artifact_base_directory"]
        ).glob("*.json"):
            asset = json.loads(path.read_text(encoding="utf-8"))
            self.assertFalse(asset["patient_data"])
            self.assertFalse(asset["anatomically_valid"])

    def test_request_samples_reference_known_fixture_objects(self):
        cases = {case["case_id"] for case in self.state["cases"]}
        candidates = {
            candidate["candidate_id"]
            for case in self.state["cases"]
            for candidate in case["candidates"]
        }
        revisions = {
            case["source_anatomy"]["revision_id"]
            for case in self.state["cases"]
        }
        revisions.update(
            revision["revision_id"]
            for case in self.state["cases"]
            for candidate in case["candidates"]
            for revision in candidate["revisions"]
        )
        selections = {
            selection["selection_id"] for selection in self.state["selections"]
        }

        for sample in self.requests["requests"]:
            payload = sample["payload"]
            if sample["path"] == "ai":
                AIAssistedRequest.model_validate(payload)
            else:
                TypeAdapter(DirectMechanicalRequest).validate_python(payload)
            self.assertIn(payload["case_id"], cases)
            if "candidate_id" in payload:
                self.assertIn(payload["candidate_id"], candidates)
            for field in ("expected_revision_id", "source_anatomy_revision_id"):
                if field in payload:
                    self.assertIn(payload[field], revisions)
            if "selection" in payload:
                self.assertIn(payload["selection"]["selection_id"], selections)
                self.assertIn(payload["selection"]["geometry_revision_id"], revisions)
            if "expected_validated_command" in sample:
                command = sample["expected_validated_command"]
                ReconstructionMockCommand.model_validate(command)
                self.assertEqual(command["request_id"], payload["request_id"])
                self.assertEqual(command["case_id"], payload["case_id"])
                self.assertIn(
                    command["input_revisions"]["source_anatomy_revision_id"],
                    revisions,
                )
                self.assertIn(
                    command["references"]["selection"]["selection_id"],
                    selections,
                )

        converged = [
            sample["expected_validated_command"].copy()
            for sample in self.requests["requests"]
            if "expected_validated_command" in sample
        ]
        self.assertEqual(len(converged), 2)
        for command in converged:
            command.pop("request_id")
        self.assertEqual(converged[0], converged[1])

    def test_idempotency_samples_include_identical_and_conflicting_payloads(self):
        samples = {
            sample["sample_id"]: sample["payload"]
            for sample in self.requests["requests"]
        }
        original = samples["request-duplicate-original"]
        retry = samples["request-duplicate-identical-retry"]
        conflict = samples["request-duplicate-conflict"]

        self.assertEqual(original, retry)
        self.assertEqual(original["request_id"], conflict["request_id"])
        self.assertEqual(original["case_id"], conflict["case_id"])
        self.assertNotEqual(original["parameters"], conflict["parameters"])

    def test_negative_samples_are_structural_inputs_for_application_validation(self):
        samples = {
            sample["sample_id"]: sample["payload"]
            for sample in self.requests["requests"]
        }
        selection_cases = {
            selection["selection_id"]: selection["case_id"]
            for selection in self.state["selections"]
        }
        current_revisions = {
            candidate["candidate_id"]: candidate["current_revision_id"]
            for case in self.state["cases"]
            for candidate in case["candidates"]
        }

        cross_case = AIAssistedRequest.model_validate(
            samples["request-cross-case-selection"]
        )
        self.assertNotEqual(
            cross_case.case_id,
            selection_cases[cross_case.selection.selection_id],
        )

        stale = TypeAdapter(DirectMechanicalRequest).validate_python(
            samples["request-stale-measurement"]
        )
        self.assertNotEqual(
            stale.expected_revision_id,
            current_revisions[stale.candidate_id],
        )

    def test_expected_results_use_common_envelope_and_known_references(self):
        request_samples = {
            sample["sample_id"]: sample for sample in self.requests["requests"]
        }
        artifacts = {
            artifact["artifact_id"]: artifact for artifact in self.state["artifacts"]
        }
        required_fields = {
            "run_id",
            "request_id",
            "case_id",
            "operation_id",
            "status",
            "input_revisions",
            "output_candidate_id",
            "output_revision_id",
            "artifacts",
            "output",
            "source",
            "limitations",
            "error",
        }

        for result in self.results["results"]:
            request = request_samples[result["for_request_sample_id"]]["payload"]
            envelope = result["envelope"]
            TypeAdapter(OperationResult).validate_python(envelope)
            self.assertEqual(set(envelope), required_fields)
            self.assertEqual(envelope["request_id"], request["request_id"])
            self.assertEqual(envelope["case_id"], request["case_id"])
            for artifact_reference in envelope["artifacts"]:
                artifact = artifacts[artifact_reference["artifact_id"]]
                self.assertEqual(
                    artifact_reference["content_hash"], artifact["content_hash"]
                )
                self.assertEqual(
                    artifact_reference["media_type"], artifact["media_type"]
                )

        mock_result = self.results["results"][0]["envelope"]
        self.assertEqual(mock_result["source"], "mock")
        self.assertIn(
            "not a real reconstruction",
            " ".join(mock_result["limitations"]).lower(),
        )

        unavailable = self.results["results"][1]["envelope"]
        self.assertEqual(unavailable["status"], "unavailable")
        self.assertIsNone(unavailable["output"])
        self.assertEqual(unavailable["artifacts"], [])
        self.assertEqual(unavailable["error"]["code"], "operation-contract-missing")


if __name__ == "__main__":
    unittest.main()
