"""LangChain tools for the Gemini chat graph: inspection-only, bound to one request.

Each tool closes over the authoritative context and manifest that the server
loaded for this turn. The model cannot choose project, case or object ids, and
no tool reaches a repository write, sandbox service, geometry or file system.
"""

from __future__ import annotations

import json

from langchain_core.tools import BaseTool, tool

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest


def _dump(value) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def build_read_only_tools(context: AppObjectContext, manifest: AppProjectManifest) -> list[BaseTool]:
    selection = context.model_dump(mode="json")
    case_samples = [sample for sample in manifest.samples if sample.case_id == context.case_id]
    sample_ids = {sample.id for sample in case_samples}
    case_candidates = [candidate for candidate in manifest.candidates if candidate.sample_id in sample_ids]
    case_name = next((case.name for case in manifest.cases if case.id == context.case_id), None)

    @tool
    def describe_selection() -> str:
        """Return authoritative metadata for the object the user currently has selected:
        ids, source sample, volume id/hash, grid sizes, voxel spacings (mm), bounding box (mm),
        spatial verification flag, current candidate revision and its 4x4 pose (if a candidate)."""
        return _dump(selection)

    @tool
    def list_case_objects() -> str:
        """List the source samples and implant candidates in the selected object's case
        (names, ids, current revision ids). Metadata only; no geometry is computed."""
        return _dump({
            "project": {"id": manifest.project.id, "name": manifest.project.name},
            "case": {"id": context.case_id, "name": case_name},
            "samples": [{"id": sample.id, "display_name": sample.display_name,
                         "source_object_id": sample.source_anatomy.object_id,
                         "spatially_verified": sample.spatially_verified,
                         "grid_sizes": sample.source_anatomy.spatial.sizes,
                         "units": sample.source_anatomy.spatial.units} for sample in case_samples],
            "candidates": [{"object_id": candidate.object_id, "sample_id": candidate.sample_id,
                            "current_revision_id": candidate.current_revision_id} for candidate in case_candidates],
        })

    @tool
    def list_candidate_revisions() -> str:
        """List the immutable revision history (order, id, pose, volume hash) of the selected
        implant candidate. Returns an empty list when a source sample is selected."""
        if context.candidate_id is None:
            return _dump({"candidate_id": None, "revisions": []})
        rows = sorted((revision for revision in manifest.revisions if revision.candidate_id == context.candidate_id),
                      key=lambda revision: revision.order)
        return _dump({"candidate_id": context.candidate_id, "current_revision_id": context.revision_id,
                      "revisions": [{"id": row.id, "order": row.order, "pose": row.pose,
                                     "volume_hash": row.volume_hash} for row in rows]})

    return [describe_selection, list_case_objects, list_candidate_revisions]
