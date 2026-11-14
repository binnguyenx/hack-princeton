# Spec: Business UI polish (design system hardening)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14 (Close pass)

## Summary

Redesign the management/business surfaces into a cohesive Radix-first system while preserving existing CRUD behavior and backend contracts. Remove ad-hoc visual patterns, tighten information hierarchy, and add UI-seam tests that prevent common interaction regressions.

## Requirements

- R1. Management UI components must use `@radix-ui/themes` as the default visual/layout system for tables, tabs, form fields, buttons, badges, cards, and layout primitives.
- R2. `@radix-ui/react-*` primitives are allowed where Themes does not provide the needed behavioral primitive, but they must inherit the same styling hierarchy.
- R3. Existing management flows remain functional: project list/create/open/delete; case list/create/delete; sample import/delete/open-3d; candidate create/delete/open-3d.
- R4. Projects surface uses a consistent structure: header actions, search, table rows, and action affordances with no hand-rolled visual one-offs.
- R5. Cases & Anatomy surface uses one consistent data-table system with deterministic filter/search behavior and predictable row actions.
- R6. Search/filter inputs must have deterministic behavior:
  - projects search filters by project name,
  - case assets search filters visible rows,
  - empty-result state is explicit and actionable.
- R7. Active nav/tab state must stay consistent with visible content and available actions.
- R8. Dialog forms (new project/new case/import sample) use shared structure and control hierarchy; submit/disabled/close behavior is consistent.
- R9. Remove noisy filler or redundant copy that does not contribute to task completion.
- R10. Styling system for management UI uses a small reusable class layer only where Radix Themes APIs do not directly express requirements.
- R11. No regressions to accessibility baseline: keyboard-usable controls, visible labels, and clear disabled states.
- R12. Tests cover UI-glitch risk at the seam level for search/filter, empty-result behavior, action wiring, and tab/nav state consistency.

## Success criteria

- S1. The business layer looks visually cohesive and modern with consistent component language across projects, cases, and dialogs.
- S2. Filtering/searching in projects and case assets behaves predictably and is verified in tests.
- S3. No management action requires hidden/unlabeled controls or ambiguous click targets.
- S4. Existing CRUD behavior remains unchanged and existing UI tests still pass.
- S5. New UI-seam tests fail on pre-fix behavior and pass after redesign for at least:
  - case assets search filtering,
  - empty-result feedback,
  - project search + actions consistency.

## Design

### Approach

- Keep existing orchestration in `App.tsx` and API client contracts.
- Redesign presentation and interaction structure in `Sidebar`, `AppHeader`, `ProjectsHome`, `CaseTableView`, and management dialogs.
- Adopt Radix Themes components as primary UI building blocks.
- Reduce custom CSS to system-level layout hooks and canvas-only styles.

### Interfaces

- No backend API contract changes.
- No domain model changes.
- UI events and callbacks keep existing prop signatures unless tests and consumers are updated in the same change.

## Where it lives

- Docs: `features/3d-bone-editor/business-ui-polish/`
- Main shell wiring: `app/src/App.tsx`
- Management UI: `app/src/ui/Sidebar.tsx`, `app/src/ui/AppHeader.tsx`, `app/src/ui/ProjectsHome.tsx`, `app/src/ui/CaseTableView.tsx`
- Dialogs: `app/src/ui/dialogs/NewProjectDialog.tsx`, `app/src/ui/dialogs/NewCaseDialog.tsx`, `app/src/ui/dialogs/ImportSampleDialog.tsx`
- Styling: `app/src/App.css`, `app/src/styles/tokens.css`
- Tests: `app/tests/ui/projectsHome.test.tsx`, `app/tests/ui/appShell.test.tsx`

## Out of scope

- Canvas surface restyling.
- New feature behavior outside existing management CRUD and navigation scope.
