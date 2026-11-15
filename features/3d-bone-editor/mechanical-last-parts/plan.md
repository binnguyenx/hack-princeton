# Plan: Mechanical last parts — plane/ROI direct manipulation fixes (R88–R95)

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-15

> Historical: R88–R95 implemented 2026-11-15 on `feat/deep-agent-case-report`; manual browser check pending. See Deviations.

> The original Phase 1/2 build plan (done 2026-11-14) is in git history: `git show 5f8bc1f:features/3d-bone-editor/mechanical-last-parts/plan.md`.

## Approach
Move all drag math into a pure, camera-independent module (`extentDrag.ts`). It solves each handle against its constraint from the pointer ray: a line for move, face and size handles, and a sphere for tilt. A small drag-session object owns the snapshot, cancel, commit-once and per-frame throttling. `Viewport.tsx` keeps only wiring: building handles aligned to the plane, raycasting, pointer capture, and forwarding the session's edits. Escape reaches the session through a viewport manipulation API that `App.tsx`'s single shortcut owner calls first (canvas-interaction-contracts R5).

## Files that change
- `app/src/viewport/annotationBehaviors/extentDrag.ts` (new): plane frame (normal, u, v, half sizes), handle layout, ray solvers for plane move/tilt/size and ROI face/move, min-size clamps (R88, R89, R90)
- `app/src/viewport/annotationBehaviors/extentDragSession.ts` (new): snapshot, live edit, cancel → original, end → one commit, one live update per frame (R91, R92)
- `app/src/viewport/annotationBehaviors/index.ts`: exports
- `app/src/viewport/Viewport.tsx`: handles from the layout (aligned with the plane, move/tilt/size, ROI faces plus centre), ray-based drags through the session, `boundingBoxMm` read via ref so drags survive re-renders, constant screen size, hover state and cursors, `manipulationApiRef.cancel()` (R88–R95)
- `app/src/App.tsx`: Escape first cancels an active manipulation; passes `manipulationApiRef` (R91)
- `app/src/App.css`: cursor classes for handle hover (R94)
- Tests: `app/tests/extentDrag.test.ts` (new), `app/tests/extentDragSession.test.ts` (new); existing `annotationBehaviors.test.ts`, `canvasInteractions.test.ts` stay green (R95)

## Order of work
1. Plane frame and handle layout (u/v aligned with the rendered plane).
2. ROI face drag with opposite face fixed and 2 mm clamp (S23, S24).
3. ROI centre move.
4. Plane move along the normal (S26 math).
5. Plane tilt keeps the knob on the cursor ray from an oblique camera (S22).
6. Plane size handle follows the cursor (pad).
7. Drag session: cancel restores, end commits once, live updates per frame (S25, R92).
8. Viewport wiring, Escape path in App, cursors, constant handle size; manual check in the browser.

## Risks
- The Viewport wiring is the riskiest step and the hardest to unit test. Mitigation: keep it thin, with all decisions in the pure modules, and check it manually in the running app.
- The old `applyOrientedExtentDrag` stays exported (the list row's Size/Rotate buttons use `rotatePlaneNormal`/`scalePlanePad`). Only the gizmo path stops using screen deltas.
- Changing the effect dependencies (`boundingBoxMm` via ref) could leave stale handles when the bounding box changes. Mitigation: re-layout handles on every live edit and on bbox change, without tearing down the listeners.

## Proof
- R88, S22: `extentDrag.test.ts` "tilt keeps the knob on the pointer ray from an oblique camera"; "size handle edge follows the pointer"
- R89: `extentDrag.test.ts` plane layout/move/tilt/size cases
- R90, S23, S24: `extentDrag.test.ts` ROI face and centre cases
- R91, S25: `extentDragSession.test.ts` cancel/end cases
- R92, S26: `extentDragSession.test.ts` per-frame throttle; plane-driven slice follows existing live `onExtentEdit(…, false)` path (manual check)
- R93, R94, R95, S27: `canvasInteractions.test.ts` (unchanged, locked/modifier ownership) + manual browser check of hover cursors and constant size
- Whole app: `cd app && npm test && npm run build` (Node ≥ 22.22)

## Deviations
- `planeRectSize` and the plane-normal rule moved into `extentDrag.ts` (`AnnotationOverlay.ts` re-exports `planeRectSize`) so the gizmo frame and the rendered rectangle can't disagree. No behaviour change.
- No CSS cursor classes: the gizmo sets `canvas.style.cursor` directly on hover/drag. `App.css` unchanged for this work.
- Gizmo handles use palette `accent` (move/tilt) and `amber` (resize), via `annotationColorHex`, matching the previous handle colours.
- A click on a handle without movement commits nothing (session `end()` with no move). Release after movement commits exactly once (R91).
- If selection changes mid-drag, the session is cancelled (geometry restored) before the gizmo is torn down.
- Manual browser check (hover cursors, constant handle size, feel of tilt/move/size) not done in this session: no browser automation available. Needs a human pass in `npm run dev`.
