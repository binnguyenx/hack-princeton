# Preflight: Phase A Express HTTP contract tests

Date: 2026-11-14 · Responsible agent: main backend agent · Classification: authorized test-only migration foundation

## 1. Task and file scope

Implement reusable HTTP characterization scenarios for all 13 current Express routes. Add an Express lifecycle adapter, disposable-storage fixture helpers, route/requirement coverage data, and focused documentation updates. Do not implement FastAPI or change public API/storage behavior.

## 2. Documents and source inspected

- `AGENTS.md`, intent-spec-plan guidance, and TDD guidance
- Migration intent, spec, active plan, and all migration preflights through `s13-rehearsal-order.md`
- `docs/project.md`, `docs/ai/setup.md`, `docs/ai/app-integration.md`, and `docs/ai/work-summary.md`
- `app/server/api.ts`, `app/server/storageSqlite.ts`, `app/vite-api-plugin.ts`, and `app/vite.config.ts`
- `app/src/api/client.ts`, `app/src/domain/types.ts`, and `app/src/io/projectPackage.ts`
- Existing HTTP, repository, ownership, revision, failure, mechanical, package, and cross-language tests under `app/tests/`

## 3. Requirement IDs

Phase A covers R1–R10, R14–R16, and R21 through S1–S6 against Express. It supplies prerequisite characterization evidence for later phases but does not verify FastAPI parity, live cutover, S13, or final runtime removal.

## 4. Classification

New reusable test capability plus baseline characterization. Application behavior must remain unchanged.

## 5. Intent

The owner authorized Phase A implementation on 2026-11-14. Recorded in intent Amendments. Entire migration, D1–D5, and Phases B–F remain unauthorized.

## 6. Spec and contracts

The route inventory and current-behavior sections remain the source of truth. D1–D5 stay proposed. Phase A asserts Express baselines separately from desired future behavior.

## 7. Acceptance

The owner authorized Phase A only. This does not accept the whole draft migration, D1–D5, Phase B–F implementation, or any FastAPI contract departure.

## 8. Dependencies and assumptions

- Existing Express, Multer, Vitest, Node SQLite, Fetch/FormData/Blob, and temporary-directory APIs are sufficient.
- Shared scenarios receive an HTTP base URL and lifecycle boundary; they do not import Express, SQLite, or repository methods.
- Express setup uses the actual router plus `express.json({ limit: "10mb" })`.
- Every started backend owns a unique temporary root and loopback ephemeral port.
- Synthetic bytes are test data only, not reconstruction output.
- Existing non-Phase-A working-tree changes are preserved.

## 9. Verification (actual results, 2026-11-14)

| Command | Result |
|-|-|
| `cd app && npm test -- tests/backendContract/expressContract.test.ts` | 1 file, **16 passed** |
| `cd app && npm test -- tests/backendContract/expressContract.test.ts tests/backendApi.test.ts tests/backendCrud.test.ts` | 3 files, **26 passed** |
| `cd app && npm test` | 18 files, **55 passed** |
| `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py` | **64 tests OK** |
| `cd app && npm run build && npm run lint` | build OK; lint: 2 pre-existing warnings (`nrrdImport` unused import; `App.tsx` exhaustive-deps) |
| `python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py .` | express-to-fastapi **ok**; 0 errors; 2 unrelated 3d-bone-editor warnings |
| `git diff --check` | clean |

Prerequisites: Node app dependencies installed under `app/`; Python 3.11+ with editable `backend/ai` install for the regression runner. No FastAPI package required. Do not set `HACK_STORAGE_ROOT` to a live root for these tests; the harness creates its own temporary directories.

## 10. Conclusion

Phase A is implemented: reusable HTTP contract scenarios pass against Express with disposable storage. Express remains the live application backend. FastAPI, Python application storage, frontend cutover, S13 rehearsal, and Express removal remain unimplemented. D1–D5 remain unresolved. Next prerequisite for Phase B: authorized Python live-application repository port with Node-created disposable data compatibility tests.

A preflight records readiness and verified Phase A evidence. It does not grant acceptance beyond the owner's explicit Phase A authorization.
