# Plan: Software app model (domain + persistent CRUD)

Spec: [spec.md](spec.md) · Status: draft · Date: 2026-11-14

## Approach

Build a single persistence path: SQLite for metadata/relationships and filesystem for NRRD bytes under `data/storage/volumes`. Implement in vertical TDD slices at two seams (storage + HTTP), proving atomic behavior for import/delete failure paths before wiring extra UI callers.

## Files that change

- `features/3d-bone-editor/software-app-model/plan.md` (this file)
- `app/server/storage.ts` (replace/complete with SQLite-backed storage adapter; R1, R1a, R2, R4, R5, R7, R7a, R8–R14, R17)
- `app/server/api.ts` (HTTP CRUD contract + error mapping; R8–R13, R16, R17)
- `app/vite-api-plugin.ts` (mount API middleware in dev server; R16)
- `app/vite.config.ts` (enable API middleware for local/dev tests; R16)
- `app/src/domain/types.ts` (only if schema fields need alignment; R1–R4, R14)
- `app/src/api/client.ts` (remove/align conflicting endpoints so one persistence surface remains; R7)
- `app/tests/backendCrud.test.ts` (storage-seam CRUD + atomic tests; R8–R14, R16, R17)
- `app/tests/backendApi.test.ts` (HTTP-seam parity + failure contract tests; R8–R13, R16, R17)
- `app/tests/helpers.ts` (test temp-dir/sqlite-fixture utilities if needed)
- `docs/ops-catalog.md` (document stable op/API behavior for CRUD + failures; R8–R13)

## Order of work

1. Lock test harness: add isolated temp workspace helper for SQLite db + `volumes/` folder per test run (no shared state).
2. **RED (storage seam):** add failing tests for project CRUD (`create/list/get/delete`) including delete cascade expectations.
3. **GREEN:** implement minimal SQLite tables (`users`, `projects`, `cases`, `samples`, `candidates`, `candidate_revisions`, `volume_assets`) and pass project CRUD tests.
4. **RED:** add failing storage tests for case/sample/candidate/revision CRUD, including unverified-candidate reject and R0 reference behavior.
5. **GREEN:** implement minimal sample import (write NRRD + row linkage), candidate create R0 (`volumeId` reference + identity pose), revision append/restore.
6. **RED (atomic import):** add failing storage tests that inject fs write failure during sample import; assert no partial DB rows/files.
7. **GREEN:** wrap DB+fs operations in explicit transaction workflow + compensation/rollback so atomic import passes.
8. **RED (atomic delete):** add failing storage tests that inject failure during delete cascade; assert prior state remains consistent when operation fails.
9. **GREEN:** implement delete cascade ordering + rollback/compensation strategy for files/rows.
10. **RED (HTTP seam):** add failing API parity tests for each CRUD family and key failure contracts (400/404/409/500 as applicable).
11. **GREEN:** implement `app/server/api.ts` routing + validation + error mapping to match storage semantics.
12. Wire Vite plugin/config and run focused + full tests.
13. Update deviations/docs if implementation departs from this plan.

## Risks

- **Biggest risk:** false atomicity confidence from shallow mocks. Mitigation: failure injection at deterministic boundaries plus post-failure state assertions at both seams.
- **Dual store drift:** existing partial JSON/storage stubs can survive unnoticed. Mitigation: enforce one persistence path and remove/disable conflicting writes.
- **Cascade correctness:** delete with shared references can orphan rows/files. Mitigation: explicit foreign-key constraints, ordered deletes, and orphan-file assertions.
- **API/status drift:** HTTP wrappers can hide storage errors. Mitigation: parity tests per CRUD family and explicit error-contract assertions.

## Proof

### Storage seam (`app/tests/backendCrud.test.ts`)

- R1, R1a, R2, R4, R5: persisted entity/ownership round-trip across reopen using SQLite + fs fixtures
- R3, R6: source anatomy protected + NRRD bytes authoritative
- R7, R7a: one persistence surface assertions (no shadow JSON metadata store)
- R8: project create/list/get/delete
- R9: case create/delete cascade
- R10: sample import/read/delete with raw-byte/hash checks
- R11: candidate create/delete + unverified reject
- R12: revision append/list/restore order
- R13: failed writes leave prior durable state unchanged
- R14: candidate R0 references sample volumeId + identity pose
- R17: atomic import/delete failure tests with deterministic fs fault injection

### HTTP seam (`app/tests/backendApi.test.ts`)

- R8–R12, R16: CRUD parity vs storage seam for projects/cases/samples/candidates/revisions
- R10, R13, R17: NRRD serve success/missing-file failure contract
- R13, R17: failure responses do not imply success and do not leave partial state

### Commands

```bash
cd app && npm test -- backendCrud.test.ts backendApi.test.ts
cd app && npm test
cd app && npm run build
```

## Deviations

- None yet.
