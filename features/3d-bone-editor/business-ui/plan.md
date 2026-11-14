# Plan: Business UI (management surfaces)

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

## Approach

Implement in vertical TDD slices from the UI seam, wiring existing management components to backend API without broad UI refactors.

## Files that change

- `features/3d-bone-editor/business-ui/intent.md`
- `features/3d-bone-editor/business-ui/spec.md`
- `features/3d-bone-editor/business-ui/plan.md`
- `app/src/api/client.ts`
- `app/src/App.tsx`
- `app/src/ui/ProjectsHome.tsx`
- `app/src/ui/CaseTableView.tsx`
- `app/tests/ui/appShell.test.tsx` (or new focused UI integration test file)

## Order of work

1. RED: add/adjust UI tests for backend-driven management actions (project create/open/delete, case/candidate mutation visibility).
2. GREEN: extend API client with missing management endpoints (sample upload + delete routes).
3. GREEN: refactor `App.tsx` orchestration so backend is source of truth and active project is reloaded after mutations.
4. GREEN: add delete affordances in management views and wire handlers.
5. GREEN: remove synthetic audit-only data path to avoid fake management state.
6. GREEN: keep canvas open behavior functional by lazy volume hydration from backend.
7. Run targeted tests, then full app test/build commands.

## Risks

- Existing local store assumptions can silently diverge from backend IDs/state if not fully replaced in mutation paths.
- Sample import can fail due to multipart/meta mismatch; error handling must surface backend message clearly.
- Delete actions can target stale selections; selection state must be reset after reload when deleted IDs disappear.

## Proof

```bash
cd app && npm test -- appShell.test.tsx projectsHome.test.tsx
cd app && npm test
cd app && npm run build
```

## Deviations

- Removed synthetic Audit Log rendering from `CaseTableView` in this unit to keep management UI aligned with durable backend truth until a real event model exists.
