"""Contract tests for the deterministic reconstruction mock."""

from __future__ import annotations

import json
import unittest

from skullfix_ai.integrations.geometry import (
    MOCK_RECONSTRUCTION_LIMITATION,
    DeterministicReconstructionMock,
    ReconstructionAdapter,
    ReconstructionContext,
)
from skullfix_ai.schemas import (
    ProvenanceSource,
    ReconstructionMockCommand,
    SpatialMetadata,
)
from skullfix_ai.storage import (
    ArtifactAuthority,
    ArtifactRecord,
    ReconciliationState,
    SourceAnatomyRecord,
    StoredArtifact,
)


class ReconstructionMockTest(unittest.TestCase):
    def test_mock_satisfies_adapter_and_returns_disclosed_synthetic_output(
        self,
    ) -> None:
        adapter: ReconstructionAdapter = DeterministicReconstructionMock()
        spatial = SpatialMetadata.model_validate(
            {
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
        )
        source_artifact = ArtifactRecord(
            case_id="case-001",
            artifact=StoredArtifact(
                artifact_id="artifact-source",
                content_hash=f"sha256:{'0' * 64}",
                media_type="application/json",
                retrieval_url="/api/artifacts/artifact-source",
                relative_path="objects/source.blob",
            ),
            provenance=ProvenanceSource.TEST_DOUBLE,
            limitations=("Synthetic source.",),
            authority=ArtifactAuthority.AUTHORITATIVE,
            reconciliation_state=ReconciliationState.NOT_REQUIRED,
        )
        command = ReconstructionMockCommand.model_validate(
            {
                "request_id": "request-001",
                "case_id": "case-001",
                "operation_id": "generate.candidate",
                "input_revisions": {
                    "source_anatomy_revision_id": "source-revision-001"
                },
                "parameters": {"fixture_variant": "deterministic-default"},
            }
        )

        output = adapter.reconstruct(
            ReconstructionContext(
                command=command,
                source_anatomy=SourceAnatomyRecord(
                    case_id="case-001",
                    revision_id="source-revision-001",
                    artifact_id="artifact-source",
                    spatial_metadata=spatial,
                ),
                source_artifact=source_artifact,
                source_content=b'{"synthetic":"source"}',
            )
        )

        self.assertEqual(output.provenance, ProvenanceSource.MOCK)
        self.assertEqual(output.spatial_metadata, spatial)
        self.assertEqual(output.limitations, (MOCK_RECONSTRUCTION_LIMITATION,))
        self.assertEqual(
            json.loads(output.content),
            {
                "artifact_kind": "synthetic-reconstruction-mock",
                "case_id": "case-001",
                "fixture_variant": "deterministic-default",
                "source_anatomy_revision_id": "source-revision-001",
            },
        )


if __name__ == "__main__":
    unittest.main()
