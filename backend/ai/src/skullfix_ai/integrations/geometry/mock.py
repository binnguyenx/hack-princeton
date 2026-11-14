"""Deterministic synthetic reconstruction test double."""

from __future__ import annotations

import json

from skullfix_ai.schemas import ProvenanceSource

from .reconstruction import (
    ReconstructionArtifactOutput,
    ReconstructionContext,
)


MOCK_RECONSTRUCTION_LIMITATION = (
    "This synthetic artifact is not a real reconstruction and makes no "
    "measurement, anatomical-validity, fit, or geometric-quality claim."
)


class DeterministicReconstructionMock:
    """Produce fixture-like JSON without performing geometry computation."""

    def reconstruct(
        self, context: ReconstructionContext
    ) -> ReconstructionArtifactOutput:
        command = context.command
        content = json.dumps(
            {
                "artifact_kind": "synthetic-reconstruction-mock",
                "case_id": command.case_id,
                "fixture_variant": command.parameters.fixture_variant,
                "source_anatomy_revision_id": (
                    context.source_anatomy.revision_id
                ),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return ReconstructionArtifactOutput(
            content=content,
            media_type="application/json",
            spatial_metadata=context.source_anatomy.spatial_metadata,
            provenance=ProvenanceSource.MOCK,
            limitations=(MOCK_RECONSTRUCTION_LIMITATION,),
        )
