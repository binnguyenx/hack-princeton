"""Deterministic capability preflight: what the active selection can support, before any LLM call.

Zero model calls, read-only. The resulting CapabilityManifest is (1) injected into the agent's
system context so the model knows up front which checks are executable, and (2) enforced inside
the calculation tools so a missing prerequisite deterministically yields INDETERMINATE.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest

CheckName = Literal["selection_metadata", "knowledge_search", "voxel_volume", "rim_thickness",
                    "fixation_safety", "implant_fit", "landmark_review"]


class BlockedCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    check: CheckName
    status: Literal["INDETERMINATE"] = "INDETERMINATE"
    reason: str


class CapabilityManifest(BaseModel):
    """Point-in-time facts about the selection; not a permission or a lock."""

    model_config = ConfigDict(extra="forbid")
    selection_kind: Literal["source", "candidate"]
    has_source_mesh: bool
    has_candidate_mesh: bool
    has_valid_spacing_mm: bool
    has_anatomical_landmarks: bool
    has_bone_thickness_map: bool = False
    spacing_mm: list[float] | None = None
    executable_checks: list[CheckName] = Field(default_factory=list)
    blocked_checks: list[BlockedCheck] = Field(default_factory=list)

    def blocked_reason(self, check: CheckName) -> str | None:
        return next((item.reason for item in self.blocked_checks if item.check == check), None)

    def prompt_block(self) -> str:
        """Plain-language capability summary appended to the system prompt for this turn."""
        yes = lambda flag: "yes" if flag else "no"
        lines = [
            "## Workspace capabilities for this selection (deterministic preflight)",
            f"- Selection: {self.selection_kind}",
            f"- Source volume available: {yes(self.has_source_mesh)}; implant candidate volume available: {yes(self.has_candidate_mesh)}",
            f"- Verified millimetre voxel spacing: {yes(self.has_valid_spacing_mm)}"
            + (f" ({' × '.join(f'{v:g}' for v in self.spacing_mm)} mm)" if self.spacing_mm else ""),
            f"- Anatomical landmarks recorded: {yes(self.has_anatomical_landmarks)}; bone thickness measurable from the scan: {yes(self.has_bone_thickness_map)}",
            "- Executable now: " + (", ".join(self.executable_checks) or "none"),
        ]
        if self.blocked_checks:
            lines.append("- Not executable from workspace data (report as INDETERMINATE, do not retry):")
            lines += [f"  - {item.check}: {item.reason}" for item in self.blocked_checks]
        lines.append("Checks marked not executable may still screen values the user explicitly provides; label them user-supplied.")
        return "\n".join(lines)


def _volume_exists(repository, volume_id: str | None) -> bool:
    locate = getattr(repository, "_volume_path", None)
    if not volume_id or locate is None:
        return False
    try:
        return locate(volume_id).is_file()
    except (ValueError, OSError):
        return False


def _has_landmarks(repository, sample_id: str) -> bool:
    try:
        from skullfix_ai.application.landmarks import LandmarkService
        return bool(LandmarkService(repository).list(sample_id))
    except Exception:
        return False


def run_preflight(repository, context: AppObjectContext, manifest: AppProjectManifest) -> CapabilityManifest:
    sample = next((row for row in manifest.samples if row.id == context.sample_id), None)
    source_volume = sample.source_anatomy.volume_id if sample else None
    has_source = _volume_exists(repository, source_volume)
    has_candidate = context.candidate_id is not None and _volume_exists(repository, context.volume_id)
    spacing = [float(value) for value in context.spatial.spacings]
    valid_spacing = (context.spatial.units == "mm" and context.spatially_verified and len(spacing) == 3
                     and all(math.isfinite(value) and value > 0 for value in spacing))
    landmarks = _has_landmarks(repository, context.sample_id)

    executable: list[CheckName] = ["selection_metadata", "knowledge_search"]
    blocked: list[BlockedCheck] = []
    spacing_reason = ("Voxel spacing is not verified in millimetres" if not valid_spacing else None)
    measurable = has_source and valid_spacing
    if valid_spacing:
        executable.append("voxel_volume")
    else:
        blocked.append(BlockedCheck(check="voxel_volume", reason=f"{spacing_reason}; physical volume cannot be computed"))
    # Rim thickness is measured on demand from the stored scan (no precomputed map is required).
    if measurable:
        executable.append("rim_thickness")
    else:
        blocked.append(BlockedCheck(check="rim_thickness", reason="Missing " + (
            "verified voxel spacing" if has_source else "the source scan volume") + "; rim thickness cannot be measured"))
    fixation_missing = ([] if measurable else ["cortical bone thickness map"]) + ([] if valid_spacing else ["verified voxel spacing"])
    blocked.append(BlockedCheck(check="fixation_safety", reason=(
        ("Missing " + " and ".join(fixation_missing) + "; ") if fixation_missing else "Bone thickness can be measured at the defect rim, but ")
        + "sinus clearance and screw sites are not measured by the workspace"))
    edited = context.candidate_id is not None and sample is not None and context.volume_id != sample.source_anatomy.volume_id
    if context.candidate_id is None:
        blocked.append(BlockedCheck(check="implant_fit", reason="No implant candidate is selected"))
    elif not (has_candidate and measurable):
        blocked.append(BlockedCheck(check="implant_fit", reason="Candidate or source volume, or verified spacing, is unavailable"))
    elif not edited:
        blocked.append(BlockedCheck(check="implant_fit", reason="The candidate has no implant edits yet (it equals the source skull)"))
    else:
        executable.append("implant_fit")
    if landmarks:
        executable.append("landmark_review")
    else:
        blocked.append(BlockedCheck(check="landmark_review", reason="No anatomical landmarks are recorded for this source"))
    return CapabilityManifest(selection_kind="candidate" if context.candidate_id else "source",
                              has_source_mesh=has_source, has_candidate_mesh=has_candidate,
                              has_valid_spacing_mm=valid_spacing, has_anatomical_landmarks=landmarks,
                              has_bone_thickness_map=measurable,
                              spacing_mm=spacing if valid_spacing else None,
                              executable_checks=executable, blocked_checks=blocked)
