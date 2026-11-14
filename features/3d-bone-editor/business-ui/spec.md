# Spec: Business UI (management surfaces)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14

## Summary

Connect management UI to the shipped software-app-model API so projects/cases/samples/candidates are created, listed, opened, and deleted against durable backend state. Keep the Atlassian-like management structure already in place, but prioritize correctness and persistence over visual polish in this unit.

## Requirements

- R1. Management CRUD uses `/api` as the source of truth for projects, cases, samples, and candidates; writes are not local-only best-effort.
- R2. After each successful create/delete/transform/restore mutation, UI reloads authoritative project state from backend before rendering dependent views.
- R3. Projects surface supports list, create, open, and delete against backend records.
- R4. Cases & Anatomy surface supports case create/delete under the active project.
- R5. Samples support import into the selected case from the prepared catalog by uploading NRRD bytes + spatial metadata to backend and then reloading state.
- R6. Candidates support create/delete from the management surface; candidate create enforces backend verification constraints and surfaces clear error messages.
- R7. Management UI avoids synthetic/fake audit records that can diverge from persistence truth.
- R8. Opening sample/candidate in 3D keeps working by hydrating required volume bytes from backend volume endpoints when needed.
- R9. Existing management dialogs remain the write entry points (no `window.prompt` regressions).
- R10. Tests cover backend-connected management behavior at the UI seam for project/case/sample/candidate flows and key failure cases.

## Success criteria

- S1. User can create a project from UI, reopen it, and still see it after reload of project list.
- S2. User can create and delete cases/samples/candidates and UI reflects backend state after each operation.
- S3. Import sample from prepared catalog writes to backend and appears in Cases & Anatomy with persistent identifiers.
- S4. Candidate create on unverified sample shows backend rejection message and does not create local phantom rows.
- S5. Opening a sample/candidate in canvas can fetch required volume bytes from backend when not already cached in-memory.
- S6. UI tests fail before wiring and pass after wiring for at least one full create path and one delete path.

## Design

### Approach

- Keep existing component hierarchy (`Sidebar`, `ProjectsHome`, `CaseTableView`, dialogs).
- Move orchestration to `App.tsx` using `apiClient` calls plus a shared "reload active project" flow.
- Preserve local editor store as render state cache for the active project only; never treat it as durable truth.

### Interfaces

- Uses existing backend routes from software-app-model:
  - `GET/POST/DELETE /projects`
  - `POST/DELETE /projects/:id/cases(/:caseId)`
  - `POST /projects/:id/cases/:caseId/samples` and `DELETE /samples/:id`
  - `POST/DELETE /samples/:id/candidates` and `DELETE /candidates/:id`
  - `POST /candidates/:id/transform`, `POST /candidates/:id/restore`
  - `GET /samples/:id/volume`

### Out of scope

- Canvas transform UX redesign and tool behavior rules.
- Visual styling polish pass.
- Persistent audit/event log model.

## Where it lives

- Docs: `features/3d-bone-editor/business-ui/`
- App orchestration: `app/src/App.tsx`
- API transport: `app/src/api/client.ts`
- Management views/dialog interactions: `app/src/ui/ProjectsHome.tsx`, `app/src/ui/CaseTableView.tsx`
- UI seam tests: `app/tests/ui/`
