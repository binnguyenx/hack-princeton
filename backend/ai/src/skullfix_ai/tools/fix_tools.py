"""Agent tools for the predicted bone fix (cranial-reconstruction-candidate R20, R21).

propose_predicted_fix only *stages* a proposal through the per-turn sink; a human Accept runs the
same reconstruct.model operation as the canvas button. describe_predicted_fix is read-only and
returns the fix report, so replies can quote only numbers present in it.
"""
from __future__ import annotations

import json
from typing import Literal

from langchain_core.tools import tool

from skullfix_ai.schemas.workspace import AppObjectContext


def propose_predicted_fix_factory(sink, context: AppObjectContext):
    @tool
    def propose_predicted_fix(action: Literal['generate', 'threshold', 'region'], summary: str,
                              threshold: float | None = None, region: list[list[int]] | None = None) -> str:
        """Stage a predicted bone fix for the user to accept. Nothing runs until they click Accept.

        action='generate' runs the cranial model on the selected skull (new "Predicted fix" candidate).
        action='threshold' re-cuts the selected predicted fix at threshold 0.1–0.9 (higher = tighter, smaller).
        action='region' keeps only fix voxels inside region [[i0, j0, k0], [i1, j1, k1]] (voxel indices).
        """
        payload = {'action': action, 'threshold': threshold, 'region': region}
        proposal = sink.stage(kind='model_fix', summary=summary, payload=payload)
        return json.dumps({'status': 'STAGED', 'proposal_id': proposal.proposal_id,
                           'note': 'Waiting for the user to accept. Nothing has run yet.'})
    return propose_predicted_fix


def selected_model_fix(repository, context: AppObjectContext) -> bool:
    if context.candidate_id is None:
        return False
    manifest = repository.get_project_manifest(context.project_id)
    revision = next((r for r in manifest['revisions'] if r['id'] == context.revision_id), None)
    return bool(revision and (revision.get('provenance') or {}).get('operation') == 'reconstruct.model')


def build_fix_read_tools(repository, context: AppObjectContext) -> list:
    """Bound only when the selection is a predicted fix candidate."""
    if not selected_model_fix(repository, context):
        return []
    from skullfix_ai.application.model_reconstruction import ModelReconstructionService, ReconstructionError

    @tool
    def describe_predicted_fix() -> str:
        """Geometry statistics (volume, area, size, thickness, bone contact, side) and the ML record
        (model, training data, held-out scores, checkpoint, threshold, timing) for the selected predicted fix."""
        try:
            report = ModelReconstructionService(repository, None, None).report(
                context.candidate_id, context.project_id, context.case_id)
        except ReconstructionError as error:
            return json.dumps({'status': 'INDETERMINATE', 'reason': error.message})
        return json.dumps(report, ensure_ascii=False)
    return [describe_predicted_fix]
