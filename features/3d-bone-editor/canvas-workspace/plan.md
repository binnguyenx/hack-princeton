# Plan: Canvas workspace (viewport + tools + sample wiring)

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

## Approach

Implement in vertical TDD slices from the canvas interaction seam: prove restore/apply state integrity first, then wire GLB-first rendering and degraded fallback messaging, then close with UI consistency and stress-path behavior checks.

## Files that change

- `features/3d-bone-editor/canvas-workspace/plan.md` (this file)
- `app/src/App.tsx`
- `app/src/viewport/Viewport.tsx`
- `app/src/geometry/derivedMesh.ts` (fallback path remains)
- `app/src/geometry/displayMesh.ts` (new GLB loading adapter)
- `app/src/ui/ToolRail.tsx`
- `app/src/ui/Inspector.tsx`
- `app/tests/revisions.test.ts`
- `app/tests/ui/documentTaskbar.test.tsx`
- `app/tests/ui/toolRail.test.tsx`

## Order of work

1. **RED:** add failing tests for restore edge cases and clean-state UI invariants (`R15a–R15e`, `R35a–R35l`).
2. **GREEN:** add restore/apply orchestration guards in `App.tsx`:
   - candidate-only restore/apply,
   - idempotent restore feedback,
   - draft-vs-restore conflict handling,
   - pending/re-entrant prevention.
3. **GREEN:** implement GLB-first display mesh loading (`R20–R23`, `R43–R50`) with explicit derived-mesh degraded fallback messaging.
4. **GREEN:** pin viewport render profile (material/light/background/camera framing) and ensure fallback status appears deterministically.
5. **GREEN:** align tool/taskbar/inspector behavior to one active context (`R51–R61`).
6. Run targeted tests, then full app test/build commands.
7. Update docs with final status/deviations and close report fields.

## Risks

- Missing/invalid GLB paths can create silent fallback drift if status messaging is not explicit.
- Async restore/apply can race with tab switches and cause stale messages or selection mismatch.
- Existing revision shortcuts (`Cmd/Ctrl+Z`) can fire repeatedly and trigger duplicate requests without pending guards.

## Proof

- R76: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R77: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R78: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R79: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R80: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R81: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R82: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R83: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R84: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.
- R85: scoped plan plans/save-open-package.md; package HTTP/codec/client/UI/browser round-trip and failure proofs.


- R69: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R70: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R71: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R72: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R73: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R74: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.
- R75: scoped Select/Visibility plan plans/select-visibility.md; public ops, Three.js and real browser proof.


```bash
cd app && npm test -- revisions.test.ts ui/documentTaskbar.test.tsx ui/appShell.test.tsx
cd app && npm test
cd app && npm run build
```

## Deviations

- Added supporting canvas context files not originally listed (`app/src/ui/DocumentTaskbar.tsx`, `app/src/ui/WorkspaceNavigator.tsx`, `app/src/geometry/pose.ts`, `app/tests/documentTabs.test.ts`) to enforce active-document consistency and revision wiring across taskbar + navigator paths.
- GLB-first loader is implemented and preferred when `displayMeshAsset` is present; curated prepared sample assets now include committed `display_mesh.glb`, while explicit derived-preview fallback remains for missing/invalid assets.

## Manual rigid construction follow-up proof

R63,R64,R65,R66,R67,R68: [plans/manual-rigid-placement.md](plans/manual-rigid-placement.md); rigidPlacement.test.ts, rigidPlacementControls.test.tsx, HTTP test_placement.py and actual browser placement.e2e.ts. Earlier proof remains historical.

## Documentation reconciliation (2026-11-14)

Mechanical README and canvas gap report were reconciled with current UI/API/ops source and existing tests. This is a documentation-only status correction, not an implementation pass or whole-ledger acceptance. Numeric placement and Focus are implemented; Select, Visibility, package controls, shortcut/debug parity and advanced mechanics have explicit gaps. Review scope and document-check evidence: [preflights/mechanics-gap-review.md](preflights/mechanics-gap-review.md). Existing runtime test counts belong to prior implementation verification, not this review.

## Select/Visibility follow-up (2026-11-14)

R69–R75 are implemented under [plans/select-visibility.md](plans/select-visibility.md): whole-active-object picking/outline, rendered hide/show/recovery and shared view-only ops with canonical identity/gesture guards. Current proof117 backend/99 app/10 browser tests passes; missing face/region, view persistence, full control facade, reconstruction and AI mutation remain explicit. Scoped preflight and current README/spec gaps are updated.


## Save/Open Package follow-up (2026-11-14)

R76–R85 are implemented and verified under [plans/save-open-package.md](plans/save-open-package.md): authoritative bounded ZIP export, validated new-copy import/remapping, rollback compensation, preserved restored pointer/volume hashes and portable presentation, owned revision volume reads, trusted mesh hash gating, native download/file chooser and guarded pending/error flows. Current proof:127 Python,105 app,12 real browser journeys. SQLite/files remain primary; package overwrite/merge, automatic crash reconciliation, reconstruction and AI live writes are excluded.
