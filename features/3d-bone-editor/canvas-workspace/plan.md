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

```bash
cd app && npm test -- revisions.test.ts ui/documentTaskbar.test.tsx ui/appShell.test.tsx
cd app && npm test
cd app && npm run build
```

## Deviations

- Added supporting canvas context files not originally listed (`app/src/ui/DocumentTaskbar.tsx`, `app/src/ui/WorkspaceNavigator.tsx`, `app/src/geometry/pose.ts`, `app/tests/documentTabs.test.ts`) to enforce active-document consistency and revision wiring across taskbar + navigator paths.
- GLB-first loader is implemented and preferred when `displayMeshAsset` is present; curated prepared sample assets now include committed `display_mesh.glb`, while explicit derived-preview fallback remains for missing/invalid assets.
