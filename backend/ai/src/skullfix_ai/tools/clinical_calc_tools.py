"""Deterministic cranioplasty calculations and policy checks (pure functions, no I/O).

The language model must delegate arithmetic and threshold checks here. Thresholds are
workspace design-policy defaults documented in backend/ai/knowledge/cranioplasty_guardrails.md;
they are screening defaults, not validated clinical standards. Results describe the supplied
numbers only; nothing here measures geometry or writes data.
"""

from __future__ import annotations

import json
import math
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

# Single source of truth; a regression test checks these against the guardrails Markdown.
POLICY = {
    "min_bone_thickness_mm": 2.0,
    "min_sinus_clearance_mm": 5.0,
    "max_dura_penetration_mm": 0.0,
    "margin_overlap_min_mm": 4.0,
    "margin_overlap_max_mm": 5.0,
    "max_mean_rim_gap_mm": 1.0,
}
BASIS = "workspace design-policy default (configurable screening threshold; not a validated clinical standard)"
INPUT_SOURCE = "caller-supplied values; not measured by the workspace"
SOURCE_DOC = "cranioplasty_guardrails.md"

PASS, FAIL, INDETERMINATE = "PASS", "FAIL", "INDETERMINATE"


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _indeterminate(reason: str, **extra) -> dict:
    return {"status": INDETERMINATE, "reason": reason, **extra}


def _round(value: float) -> float:
    return round(value, 6)


def calculate_voxel_volume_value(voxel_count: Any, spacing_mm: Any) -> dict:
    if isinstance(voxel_count, bool) or not isinstance(voxel_count, int) or voxel_count < 0:
        return _indeterminate("voxel_count must be an integer >= 0.")
    if spacing_mm is None:
        return _indeterminate("Voxel spacing is missing; physical volume cannot be computed.")
    if not isinstance(spacing_mm, (list, tuple)) or len(spacing_mm) != 3:
        return _indeterminate("Voxel spacing must be exactly three values (dx, dy, dz) in mm.")
    if not all(_finite(value) and value > 0 for value in spacing_mm):
        return _indeterminate("Voxel spacing values must be finite and > 0 mm.")
    voxel_mm3 = math.prod(float(value) for value in spacing_mm)
    volume_mm3 = voxel_count * voxel_mm3
    return {"status": "OK", "formula": "V = N × Δx × Δy × Δz", "voxel_count": voxel_count,
            "spacing_mm": [float(value) for value in spacing_mm], "voxel_volume_mm3": _round(voxel_mm3),
            "volume_mm3": _round(volume_mm3), "volume_cm3": _round(volume_mm3 / 1000.0),
            "source": "biomechanical_formulas.md § Voxel volume"}


def _check(name: str, value: float, threshold: float, comparison: str, margin: float) -> dict:
    passed = margin >= 0
    return {"check": name, "value_mm": _round(value), "threshold_mm": threshold, "rule": comparison,
            "margin_mm": _round(margin), "status": PASS if passed else FAIL}


def evaluate_fixation_safety_value(bone_thickness_mm: Any, sinus_clearance_mm: Any, screw_length_mm: Any) -> dict:
    values = {"bone_thickness_mm": bone_thickness_mm, "sinus_clearance_mm": sinus_clearance_mm,
              "screw_length_mm": screw_length_mm}
    invalid = [name for name, value in values.items() if not _finite(value) or value < 0]
    if invalid or screw_length_mm == 0:
        return _indeterminate("All inputs must be finite, non-negative millimetre values and screw length > 0.",
                              invalid_inputs=invalid or ["screw_length_mm"])
    t_min, d_min = POLICY["min_bone_thickness_mm"], POLICY["min_sinus_clearance_mm"]
    checks = [
        _check("bone_thickness", bone_thickness_mm, t_min, f"bone thickness >= {t_min} mm", bone_thickness_mm - t_min),
        _check("screw_depth", screw_length_mm, bone_thickness_mm, "screw length <= local bone thickness",
               bone_thickness_mm - screw_length_mm),
        _check("sinus_clearance", sinus_clearance_mm, d_min, f"sinus clearance >= {d_min} mm",
               sinus_clearance_mm - d_min),
    ]
    index = min(check["margin_mm"] for check in checks)
    return {"status": PASS if all(c["status"] == PASS for c in checks) else FAIL, "checks": checks,
            "safety_margin_index_mm": _round(index), "basis": BASIS, "inputs": INPUT_SOURCE,
            "source": f"{SOURCE_DOC} § Screw fixation depth and minimum bone thickness; § Venous and air sinus clearance",
            "not_assessed": "Screw pull-out strength, bone quality and thread engagement are not computed."}


def evaluate_implant_fit_metrics_value(max_dura_penetration_mm: Any, mean_rim_gap_mm: Any, margin_overlap_mm: Any) -> dict:
    values = {"max_dura_penetration_mm": max_dura_penetration_mm, "mean_rim_gap_mm": mean_rim_gap_mm,
              "margin_overlap_mm": margin_overlap_mm}
    invalid = [name for name, value in values.items() if not _finite(value)]
    if invalid or (_finite(mean_rim_gap_mm) and mean_rim_gap_mm < 0) or (_finite(margin_overlap_mm) and margin_overlap_mm < 0):
        return _indeterminate("Inputs must be finite millimetre values; rim gap and overlap must be >= 0.",
                              invalid_inputs=invalid or [name for name in ("mean_rim_gap_mm", "margin_overlap_mm")
                                                         if values[name] < 0])
    p_max, gap_max = POLICY["max_dura_penetration_mm"], POLICY["max_mean_rim_gap_mm"]
    lo, hi = POLICY["margin_overlap_min_mm"], POLICY["margin_overlap_max_mm"]
    overlap_margin = min(margin_overlap_mm - lo, hi - margin_overlap_mm)
    checks = [
        _check("dura_penetration", max_dura_penetration_mm, p_max, f"dural penetration <= {p_max} mm",
               p_max - max_dura_penetration_mm),
        _check("mean_rim_gap", mean_rim_gap_mm, gap_max, f"mean rim gap <= {gap_max} mm", gap_max - mean_rim_gap_mm),
        {**_check("margin_overlap", margin_overlap_mm, lo, f"overlap within {lo}–{hi} mm", overlap_margin),
         "threshold_mm": [lo, hi]},
    ]
    return {"status": PASS if all(c["status"] == PASS for c in checks) else FAIL, "checks": checks,
            "basis": BASIS, "inputs": INPUT_SOURCE, "source": f"{SOURCE_DOC} § Dura clearance and margin overlap",
            "assumption": "Overlap rule applies to onlay-style designs; edge-to-edge inlays are not assessed by it."}


class VoxelVolumeArgs(BaseModel):
    voxel_count: int = Field(description="Number of voxels in the mask (integer >= 0).")
    spacing_mm: list[float] | None = Field(
        default=None, description="Voxel spacing [dx, dy, dz] in mm. Omit to use the selection's verified spacing.")


class FixationSafetyArgs(BaseModel):
    bone_thickness_mm: float | None = Field(default=None, description="Local bone thickness at the fixation site, mm (user-supplied).")
    sinus_clearance_mm: float | None = Field(default=None, description="Distance from the fixation point to the nearest venous/air sinus, mm (user-supplied).")
    screw_length_mm: float | None = Field(default=None, description="Screw length, mm (user-supplied).")


class ImplantFitArgs(BaseModel):
    max_dura_penetration_mm: float | None = Field(default=None, description="Maximum inward intrusion past the dural surface, mm (<= 0 means none).")
    mean_rim_gap_mm: float | None = Field(default=None, description="Mean absolute gap between implant edge and defect rim, mm.")
    margin_overlap_mm: float | None = Field(default=None, description="Circumferential overlap of the implant onto native bone, mm.")


def _json(result: dict) -> str:
    return json.dumps(result, ensure_ascii=False)


def _missing(values: dict) -> list[str]:
    return [name for name, value in values.items() if value is None]


def _gated(check: str, capabilities, missing: list[str]) -> dict:
    """INDETERMINATE when inputs are absent: the workspace cannot supply them (preflight reason)."""
    reason = capabilities.blocked_reason(check) if capabilities is not None else None
    return _indeterminate(reason or "Required inputs were not provided and cannot be derived from the workspace.",
                          missing_inputs=missing, gate="capability-preflight")


def make_clinical_calc_tools(capabilities=None):
    """Calculation tools gated by a preflight CapabilityManifest (None = no workspace data available)."""

    @tool(args_schema=VoxelVolumeArgs)
    def calculate_voxel_volume(voxel_count: int, spacing_mm: list[float] | None = None) -> str:
        """Compute exact physical volume (mm³ and cm³) from a voxel count and voxel spacing in mm.
        Omit spacing to use the selection's verified spacing. Returns INDETERMINATE when spacing is
        missing, unverified or invalid. Use for every volume calculation."""
        if spacing_mm is None:
            if capabilities is not None and capabilities.has_valid_spacing_mm and capabilities.spacing_mm:
                result = calculate_voxel_volume_value(voxel_count, capabilities.spacing_mm)
                if result["status"] == "OK":
                    result["spacing_source"] = "workspace (verified millimetre metadata)"
                return _json(result)
            if capabilities is not None:
                return _json(_gated("voxel_volume", capabilities, ["spacing_mm"]))
        result = calculate_voxel_volume_value(voxel_count, spacing_mm)
        if result["status"] == "OK":
            result["spacing_source"] = INPUT_SOURCE
        return _json(result)

    @tool(args_schema=FixationSafetyArgs)
    def evaluate_fixation_safety(bone_thickness_mm: float | None = None, sinus_clearance_mm: float | None = None,
                                 screw_length_mm: float | None = None) -> str:
        """Check screw fixation inputs against workspace policy thresholds (minimum bone thickness,
        screw length vs bone thickness, sinus clearance). Returns PASS/FAIL with exact margins, or
        INDETERMINATE when values are missing and the workspace cannot measure them."""
        values = {"bone_thickness_mm": bone_thickness_mm, "sinus_clearance_mm": sinus_clearance_mm,
                  "screw_length_mm": screw_length_mm}
        if missing := _missing(values):
            return _json(_gated("fixation_safety", capabilities, missing))
        return _json(evaluate_fixation_safety_value(**values))

    @tool(args_schema=ImplantFitArgs)
    def evaluate_implant_fit_metrics(max_dura_penetration_mm: float | None = None, mean_rim_gap_mm: float | None = None,
                                     margin_overlap_mm: float | None = None) -> str:
        """Check implant fit inputs (dural penetration, mean rim gap, margin overlap) against workspace
        policy tolerances. Returns PASS/FAIL with exact margins, or INDETERMINATE when values are missing."""
        values = {"max_dura_penetration_mm": max_dura_penetration_mm, "mean_rim_gap_mm": mean_rim_gap_mm,
                  "margin_overlap_mm": margin_overlap_mm}
        if missing := _missing(values):
            return _json(_gated("implant_fit", capabilities, missing))
        return _json(evaluate_implant_fit_metrics_value(**values))

    return [calculate_voxel_volume, evaluate_fixation_safety, evaluate_implant_fit_metrics]


# Ungated defaults (no workspace data): explicit inputs only.
calculate_voxel_volume, evaluate_fixation_safety, evaluate_implant_fit_metrics = make_clinical_calc_tools()


def build_clinical_calc_tools(capabilities=None):
    return make_clinical_calc_tools(capabilities)
