# Plan: Slicer-standard cross-reference workbench

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

## Approach

Replace the canvas through independently provable vertical slices, starting with observability and coordinate truth before adding controls. Keep existing management surfaces and design tokens. Reuse the current canvas components where their responsibility remains valid, add only the shared view/dock components the new hierarchy requires, and remove obsolete floating controls only after their replacement passes browser proof.

Each slice follows red → green → refactor. A slice is not green when a handler fires; its tests must verify camera, model, slice, coordinate, domain, and rendered-output effects defined by the spec.

## Files that change

### Feature and product contract

- `features/3d-bone-editor/canvas-workspace-improve/intent.md` (modified): accepted scope and resolved questions.
- `features/3d-bone-editor/canvas-workspace-improve/spec.md` (modified): final requirement decisions and implementation locations.
- `features/3d-bone-editor/canvas-workspace-improve/ui-journeys.md` (new): selected Cross-reference Workbench journeys and placement rules (R73-R85).
- `features/3d-bone-editor/canvas-workspace-improve/plan.md` (modified): this implementation sequence.
- `PRODUCT.md` (modified): move synchronized slice inspection, crosshair coordinates, ruler, and window/level from deferred to the accepted canvas scope before code begins.
- `docs/design-conventions.md` (modified): durable canvas hierarchy and Slicer input conventions (R58-R63, R73-R85).

### State, coordinates, and commands

- `app/src/domain/types.ts` (modified): typed active view, layout, interaction mode, crosshair, projection, slice, render-health, and coordinate state (R3-R17, R18-R30).
- `app/src/state/store.ts` (modified): separate domain, view/layout, and transient mode state; latest-request guards (R3-R10).
- `app/src/io/nrrd.ts` (modified): preserve declared basis, origin, spacing, directions, and homogeneous IJK-to-patient affine (R11-R16).
- `app/src/geometry/coordinates.ts` (new): IJK/LPS/RAS and patient/world conversions with singular-transform rejection (R11-R17).
- `app/src/commands/registry.ts` (modified): Slicer bindings, one-primary-control metadata, scope, disabled reasons, and platform labels (R1-R2, R58-R63, R74-R82).
- `app/src/ops/index.ts`, `app/src/ops/session.ts` (modified): explicit view, crosshair, display, placement-draft, and recovery operations with write-boundary guards (R2-R10, R21-R30).
- `app/src/debug/bridge.ts` (modified): complete automation snapshot and deterministic failure hooks (R66-R71).

### Reusable canvas structure

- `app/src/App.tsx` (modified): reduce canvas orchestration to document loading, command dispatch, and shared workspace state.
- `app/src/ui/CanvasWorkspace.tsx` (new): 3D-first grid, active view, layout switching, responsive collapse, and inspector allocation (R18-R24, R73-R85).
- `app/src/ui/ViewFrame.tsx` (new): shared 3D/slice frame, active state, header slots, maximize/restore, local pending/error/recovery (R19-R24, R42, R51, R77).
- `app/src/ui/ViewController.tsx` (new): shared grouped view actions and advanced-settings popover (R36-R49, R52-R57).
- `app/src/ui/SliceDock.tsx` (new): synchronized Axial/Sagittal/Coronal frames with labelled collapsed state (R18, R21-R24, R50-R57, R73, R79).
- `app/src/ui/DocumentTaskbar.tsx` (modified): document bar plus layout switch and global canvas actions (R20, R63, R74).
- `app/src/ui/ToolRail.tsx` (modified): View, Window/Level, and Place modes only (R25-R30, R75).
- `app/src/ui/OptionsBar.tsx` (modified): contextual active-mode options; no duplicate view/file actions (R30, R76, R81-R82).
- `app/src/ui/Inspector.tsx` (modified): selection/operation-owned overlay drawer with object display, spatial, and revision sections (R78, R85).
- `app/src/ui/StatusBar.tsx` (modified): compact RAS, expandable LPS/IJK, render health, last result, and recovery (R7-R10, R16, R80, R83).
- `app/src/ui/MenuBar.tsx`, `app/src/ui/CommandPalette.tsx` (modified): discovery mirrors only; Radix dismissal and command-scope paths (R62-R64, R82).
- `app/src/ui/NavCube.tsx` (removed after replacement): six directions move into the active 3D `ViewController` (R38, R43, R77).

### Rendering and input

- `app/src/viewport/Viewport.tsx` (modified): validated 3D camera state, Slicer mouse/keyboard bindings, projection switching, motion, ruler calibration, render recovery, and test observability (R5-R10, R31-R49, R58-R62).
- `app/src/viewport/SliceViewport.tsx` (new): patient-space slice extraction, crosshair, pan/zoom, offset, orientation, layers, interpolation, and show-in-3D contract (R18-R24, R50-R60).
- `app/src/viewport/navigationPolicy.ts` (modified): one Slicer-standard mapping with platform substitutions; remove Blender/alternate scheme ambiguity (R31-R41, R58-R62).
- `app/src/geometry/displayMesh.ts`, `app/src/geometry/volumeIsoMesh.ts` (modified only where required): retain last valid geometry and expose render-resource lifecycle without changing authoritative volume data (R6-R9).
- `app/src/styles/tokens.css`, `app/src/App.css` (modified): Cross-reference Workbench grid, compact view headers, slice dock, contextual inspector, touch/narrow/short adaptations (R42, R51, R64-R65, R73-R85).

### Tests

- `app/tests/coordinates.test.ts` (new): affine, LPS/RAS, oblique directions, singular transforms, and readouts (R11-R17).
- `app/tests/canvasViewState.test.ts` (new): state boundaries, validation, latest-request convergence, and reset recovery (R1-R10).
- `app/tests/commandsRegistry.test.ts` (modified): Slicer bindings, platform labels, scope, uniqueness, and text-input suppression (R58-R63, R74-R82).
- `app/tests/ui/canvasWorkspace.test.tsx` (new): hierarchy, 3D-first layout, dock collapse, inspector allocation, and duplicate-control rejection (R73-R85).
- `app/tests/ui/viewFrame.test.tsx` (new): active, linked, maximize, pending, failure, and recovery states (R19-R24, R42, R51, R77).
- `app/tests/ui/modes.test.tsx` (new): View, Window/Level, Place, data prerequisites, and one-shot/persistent behavior (R25-R30).
- `app/tests/ui/statusBar.test.tsx` (modified): compact RAS, expandable detail, render health, result lifecycle (R16, R66, R80, R83).
- `app/e2e/slicer-navigation.spec.ts` (new): mouse, keyboard, projection, directions, visibility, motion, reset, and model invariants (R31-R49, R58-R62, R66-R70).
- `app/e2e/slicer-cross-reference.spec.ts` (new): slice dock, crosshair synchronization, offsets, layers, window/level, and placement (R18-R30, R50-R60, R66-R70).
- `app/e2e/canvas-recovery.spec.ts` (new): stale loads, hidden-all, invalid camera, render-setting rollback, WebGL loss/rebuild, and random-operation stress (R5-R10, R67-R71).
- `app/e2e/canvas-workflow.spec.ts` (modified): replace click-through assertions with documented state and rendered-effect oracles (R67-R70).

## Order of work

1. **Scope gate.** Accept `intent.md`, `spec.md`, and `ui-journeys.md`; reconcile `PRODUCT.md` deferrals. Do not write feature code before this gate.
2. **RED — observability.** Extend the debug bridge and browser fixtures so tests can read camera, target, projection, clipping, object matrices, visibility, crosshair, slices, affine, pending count, WebGL, and last result. Add forced stale-load, render-setting, and WebGL failures (R66-R71).
3. **GREEN — safety kernel.** Add finite-state validation, last-valid-scene retention, latest-request identity, hidden-all state, and Reset/Rebuild recovery before changing UI (R1-R10).
4. **GREEN — coordinate truth.** Preserve NRRD spatial metadata and implement tested IJK/LPS/RAS conversions. Make all picking and readouts use one transform chain (R11-R17).
5. **GREEN — reusable shell.** Build `CanvasWorkspace`, `ViewFrame`, `SliceDock`, and the selected hierarchy using existing tabs, rail, options, inspector, and status components. Remove duplicate controls only after hierarchy tests pass (R73-R85).
6. **GREEN — 3D navigation.** Replace scheme switching with Slicer-standard camera inputs, standard views, center/reset, maximize, tilt lock, spin/rock, and one-button/trackpad/touch paths (R31-R41, R58-R62).
7. **GREEN — 3D display.** Add projection-preserving framing, orthographic ruler, orientation marker, visibility, supported transparency/shadow diagnostics, FPS, and truthful stereo capability handling (R42-R49).
8. **GREEN — synchronized slices.** Add Axial/Sagittal/Coronal/Oblique slice rendering, dock collapse, linked crosshair/offsets, view grouping, maximize, and show-in-3D (R18-R24, R50-R54, R73, R79).
9. **GREEN — volume display and modes.** Add layers, blending, opacity, interpolation, Window/Level, and Place one-shot/persistent sessions with explicit missing-data states (R25-R30, R55-R57).
10. **HARDEN — failure and stress.** Run forced failures and randomized valid action sequences; fix any blank, stale, non-finite, contradictory, or unrecoverable state (R1-R10, R64-R71).
11. **VISUAL VERIFY.** Inspect the rendered workspace at 1440×900, 1280×720, a short desktop viewport, and touch capability. Drive resting, expanded dock, maximized view, selected-object, all-hidden, loading, error, and recovery states. Run Impeccable detection and finish review before Close.
12. **CLOSE.** Run all proof, compare intent → spec → plan → diff, update final paths/decisions, mark plan done, and update the project index.

## Risks

- **Coordinate error is silent and high impact.** A double LPS/RAS flip can make every label and crosshair look plausible but wrong. Known affine fixtures must precede UI work.
- **Three render paths can diverge.** Mesh, volume slices, and overlays must share patient/world transforms and document request identity.
- **Input conflicts can complete the wrong action.** Navigation modifiers, crosshair movement, placement, and browser-reserved shortcuts need one event router and active-view ownership.
- **Four render surfaces can exceed the frame budget.** Slice views update only on relevant state changes; continuous 3D animation cannot force unnecessary slice extraction.
- **The right inspector can recreate the current width problem.** Hierarchy tests enforce no reserved inspector width without selection/review.
- **Removing old controls can break undiscovered workflows.** Registry tests and command search preserve supported actions while primary placement changes.
- **Browser stereo may remain unavailable.** Capability detection must disable or omit it; no plan step may fake support.

## Proof

| Proof ID | Requirements | Command / evidence |
|-|-|-|
| P1 State safety | R1-R10 | `cd app && npm test -- canvasViewState.test.ts` |
| P2 Coordinates | R11-R17 | `cd app && npm test -- coordinates.test.ts` |
| P3 Linked layout | R18-R24, R50-R57, R73, R77, R79 | `cd app && npm test -- ui/canvasWorkspace.test.tsx ui/viewFrame.test.tsx` |
| P4 Modes | R25-R30, R75-R76 | `cd app && npm test -- ui/modes.test.tsx` |
| P5 3D navigation/display | R31-R49, R58-R62 | `cd app && npx playwright test e2e/slicer-navigation.spec.ts` |
| P6 Cross-reference | R18-R30, R50-R60 | `cd app && npx playwright test e2e/slicer-cross-reference.spec.ts` |
| P7 Hierarchy | R64-R65, R73-R85 | `cd app && npm test -- ui/canvasWorkspace.test.tsx ui/statusBar.test.tsx commandsRegistry.test.ts` |
| P8 Render truth | R66-R70 | Browser assertions compare debug snapshot, object matrices, frustum visibility, WebGL state, and rendered frames in both Slicer E2E suites |
| P9 Recovery/stress | R5-R10, R67-R71 | `cd app && npx playwright test e2e/canvas-recovery.spec.ts` |
| P10 Regression | all accepted requirements | `cd app && npm test && npm run build && npx playwright test` |
| P11 Feature docs | document integrity | `python3 .agents/skills/intent-spec-plan/scripts/check_features.py .` |
| P12 Design quality | R64-R65, R73-R85 | `.agents/skills/impeccable/scripts/impeccable detect --json`, required viewport captures, and Impeccable finish-review verdict |

## Deviations

- Combined Playwright proof into `app/e2e/canvas-workflow.spec.ts` (+ `app/playwright.config.ts`) instead of three separate Slicer E2E files. Coverage still asserts camera/projection/crosshair/mode/recovery effects via `readCanvas`.
- Slice rendering lives in `app/src/ui/SliceViewport.tsx` (not `app/src/viewport/SliceViewport.tsx`) so it reuses the same dock/ViewFrame composition path.
- Mode rail / contextual options / status strip are owned by `CanvasWorkspace` rather than rewriting `ToolRail` / `OptionsBar` / `StatusBar` as the primary canvas chrome. Legacy floating components remain in the tree for non-canvas callers but are not mounted in the workbench.
- Deferred to a follow-up accepted scope change (still required by the ledger, not dropped): oblique reformat, slice layers/blending, Show-in-3D, full keyboard/keypad matrix, trackpad/touch substitution paths, depth peeling / ambient shadows / FPS overlay, stereo capability UI, and randomized stress interleaving beyond the recovery path already proven.
