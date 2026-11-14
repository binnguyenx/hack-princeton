"""Test-only loader for the deterministic demo state."""

from __future__ import annotations

import json
from pathlib import Path

from skullfix_ai.schemas import ProvenanceSource, SpatialMetadata
from skullfix_ai.storage import (
    ApplicationStorage,
    ArtifactAuthority,
    ArtifactRecord,
    ArtifactStore,
    CaseRecord,
    NewCandidateRevision,
    ReconciliationState,
    ReviewResultRecord,
    SourceAnatomyRecord,
)


FIXTURE_DIRECTORY = Path(__file__).resolve().parents[3] / "evaluation" / "fixtures"


def seed_demo_state(
    storage: ApplicationStorage,
    artifact_store: ArtifactStore,
) -> None:
    """Seed synthetic fixtures through public interfaces for storage tests."""

    state = json.loads(
        (FIXTURE_DIRECTORY / "demo-state.json").read_text(encoding="utf-8")
    )
    artifact_sources = {
        artifact["artifact_id"]: artifact for artifact in state["artifacts"]
    }
    artifact_cases: dict[str, str] = {}
    for case in state["cases"]:
        storage.create_case(CaseRecord(case["case_id"], case["label"]))
        artifact_cases[case["source_anatomy"]["artifact_id"]] = case["case_id"]
        for candidate in case["candidates"]:
            for revision in candidate["revisions"]:
                artifact_cases[revision["artifact_id"]] = case["case_id"]

    source_directory = (
        FIXTURE_DIRECTORY / state["artifact_base_directory"]
    ).resolve()
    for artifact_id, artifact in artifact_sources.items():
        stored = artifact_store.ingest_file(
            artifact_id=artifact_id,
            source=source_directory / artifact["path"],
            media_type=artifact["media_type"],
        )
        if stored.content_hash != artifact["content_hash"]:
            raise AssertionError(f"fixture hash mismatch for {artifact_id}")
        storage.record_artifact(
            ArtifactRecord(
                case_id=artifact_cases[artifact_id],
                artifact=stored,
                provenance=ProvenanceSource(artifact["provenance"]),
                limitations=tuple(artifact["limitations"]),
                authority=ArtifactAuthority.PENDING,
                reconciliation_state=ReconciliationState.PENDING,
            )
        )

    for case in state["cases"]:
        source = case["source_anatomy"]
        storage.create_source_anatomy(
            SourceAnatomyRecord(
                case_id=case["case_id"],
                revision_id=source["revision_id"],
                artifact_id=source["artifact_id"],
                spatial_metadata=SpatialMetadata.model_validate(
                    source["spatial_metadata"]
                ),
            )
        )
        for candidate in case["candidates"]:
            revisions = candidate["revisions"]
            initial = revisions[0]
            storage.create_initial_candidate(
                case_id=case["case_id"],
                candidate_id=candidate["candidate_id"],
                source_anatomy_revision_id=source["revision_id"],
                revision=_new_revision(initial),
            )
            current_revision_id = initial["revision_id"]
            for revision in revisions[1:]:
                storage.commit_child_revision(
                    case_id=case["case_id"],
                    candidate_id=candidate["candidate_id"],
                    expected_revision_id=current_revision_id,
                    revision=_new_revision(revision),
                )
                current_revision_id = revision["revision_id"]

    for review in state["review_results"]:
        storage.add_review_result(
            ReviewResultRecord(
                review_result_id=review["review_result_id"],
                case_id=review["case_id"],
                candidate_id=review["candidate_id"],
                revision_id=review["revision_id"],
                operation_id=review["operation_id"],
                method_id=review["method_id"],
                output=review["output"],
                provenance=ProvenanceSource(review["provenance"]),
                limitations=tuple(review["limitations"]),
            )
        )


def _new_revision(revision: dict[str, object]) -> NewCandidateRevision:
    return NewCandidateRevision(
        revision_id=str(revision["revision_id"]),
        parent_revision_id=(
            str(revision["parent_revision_id"])
            if revision["parent_revision_id"] is not None
            else None
        ),
        operation_id=str(revision["operation_id"]),
        validated_parameters=dict(revision["validated_parameters"]),
        artifact_id=str(revision["artifact_id"]),
        spatial_metadata=SpatialMetadata.model_validate(
            revision["spatial_metadata"]
        ),
        provenance=ProvenanceSource(str(revision["provenance"])),
    )
