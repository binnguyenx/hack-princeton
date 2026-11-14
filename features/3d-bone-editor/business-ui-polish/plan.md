# Plan: Business UI polish (design system hardening)

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

## Approach

Implement in TDD vertical slices at the UI seam: lock behavior with focused failing tests (search/filter/result-state consistency), then refactor management components to Radix Themes + Primitives while preserving callback contracts.

## Files that change

- `features/3d-bone-editor/business-ui-polish/intent.md`
- `features/3d-bone-editor/business-ui-polish/spec.md`
- `features/3d-bone-editor/business-ui-polish/plan.md`
- `docs/project.md`
- `app/package.json`
- `app/package-lock.json`
- `app/src/main.tsx`
- `app/src/styles/tokens.css`
- `app/src/App.css`
- `app/src/ui/Sidebar.tsx`
- `app/src/ui/AppHeader.tsx`
- `app/src/ui/ProjectsHome.tsx`
- `app/src/ui/CaseTableView.tsx`
- `app/src/ui/dialogs/NewProjectDialog.tsx`
- `app/src/ui/dialogs/NewCaseDialog.tsx`
- `app/src/ui/dialogs/ImportSampleDialog.tsx`
- `app/tests/ui/projectsHome.test.tsx`
- `app/tests/ui/appShell.test.tsx`

## Order of work

1. RED: add tests for management search/filter determinism and empty-result behavior.
2. GREEN: redesign `ProjectsHome` and `CaseTableView` using Radix Themes `Table`, `TextField`, `Tabs`, `Card`, `Badge`, `Button`.
3. GREEN: redesign `Sidebar` and `AppHeader` structure using Radix Themes layout + typography primitives.
4. GREEN: align dialog form structure for consistent controls and visual hierarchy while preserving behavior.
5. GREEN: tighten management CSS to reusable structure and remove obsolete ad-hoc classes.
6. Run targeted tests, then full app tests/build.

## Risks

- Refactor can accidentally break callback wiring due to structural changes.
- Mixed legacy CSS with new Radix components can cause conflicting spacing/states.
- Search/filter behavior may regress if UI state no longer maps directly to rendered rows.

## Proof

```bash
cd app && npm test -- ui/projectsHome.test.tsx ui/appShell.test.tsx
cd app && npm test
cd app && npm run build
```

## Deviations

- Added `@radix-ui/themes` and wrapped app root with `Theme` provider in `main.tsx` to enforce shared management-surface primitives.
- Kept existing canvas-oriented CSS sections in `App.css` unchanged; polish scope stayed on management/business surfaces only.
- Build now emits a larger CSS bundle due to shipping Radix Themes stylesheet; behavior is correct but bundle optimization is deferred.
