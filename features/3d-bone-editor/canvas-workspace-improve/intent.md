# Intent: Slicer-standard canvas interaction

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted
Parent: [3d-bone-editor README](../README.md) · Extends: [canvas-workspace](../canvas-workspace/intent.md)

## Problem

The canvas exposes controls that look implemented but do not reliably change the camera, model, or workspace. Some interactions make the model disappear, leave the camera in an unrecoverable position, or put the UI and rendered scene into contradictory states. Existing tests can prove that a click handler ran without proving that the intended visual or state change happened.

Inventing another navigation convention is not useful. 3D Slicer already defines established medical-imaging conventions for 3D and slice views, anatomical orientation, cross-referenced inspection, mouse and keyboard input, and coordinate conversion. The canvas needs a complete behavioral contract based on those conventions before more code is added.

## Desired outcome

The canvas supports the capabilities documented in the linked 3D Slicer sections, adapted to a browser workspace without silently omitting a source capability. A parity ledger records whether each Slicer capability is implemented directly, adapted to this product, conditional on hardware or data, or not applicable with a reason.

For every supported control, the contract states:

- the input and required context;
- the exact effect on the camera, model, slice, crosshair, display, or saved data;
- the visible active, disabled, pending, success, and failure states;
- how the user reverses or recovers from the action;
- what an automated browser test must observe beyond the control receiving a click.

Inspection uses synchronized 3D and orthogonal slice views, patient-oriented labels, deterministic center/reset/standard-view actions, and mouse, keyboard, trackpad, and touch-accessible controls. View actions never edit anatomy. Edit or placement actions are transactional and cannot leave a partial scene mutation after failure.

The finished canvas cannot enter a blank, non-finite, stale, or contradictory state through ordinary input. If rendering or an operation fails, the last valid scene remains visible, the failure is named, and Reset View or retry provides an immediate recovery path.

## Affected users and systems

Biomedical engineers and surgeons use the same interaction model. This affects the viewport and slice layout, camera and input routing, crosshair and coordinate readout, display controls, placement modes, command/shortcut routing, shared operations, render-state diagnostics, and browser-level interaction tests.

## Constraints

- The reference boundary is the four linked 3D Slicer documentation sections: interacting with views, 3D view, mouse and keyboard shortcuts, and coordinate systems.
- “Same features” means equivalent observable behavior, not copying Slicer’s Qt layout or visual styling.
- The linked sections define viewing, slice inspection, display, placement, and coordinate behavior. They do not define mesh sculpting or cranial-repair geometry editing; those mechanics need a separate source and specification.
- Source anatomy remains immutable. View state cannot create a candidate revision or alter source volume bytes.
- RAS is the internal patient/world coordinate convention. File data is treated as LPS unless its metadata explicitly declares RAS, and import preserves the full image-to-patient affine.
- Existing canvas behavior is not evidence that a convention is correct. The new spec and verified Slicer behavior are authoritative for this relaunch.
- A feature is not complete when a DOM event fires. Proof must assert the intended camera, scene, domain, and rendered-output effect and the absence of console, WebGL, and non-finite-state failures.
- UI follows `DESIGN.md`: viewport-first, compact editor chrome, Radix-first interactive primitives, visible focus, and explicit disabled reasons.
- Every operation must be deterministic under repeated input, rapid view switching, stale async completion, and failure/retry.

## Out of scope

- Slicer modules, extensions, Python console, DICOM database, and application-wide features not present in the linked view and coordinate sections.
- Stereo hardware support that a browser and available display cannot expose. The UI may show it only when capability detection proves support.
- Clinical validation, diagnosis, treatment decisions, manufacturing approval, or safety claims.
- Geometry sculpting, boolean repair, implant generation, and other mesh-edit semantics not described by the linked Slicer material.

## Open questions

1. Which Slicer editing or segmentation module documentation should define the later geometry-editing contract?
2. Which browser/device combinations are acceptance targets for touch and stereo capability checks?

## Amendments

- 2026-11-14: Replaced the command-menu-first relaunch with a 3D Slicer parity brief. The former P0 plan is discarded because visible controls and click-level tests did not prove correct canvas behavior.
- 2026-11-14: Selected a 3D-first Cross-reference Workbench: persistent compact slice dock, contextual mode options and inspector, and compact RAS with expandable LPS/IJK.
