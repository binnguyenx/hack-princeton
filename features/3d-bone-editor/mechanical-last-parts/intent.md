# Intent: Mechanical last parts — annotation, measurement, and spatial markup

Author: Vien Nguyen · Date: 2026-11-15 · Status: accepted
Parent: [3d-bone-editor README](../README.md) · Extends: [canvas-workspace-improve](../canvas-workspace-improve/intent.md)

---

## Research basis

Before stating the problem, here is the evidence on how bone doctors, biomedical engineers, and imaging researchers actually work — what tools they use, what they mark up, and what they measure. Product decisions below are grounded in this.

### Who does this work and what software they reach for

**Biomedical / CMF engineers and surgical planners** are the primary class. Their daily tools:

- **Mimics + 3-matic (Materialise)** — the dominant commercial platform for patient-specific implant design. Engineers segment CT scans in Mimics, then move geometry into 3-matic for design, measurement, and comparison. Mimics shows measurements overlaid directly on the 3D model and slice views; 3-matic exposes distance/deviation color maps between a proposed implant surface and the original anatomy. The workflow starts with segmentation and always ends with a comparison step before the design is sent for review or manufacture. [Source: materialise.com/mimics, materialise.com/3-matic-medical]

- **ProPlan CMF (Materialise / J&J MedTech)** and **VSP Cranial (Stryker / 3D Systems)** — cloud-service VSP platforms used for high-acuity planning. The surgeon and a clinical engineer share a live session in a web viewer; the engineer annotates proposed cuts and movements while the surgeon reviews the 3D model and slice reconstructions. Approval is a formal step, not a shortcut. [Source: jnjmedtech.com, stryker.com/vsp-cranial]

- **3D Slicer** — the dominant open-source tool in research and academic settings. Its Markups module (see below) defines the annotation vocabulary most researchers learn. Used for landmarking, contour tracing, measurement, and generating region-of-interest masks. [Source: slicer.readthedocs.io/markups]

- **OsiriX / Horos** — DICOM viewers strong in macOS clinical environments. Neurosurgeons use them for preoperative measurement: distance between skull structures, volume estimates, 3D MPR. The 3D preoperative planning and length-measurement studies show clinicians measuring directly in these tools, then exporting screenshots or numbers to a report. [Source: PMC5655755, PMC3389091]

### What they actually annotate and measure

The literature and software documentation converge on a core annotation vocabulary:

| Annotation type | Why it's used |
|---|---|
| **Landmark / fiducial point** | Mark anatomical reference locations (nasion, bregma, lambda, porion, orbitale, etc.) and defect boundary corners; used as inputs to measurement chains and registration. The 3D Slicer SlicerMorph community places 250+ individual fiducials per case for registration quality assessment. [slicer.org discourse, PMC] |
| **Distance line (ruler)** | Anterior–posterior and superior–inferior defect spans; implant thickness at a sample point; gap between implant rim and bone edge. The Oliveira 2024 cranial defect assessment paper proposes directional span measurements via placed landmarks. [PMC10876786] |
| **Angle** | Angulation between bone segments (critical in osteotomy planning); implant surface curvature assessment; geometric plane alignment for 3D cephalometry. A 2025 PMC study shows that angular measurements from 3D images require geometric plane alignment or the values are projection-distorted. [PMC13339505] |
| **Closed curve / contour** | Rim of a defect traced as a 3D closed curve; boundary line between implant and remaining bone. Length of this curve is an accepted clinical measurement [PMC10876786]. 3D Slicer's closed curve type supports this directly. |
| **Open curve / path** | Centerline path along a ridge or suture; profile line across a surface for cross-section inspection. |
| **Plane** | Mid-sagittal symmetry plane (mirror axis for unilateral defect reconstruction); osteotomy cut plane; cross-section inspection plane. 3D Slicer supports three placement methods: point-normal, three-point, and plane-fit to a scattered point cloud. BoneSplit (Springer 2017) is a CMF-specific tool built entirely around 3D paint marking and plane-based cut simulation. |
| **Region of interest (ROI) box** | Crop volume around defect for processing; restrict generation to a spatial region; focus measurement to a bounding area. |
| **Text / sticky note** | Clinician free-text comment attached to a 3D position ("thin wall here", "check interface at this point"). Used in annotation pipelines (pyOsirix, Stanford DICOM annotation study) and in formal VSP review sessions. |
| **Highlight / color overlay** | Paint a surface region to flag concern or designate a preservation zone. BoneSplit (Springer 2017) demonstrates direct 3D texture painting as the primary interaction for identifying bone structures in CMF planning. Supervisely DICOM annotation tool and MedLabelMe both support painted region masks overlaid on 3D views. |

### The core clinical workflow and where annotation fits

Synthesizing the VSP literature and the Materialise / Stryker service descriptions:

1. **Prepare anatomy** — segment scan, verify segmentation, produce labeled 3D model.
2. **Define the problem** — place landmarks at defect boundaries; trace the defect rim as a closed curve; annotate the region requiring repair; record free-text clinical constraints.
3. **Construct a candidate** — engineer builds or generates a proposed implant shape.
4. **Inspect and measure** — measure defect spans, implant thickness, rim gap, surface deviation; mark concerns with highlight overlays and text notes; view cross-sections.
5. **Review and iterate** — surgeon reviews the annotated proposal; annotates change requests at specific 3D locations; engineer revises the candidate; repeat until sign-off.

The review step is the most annotation-intensive. ProPlan CMF and VSP Cranial both structure this as a formal web-based session with simultaneous annotation by both parties. In open-source academic practice, this happens asynchronously via saved annotation files.

### What the current canvas can and cannot do

The shipped canvas (canvas-workspace-improve, closed) supports Place mode for fiducial points and has the infrastructure for one-shot and persistent point placement. What it does not have:

- Lines, angles, closed/open curves, planes, or ROI boxes as placeable records.
- A measurement engine that reads those records and reports distance, angle, length, area, or volume in mm / mm² / mm³ in RAS space.
- Surface highlight or color overlay.
- Text annotation attached to a 3D location.
- An annotation list panel showing all current records with visibility, lock, and delete controls.
- Persistence of any annotation into the app model (the app model currently stores candidates and revisions only).

---

## Problem

The canvas supports inspection and navigation to medical-imaging standards, and candidates can be transformed. But a person reviewing a proposed cranial implant has no way to mark what they see: they cannot place a measurement line, trace a defect boundary, annotate a concern, or highlight a surface region. Every review observation lives in their head or in an external document.

This matters because the loop the product is trying to close — propose → inspect → annotate concerns → revise — cannot close without the annotation step. Without it, the workspace is a viewer, not a collaborative design tool.

The gap is specific: not raw CT processing, not implant generation, not AI chat. Those are addressed or tracked elsewhere. The gap is the set of **spatial markup and measurement primitives** that let an engineer or surgeon encode their observations directly on the anatomy and candidate geometry. These are the last mechanical capabilities the product needs before the workspace can represent a reviewable digital reconstruction proposal as stated in `hackprinceton_intent.md`.

---

## Desired outcome

After this feature, an engineer or surgeon can:

1. **Place named landmarks** at anatomical reference points and defect boundaries, see their RAS coordinates, and jump any slice view to that point.
2. **Draw a distance line** between two points and read a live mm measurement in patient space.
3. **Draw an angle** between three points and read the degree value.
4. **Trace a closed curve** around the defect rim or implant boundary; the system reports its 3D length in mm.
5. **Trace an open curve** along a ridge or profile; length reported.
6. **Place an inspection plane** (by point-normal or three-point method) and see the resulting cross-section appear in the slice dock.
7. **Place a bounding box ROI** to designate a region of interest for a generation or processing step.
8. **Highlight a surface region** by painting with a brush in the 3D view, producing a labeled overlay on the anatomy or candidate geometry.
9. **Leave a text note** anchored to a 3D position, visible in the viewport.
10. **See all annotations in a panel** (the annotation list): toggle visibility, lock position, rename, delete.
11. **Have all annotations persist** as part of the case in the app model, loading back when the case re-opens.

The experience should feel like 3D Slicer's Markups panel combined with the compact chrome of the existing ModeRail and InspectorDrawer — not a separate tool, but a natural extension of the modes and operations already present.

---

## Affected users and systems

**Users:** biomedical engineers and surgeons using the canvas workspace. Both groups annotate; engineers annotate construction geometry, surgeons annotate clinical concerns and change requests.

**Systems this touches:**

- `app/src/` canvas UI: ModeRail (new annotation placement modes), InspectorDrawer (annotation properties, list panel), ContextStrip (measurement display while placing), StatusStrip (active measurement result).
- `app/src/domain/types.ts` and `app/src/state/store.ts`: new annotation record types (landmark, line, angle, closed curve, open curve, plane, ROI, highlight region, text note).
- `app/src/ops/`: new annotation operations following the existing shared ops pattern.
- `app/server/storageSqlite.ts` and Express API: persisting annotation records per case/revision.
- Shared ops layer: annotation placement and measurement must be callable by the future AI agent, not just from the UI.
- `app/src/viewport/`: highlight overlay rendering on top of geometry; annotation glyphs in 3D and slice views.

---

## Constraints

- All annotation records are attached to a **candidate revision**, not the source anatomy. Source anatomy remains immutable (canvas-workspace spec R3-R5).
- Annotations persist in the **app model** (SQLite + Express API). The Python sandbox is not the persistence layer.
- Measurements report values in **RAS millimetres** using the same coordinate chain as the existing crosshair and coordinate readout (canvas-workspace-improve R15-R16).
- Annotation placement follows the existing **Place mode** pattern (R28-R30). New annotation types are selectable modes within that pattern, not new top-level modes.
- Annotation markup in 3D and slice views follows **3D Slicer Markups** conventions as the reference behavioral standard (consistent with the established D1 decision: Slicer is the behavioral reference for the medical-imaging interaction layer).
- The **shared ops layer** (canvas-workspace-improve intent §Desired outcome ¶"Keep direct mechanical tools usable independently of chat") must expose annotation operations so the AI agent can call them.
- Highlight overlays must not corrupt geometry bytes. They are display-layer overlays attached to a surface.
- UI follows `DESIGN.md` throughout: soft monochrome, Radix Themes / primitives, compact canvas chrome.
- No role-specific annotation modes. Both groups use the same annotation palette (`PRODUCT.md`: same feature set for both users).

---

## Out of scope

- **Segment Editor / full voxel segmentation** (painting directly into the NRRD volume, creating new volumetric label maps). This is a Slicer Segment Editor capability that requires a separate reference and spec. The highlight overlay here is a surface-level display layer, not a voxel edit.
- **Raw CT preparation** (windowing raw Hounsfield data, bone extraction from unsegmented scans). Still deferred per `PRODUCT.md`.
- **Review result records as clinical documents** — the annotations produced here are design annotations. Formalizing them into a clinical sign-off workflow is out of scope.
- **Collaboration / multi-user simultaneous annotation** (real-time shared session like ProPlan CMF). Out of scope for this phase.
- **DICOM SR (Structured Reporting) or AIM XML export**. Annotations persist in the app model in a product-defined schema. Standard medical export formats are deferred.
- **Implant generation, contour-guided regeneration**. Annotations can serve as inputs to a generation step, but this feature does not build the generation pipeline.
- **Richer geometry editing** (planar trimming, boolean operations, mesh sculpt). Those require a separate reference source and spec.

---

## Open questions

1. Which annotation types are strictly required for the first demonstration case, and which can ship in a follow-up? Candidates for a minimal first slice: landmark + line + closed curve + text note. Angle, plane, ROI, highlight, and open curve could follow.
2. How does an annotation attach to a revision? Options: (a) annotations are always on the active revision; (b) annotations are on the case and reference a revision ID; (c) annotations are independent case-level objects. This determines the data model.
3. What happens to annotations when a new revision is created? Do they carry forward, branch, or stay frozen on the prior revision?
4. Does highlight / surface paint need undo at the stroke level, or is deleting the whole highlight overlay sufficient?
5. Should the annotation list panel be a section of the existing InspectorDrawer or a separate always-visible panel? The spec.md will decide layout per ui-journeys.md conventions.
6. The plane annotation is also an inspection plane that can drive a slice. Is a placed plane markup the same object as a slice view orientation, or does it produce a new linked slice in the dock?
7. What is the minimum export representation for annotations for the demo? JSON export alongside the NRRD, or only in-app model?

---

## Amendments

<!-- Append-only after acceptance -->

- 2026-11-15 (Minh Triet Nguyen; owner said "spec it" on 2026-11-15; suspected causes not individually confirmed): **Fix flaky interaction and manipulation of annotation objects, especially area tools (planes, ROIs).** Manipulating placed objects feels unreliable for the demo and the case report screenshots. Suspected causes, from reading `app/src/viewport/Viewport.tsx` and `annotationBehaviors/orientedExtent.ts`, to be confirmed:
  - Plane rotation only spins around the world superior axis using horizontal mouse motion, whatever the camera angle. A plane can't be tilted.
  - Plane size and ROI size follow raw vertical/horizontal screen motion, not the handle being dragged. ROI face knobs scale the whole box uniformly instead of moving that face, which contradicts R56/S17.
  - Planes and ROIs can't be moved after placement (no translate handle).
  - A cancelled drag (`pointercancel`) commits the edit instead of reverting it, and there's no Escape-to-cancel.
  Desired outcome: dragging a handle moves the part under the cursor predictably from any camera angle; planes can be moved and tilted; ROI faces resize independently; cancel reverts. Persistence, commit and revision logic stay unchanged. Colour for annotations is a separate feature: `features/annotation-color-system/`.
