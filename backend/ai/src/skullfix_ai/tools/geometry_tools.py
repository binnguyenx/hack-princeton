"""Read-only geometry measurement tools bound to one request's selection.

Volumes are read from the application repository (never written). Each tool returns a compact
summary to the model; full point sets go to the per-turn overlay list for "Show in viewport".
"""

from __future__ import annotations

import json
import uuid

from langchain_core.tools import tool

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest

from . import geometry_measurements as gm

BASIS = "workspace design-policy default (configurable screening threshold; not a validated clinical standard)"
METHOD_NOTE = ("Voxel-mask approximation on the stored scan; editor-world coordinates, not certified patient RAS. "
               "Not a validated clinical measurement.")


class GeometryWorkspace:
    """Lazily loads the selection's binary masks; records overlays produced during the turn."""

    def __init__(self, repository, context: AppObjectContext, manifest: AppProjectManifest, capabilities):
        self.repository, self.context, self.manifest, self.capabilities = repository, context, manifest, capabilities
        self.overlays: list[dict] = []
        sample = next((row for row in manifest.samples if row.id == context.sample_id), None)
        self.source_volume_id = sample.source_anatomy.volume_id if sample else None
        self.source_hash = sample.source_anatomy.volume_hash if sample else ""
        self.spacing = capabilities.spacing_mm if capabilities is not None else None

    # -- data access -------------------------------------------------------------------
    def _mask(self, volume_id: str, volume_hash: str):
        return gm.load_mask(f"{volume_id}:{volume_hash}",
                            lambda: self.repository.read_volume(self.context.project_id, volume_id))

    def source(self):
        return self._mask(self.source_volume_id, self.source_hash)

    def candidate_edited(self) -> bool:
        return self.context.candidate_id is not None and self.context.volume_id != self.source_volume_id

    def candidate(self):
        return self._mask(self.context.volume_id, self.context.volume_hash)

    def unavailable(self) -> str | None:
        if self.spacing is None:
            return "Voxel spacing is not verified in millimetres."
        if not self.source_volume_id or not (self.capabilities and self.capabilities.has_source_mesh):
            return "The source scan volume is not available."
        return None

    def defect(self):
        """(mask, how) — designed implant from candidate edits, else a symmetry estimate."""
        source = self.source()
        if self.candidate_edited():
            implant = gm.implant_from_candidate(source, self.candidate())
            if implant.any():
                return implant, "candidate implant (voxels added to the source skull)"
        estimate = gm.estimate_defect_by_symmetry(source, self.spacing)
        return estimate, "estimated by left-right symmetry of the skull (unverified)"

    def add_overlay(self, kind: str, title: str, result: dict, legend: list[dict], threshold) -> str:
        overlay_id = str(uuid.uuid4())
        self.overlays.append({
            "overlay_id": overlay_id, "kind": kind, "title": title, "unit": "mm", "threshold_mm": threshold,
            "legend": legend, "frame": "voxel-ijk", "sizes": list(self.manifest_sizes()),
            "spacing_mm": list(self.spacing), "object_id": self.context.selected_object_id,
            "revision_id": self.context.revision_id, "focus_ijk": result.get("focus_ijk"),
            "points": [{"ijk": p["ijk"], "value_mm": p["value_mm"], "severity": p["severity"]}
                       for p in result.get("overlay_points", [])],
        })
        return overlay_id

    def manifest_sizes(self):
        return self.context.spatial.sizes

    def latest_overlay(self) -> dict | None:
        return self.overlays[-1] if self.overlays else None


def _json(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False)


def _indeterminate(reason: str) -> str:
    return _json({"status": "INDETERMINATE", "reason": reason, "method": METHOD_NOTE})


def build_geometry_tools(workspace: GeometryWorkspace):

    @tool
    def measure_workspace_volumes() -> str:
        """Measure real physical volumes (mm³, cm³) from the stored scan: source skull bone, the
        candidate implant (voxels the candidate adds), and the defect region. Uses verified voxel spacing."""
        if reason := workspace.unavailable():
            return _indeterminate(reason)
        try:
            source = workspace.source()
            result = {"status": "OK", "spacing_mm": workspace.spacing,
                      "source_bone": gm.volume_summary(int(source.sum()), workspace.spacing)}
            if workspace.candidate_edited():
                implant = gm.implant_from_candidate(source, workspace.candidate())
                result["implant"] = gm.volume_summary(int(implant.sum()), workspace.spacing)
                result["implant_source"] = "voxels the candidate adds to the source skull"
            defect, how = workspace.defect()
            result["defect"] = (gm.volume_summary(int(defect.sum()), workspace.spacing) if defect is not None
                                else {"status": "INDETERMINATE", "reason": "No defect region could be located."})
            result["defect_source"] = how
            result["method"] = METHOD_NOTE + " Volume = voxel count × Δx × Δy × Δz; pose-independent."
            return _json(result)
        except Exception as error:  # unreadable/non-binary volume
            return _indeterminate(f"The stored volume could not be measured ({type(error).__name__}).")

    @tool
    def measure_defect_rim_thickness() -> str:
        """Measure cortical bone thickness (mm) around the defect rim from the stored scan, along local
        surface normals. Returns min/mean/max, PASS/FAIL against the 2.0 mm policy default, and the
        thinnest locations. A viewport heat map is attached for the user."""
        if reason := workspace.unavailable():
            return _indeterminate(reason)
        try:
            defect, how = workspace.defect()
            if defect is None or not defect.any():
                return _indeterminate("No defect region could be located (create a candidate implant to define it).")
            result = gm.rim_thickness(workspace.source(), defect, workspace.spacing)
        except Exception as error:
            return _indeterminate(f"The stored volume could not be measured ({type(error).__name__}).")
        if result["status"] == "INDETERMINATE":
            return _indeterminate(result["reason"])
        workspace.add_overlay("rim_thickness", "Rim thickness", result, threshold=gm.THIN_MM, legend=[
            {"severity": "critical", "label": f"< {gm.THIN_MM} mm"},
            {"severity": "warning", "label": f"{gm.THIN_MM}–{gm.AMBER_MM} mm"},
            {"severity": "ok", "label": f"≥ {gm.AMBER_MM} mm"}])
        summary = {k: v for k, v in result.items() if k not in ("overlay_points", "focus_ijk")}
        return _json({**summary, "defect_source": how, "basis": BASIS, "method": METHOD_NOTE,
                      "source": "cranioplasty_guardrails.md § Screw fixation depth and minimum bone thickness",
                      "viewport_overlay": "attached"})

    @tool
    def measure_implant_rim_fit() -> str:
        """Measure the selected implant candidate's fit at the defect rim from the stored volumes: mean and
        max rim gap (mm), bone interference and margin overlap, PASS/FAIL against policy tolerances, plus
        the worst-gap locations. A viewport overlay is attached for the user."""
        if reason := workspace.unavailable():
            return _indeterminate(reason)
        if not workspace.candidate_edited():
            return _indeterminate("Select an implant candidate whose volume adds implant voxels to the source.")
        try:
            source = workspace.source()
            implant = gm.implant_from_candidate(source, workspace.candidate())
            result = gm.implant_rim_fit(source, implant, workspace.spacing, workspace.context.pose)
        except Exception as error:
            return _indeterminate(f"The stored volumes could not be measured ({type(error).__name__}).")
        if result["status"] == "INDETERMINATE":
            return _indeterminate(result["reason"])
        workspace.add_overlay("rim_gap", "Rim gap", result, threshold=gm.GAP_LIMIT_MM, legend=[
            {"severity": "ok", "label": "≤ 0.5 mm"},
            {"severity": "warning", "label": f"0.5–{gm.GAP_LIMIT_MM} mm"},
            {"severity": "critical", "label": f"> {gm.GAP_LIMIT_MM} mm"}])
        summary = {k: v for k, v in result.items() if k not in ("overlay_points", "focus_ijk")}
        return _json({**summary, "basis": BASIS, "method": METHOD_NOTE + " Pose translation applied; rotation is not.",
                      "source": "cranioplasty_guardrails.md § Dura clearance and margin overlap",
                      "viewport_overlay": "attached"})

    return [measure_workspace_volumes, measure_defect_rim_thickness, measure_implant_rim_fit]
