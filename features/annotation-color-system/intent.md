# Intent: Shared annotation colour system

Author: Minh Triet Nguyen · Date: 2026-11-15 · Status: accepted

## Problem
Only surface highlights can be coloured (four choices). Every other annotation (landmarks/nodes, lines/edges, curves, angles, planes, ROIs) is fixed accent blue or a hard-coded amber. With several annotations on a skull you can't tell them apart, and the case report needs colour-coded highlights like the reference report.

## Desired outcome
- One shared palette of 5 colours used by all annotation tools.
- Any annotation object (nodes, edges, planes, ROIs, curves, angles, highlights) can be set to any palette colour, at placement time and later from the annotation panel.
- The colour shows the same in the 3D viewport, the slice views and the annotation list.
- Saving, revisions, commit and persistence work exactly as today; colour is just another annotation property.

## Affected users and systems
- Anyone marking up a case; the case report renders.
- `app/src/viewport/AnnotationOverlay.ts`, slice overlays, `ContextStrip`/annotation panel UI, annotation `meta`.
- `DESIGN.md` gains an "annotation palette" section for colours inside the 3D canvas only (approved 2026-11-15). App chrome stays Base/Ink/Accent.
- Changes `features/3d-bone-editor/mechanical-last-parts/spec.md` R62 (highlight colours) to use the shared palette.

## Constraints
- Do not change persistence, commit, revision or API logic beyond storing the colour value.
- Existing annotations without a colour keep their current look.
- Colours must stay readable on the bone surface and on the slice images, in light and dark themes.
- `signal` red stays reserved for danger UI. If a palette red is wanted it must be clearly distinct.

## Out of scope
- Custom hex colour pickers, per-vertex colours, opacity controls.
- Colouring the bone meshes or volumes themselves.

## Open questions
- Which 5 colours? Proposal: accent blue, amber, emerald, rose, slate. Validated for contrast in the spec.
- Default colour per annotation type (all accent, or a different default per type)?

## Amendments
- 2026-11-15: Accepted by the owner ("spec it"). The palette and per-type defaults were not chosen explicitly; the spec proposes accent blue, amber, emerald, rose, slate with accent as every type's default, for review.
