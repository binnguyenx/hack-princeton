"""Case report plan: what the report says and which images the browser must capture (ai-case-report R4, R5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError

MAX_SHOTS = 16
PRESETS = ("anterior", "posterior", "left", "right", "superior", "inferior", "hero_oblique")
GRID_PRESETS = ["left", "right", "anterior", "superior", "posterior"]
HERO_PRESETS = ["hero_oblique", "left", "superior"]
Preset = Literal["anterior", "posterior", "left", "right", "superior", "inferior", "hero_oblique"]
Section = Literal["hero", "anatomy", "repair", "annotated", "slices"]


class PlanError(ValueError):
    """A plan the subagent must fix; the message names what is wrong."""


@dataclass(frozen=True)
class CaseFacts:
    """What a plan may reference in the selected case."""
    case_name: str
    source_object_ids: set[str]
    candidate_object_ids: set[str]
    annotations: dict[str, dict] = field(default_factory=dict)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Callout(_Strict):
    annotation_id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=40)


class AnnotationCentre(_Strict):
    annotation_id: str = Field(min_length=1)


class ViewShot(_Strict):
    id: str = ""
    kind: Literal["view"] = "view"
    section: Literal["hero", "anatomy", "repair"] = "hero"
    preset: Preset
    objects: list[str] = Field(default_factory=list)
    title: str = Field(default="", max_length=80)


class AnnotatedShot(_Strict):
    id: str = ""
    kind: Literal["annotated_view"] = "annotated_view"
    section: Literal["annotated"] = "annotated"
    preset: Preset = "hero_oblique"
    objects: list[str] = Field(default_factory=list)
    callouts: list[Callout] = Field(min_length=1, max_length=12)
    title: str = Field(default="", max_length=80)


class SliceShot(_Strict):
    id: str = ""
    kind: Literal["slices"] = "slices"
    section: Literal["slices"] = "slices"
    centre: Union[Literal["defect", "volume"], AnnotationCentre] = "defect"
    title: str = Field(default="", max_length=80)

    def model_post_init(self, _context) -> None:
        # Keep the annotation centre as a plain mapping in the stored/serialised plan.
        if isinstance(self.centre, AnnotationCentre):
            object.__setattr__(self, "centre", self.centre.model_dump())


Shot = Union[ViewShot, AnnotatedShot, SliceShot]


class Measurement(_Strict):
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=40)
    unit: str = Field(default="", max_length=16)
    source: str = Field(default="", max_length=60)


class Source(_Strict):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(pattern=r"^https?://", max_length=500)


class ReportPlan(_Strict):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1200)
    findings: list[str] = Field(default_factory=list, max_length=12)
    measurements: list[Measurement] = Field(default_factory=list, max_length=20)
    sources: list[Source] = Field(default_factory=list, max_length=12)
    conversation_summary: str = Field(default="", max_length=1500)
    callouts: list[Callout] = Field(default_factory=list, max_length=12)
    shots: list[Shot] = Field(default_factory=list)


def _first_error(error: ValidationError) -> str:
    item = error.errors()[0]
    where = ".".join(str(part) for part in item.get("loc", ()))
    return f"{where}: {item.get('msg')}" if where else str(item.get("msg"))


def _default_shots(plan: ReportPlan, facts: CaseFacts) -> list[Shot]:
    source = sorted(facts.source_object_ids)
    everything = source + sorted(facts.candidate_object_ids)
    shots: list[Shot] = [ViewShot(section="hero", preset=p, objects=everything) for p in HERO_PRESETS]
    shots += [ViewShot(section="anatomy", preset=p, objects=source) for p in GRID_PRESETS]
    if facts.candidate_object_ids:
        shots += [ViewShot(section="repair", preset=p, objects=everything) for p in GRID_PRESETS]
    if plan.callouts:
        shots.append(AnnotatedShot(callouts=plan.callouts, objects=everything))
    shots.append(SliceShot(centre="defect" if facts.candidate_object_ids else "volume"))
    return shots


def _check_refs(shot: Shot, facts: CaseFacts) -> None:
    known_objects = facts.source_object_ids | facts.candidate_object_ids
    for object_id in getattr(shot, "objects", []):
        if object_id not in known_objects:
            raise PlanError(f"Unknown object id {object_id!r} in a {shot.kind} shot; use ids from the case overview.")
    for callout in getattr(shot, "callouts", []):
        if callout.annotation_id not in facts.annotations:
            raise PlanError(f"Unknown annotation id {callout.annotation_id!r}; use ids from the annotation list.")
    centre = getattr(shot, "centre", None)
    if isinstance(centre, dict) and centre.get("annotation_id") not in facts.annotations:
        raise PlanError(f"Unknown annotation id {centre.get('annotation_id')!r} as a slice centre.")


def build_plan(raw: dict, facts: CaseFacts) -> ReportPlan:
    """Validate a submitted plan against the case, fill default shots, and number them."""
    try:
        plan = ReportPlan.model_validate(raw)
    except ValidationError as error:
        raise PlanError(f"Invalid report plan ({_first_error(error)}).") from error
    for callout in plan.callouts:
        if callout.annotation_id not in facts.annotations:
            raise PlanError(f"Unknown annotation id {callout.annotation_id!r}; use ids from the annotation list.")
    shots = list(plan.shots) or _default_shots(plan, facts)
    if len(shots) > MAX_SHOTS:
        raise PlanError(f"Too many shots ({len(shots)}); at most {MAX_SHOTS}.")
    for index, shot in enumerate(shots):
        _check_refs(shot, facts)
        shot.id = f"shot-{index + 1:02d}"
    return plan.model_copy(update={"shots": shots})
