# Plan: Express-to-FastAPI application backend migration

Spec: [spec.md](spec.md) · Status: done (migration scope; hardening remains proposed) · Date: 2026-11-14

## Approach

Capture the current external and durable-storage contracts before changing backend code. Port the live repository without redesigning it, run the same HTTP scenarios against both servers, then cut the frontend over with verified pre-write and post-write rollback paths. The final application has one FastAPI/Python backend; Vite is frontend tooling, Express is temporary migration support, and the Python sandbox remains separate.

Historical Phase A authorization was test-only. The owner subsequently authorized the nine-task queue: current baseline implementation and disposable verification can proceed, while proposed hardening is not inferred accepted and live cutover/removal retain explicit gates. See task-board.md.

## Phase A — Capture existing contracts

Requirements: R1–R10, R14–R16, R21; S1–S6.

Status: implemented against Express (verified). Later eligible queue slices are recorded below; live cutover/removal remain gated.

Expected files:

- `app/tests/backendContract/scenarios.ts` (new): backend-neutral HTTP scenarios and explicit relationship assertions.
- `app/tests/backendContract/types.ts` (new): lifecycle target contract containing only base URL, restart, and cleanup.
- `app/tests/backendContract/fixtures.ts` (new): deterministic HTTP fixture builders, synthetic bytes, and narrow response helpers.
- `app/tests/backendContract/coverage.ts` (new): 13-route and requirement/scenario coverage map.
- `app/tests/backendContract/expressLifecycle.ts` (new): actual Express router/middleware, ephemeral loopback server, unique temporary root, restart, teardown, and fault controls.
- `app/tests/backendContract/expressContract.test.ts` (new): registers the reusable suite against the Express lifecycle.
- `app/tests/backendApi.test.ts` (adapt): Express-only storage-fault HTTP characterization (import/delete/serve faults).
- `app/tests/backendCrud.test.ts` (retain): repository behavior and fault evidence.
- `app/tests/revisions.test.ts`, `ownership.test.ts`, and mechanical tests (retain): backend-independent domain evidence.
- `app/server/storageSqlite.ts` (minimal test support): expose current test storage-root state so lifecycle teardown can restore shared configuration without touching storage semantics.
- Phase A preflight, this plan, spec locations, setup/project/work summary, and agent commands (update): authorization, commands, verified counts, and remaining gaps.

Dependencies:

- Existing Vitest, Express, Node SQLite, Fetch, and temporary-directory support.
- Owner decisions for final assertions on D1–D5. Baseline capture can start before those decisions.

Order and evidence:

1. Build launch/storage adapters that start Express against a disposable root and return one base URL.
2. Move API assertions into a reusable suite that accepts only base URL and lifecycle hooks.
3. Normalize generated UUIDs and timestamps by aliases while asserting referential equality, order, hashes, poses, metadata, optional fields, and current pointers.
4. Cover all 13 routes: successful CRUD, missing resources, wrong ownership, missing/malformed JSON and multipart fields, invalid poses/revisions, unverified Samples, byte-equal NRRD download, candidate order 0, transforms, restore below maximum order, and reload.
5. Keep repository tests for transactions, cascades, candidate deletion preserving the shared Sample volume, import/delete fault injection, and restart.
6. Record baseline defects separately. Update expected public behavior only after D1–D5 are accepted.
7. Run the focused suite with `cd app && npm test -- tests/backendContract/expressContract.test.ts tests/backendContract/routeInventory.test.ts`.
8. Run surrounding checks with `cd app && npm test`, `npm run build`, and `npm run lint`; run the existing Python regression runner because the working tree includes cross-language contracts.

HTTP contract tests own transport-level methods, paths, payloads, statuses, headers, public bodies, and cross-request identity. Repository integration tests own SQL/file invariants and injected faults. Browser smoke tests own the user workflow only.

Exit criteria:

- The route inventory mechanically reports 13.
- The reusable suite passes against Express.
- Every intentional departure from baseline has an accepted requirement and a failing future-FastAPI assertion.
- Shared scenarios import no Express router, Node SQLite, or repository method.
- Teardown closes every server, restores the prior storage-root/fault configuration, and deletes only harness-owned temporary directories.

Rollback:

- This phase changes tests/setup only. Revert harness refactoring while retaining the original Express tests if the shared lifecycle design proves unsuitable.

## Phase B — Port authoritative application storage

Requirements: R3, R5–R13, R15, R17, R21–R24; S3, S5–S8.

Expected files/modules:

- `backend/ai/src/skullfix_ai/application/` (planned): live records and application services.
- `backend/ai/src/skullfix_ai/application/storage.py` (planned): repository protocol and domain errors.
- `backend/ai/src/skullfix_ai/application/sqlite.py` (planned): current seven-table schema and transactions.
- `backend/ai/src/skullfix_ai/application/volumes.py` (planned): contained NRRD reads/writes/cleanup.
- `backend/ai/tests/integration/application/` (planned): Node-created database/file compatibility, restart, fault, and cascade tests.
- `backend/ai/src/skullfix_ai/storage/` (retain): isolated sandbox; do not repurpose.

Dependencies:

- Standard-library `sqlite3`, hashing, JSON, filesystem primitives, and existing Pydantic.
- Disposable storage exported by Node test setup. No ORM.
- Accepted file-delete recovery policy for delete slices.

Order and evidence:

1. Copy a Node-created temporary database and associated volume tree into a second disposable root.
2. Read and serialize the full manifest in Python without writing.
3. Implement Project/Case creates and deletes with existing timestamps/counts.
4. Implement Sample import/read/delete with exact hashes, bytes, spatial JSON, and rollback behavior.
5. Implement Candidate initial revision, transform append/current pointer, restore-existing pointer, and delete cascades.
6. Close/reopen between operations and compare state through public repository methods and the Node reader.
7. Test independent connections and document single-process write expectations. Do not run Node and Python writers against one root.
8. Add schema versioning only if an accepted migration needs a schema change; otherwise leave existing files unchanged.

Transaction ownership:

- One repository/service call owns one SQLite connection/transaction.
- Enable foreign keys for every connection.
- Use explicit write transactions for multi-row changes.
- Keep filesystem work outside SQLite and preserve/restore the last accepted state on pre-commit failure.
- Record post-commit file failures for explicit operator reconciliation; do not claim atomicity.

Exit criteria:

- Python reads and mutates disposable Node-created storage without schema conversion or data loss.
- Node can reopen the resulting copy and observes the same accepted manifest, pointers, hashes, and NRRD bytes.
- Sandbox database protection still passes.

Rollback:

- No live data is used. Drop the new Python application modules and disposable test roots; the Express repository remains authoritative.

## Phase C — Implement FastAPI compatibility routes

Requirements: R1–R9, R14, R16–R17, R21–R25; S1–S4, S8.

Expected files/modules:

- `backend/ai/src/skullfix_ai/api/app.py` (planned): FastAPI application and lifespan.
- `backend/ai/src/skullfix_ai/api/routes/application.py` (planned): 13 thin compatibility routes.
- `backend/ai/src/skullfix_ai/api/errors.py` (planned): accepted status and `{error:string}` mapping.
- `backend/ai/src/skullfix_ai/application/schemas.py` (planned): live camelCase request/response models.
- `backend/ai/src/skullfix_ai/config.py` (planned): explicit application database/root settings.
- `backend/ai/pyproject.toml` (planned edit): minimal reviewed FastAPI server/multipart dependencies.
- Contract lifecycle adapter under `app/tests/backendContract/` (planned): start FastAPI against a temporary root.

Dependencies:

- Proposed after review: FastAPI, an ASGI server, and multipart support. Exact versions are selected during this phase and are not installed by this plan.
- Completed Phase A suite and Phase B repository.

Order and evidence:

1. Add startup/shutdown composition that creates services from one configured application root and releases resources.
2. Add explicit exception handlers before routes so default `422`/framework bodies cannot leak.
3. Port read/list routes, then JSON creates, multipart import/download, candidate lifecycle, and deletes in vertical TDD slices.
4. Parse multipart names and booleans exactly as accepted. Stream/file-send NRRD content with `application/octet-stream` while blocking path escape.
5. Run synchronous SQLite/filesystem work in FastAPI's threadpool boundary or define synchronous route handlers; do not block the event loop from async handlers.
6. Run the identical Phase A suite against FastAPI after each slice.

Exit criteria:

- The reusable suite passes against both backends except documented, accepted defect fixes.
- FastAPI exposes no sandbox command/result or synthetic artifact contract as a live app route.
- No live storage or frontend wiring changes yet.

Rollback:

- Stop the FastAPI test process. Express remains the UI backend and sole live writer.

## Phase D — Cut over the frontend

Requirements: R2, R12–R20, R26–R31, R33–R34; S2, S7, S9–S11, S13–S14, S16.

Expected files:

- `app/vite.config.ts` (planned edit): development-only proxy from unchanged `/api` URLs to the separate FastAPI process.
- `app/vite-api-plugin.ts` (planned removal after parity): stop mounting Express.
- `app/src/api/client.ts` (minimal planned changes only if origin/config requires them).
- FastAPI static/SPA composition (planned): serve the built frontend after registering `/api`.
- Development and production-style scripts/documentation (planned): separate Vite/FastAPI development; one FastAPI built-frontend launch.
- Browser smoke coverage (planned): static assets, client-route refresh, project → case → upload → candidate → transform → restore older revision → reload, NRRD retrieval, API errors, restart, and Express-free operation.

Dependencies:

- Phases A–C complete.
- Agreed FastAPI development and production-style commands, origin, port, build-output path, and readiness check.
- Successful S13 handoff/rollback rehearsal on disposable storage.
- Backup and conditional live rollback procedures reviewed after the disposable rehearsal.

Order and evidence:

1. Run Vite and FastAPI as separate development processes on a disposable FastAPI root. Configure Vite's `/api` proxy without changing frontend endpoint paths.
2. Run Express parity against a different disposable root. Never point both backends at one parity root.
3. Build the frontend. Configure one FastAPI application to register `/api` first, serve built static assets from the build output, and apply `index.html` fallback only to non-API client routes.
4. Treat `vite preview` as frontend-only and direct integrated built-frontend checks to the FastAPI production-style launch.
5. Verify process readiness with the documented startup check before browser use; stop FastAPI cleanly so SQLite/filesystem work is not left active.
6. Run the dual-backend contract suite, app tests, build, and both development and built-frontend smoke checks against disposable roots.
7. Before touching live storage, run S13 on one disposable database and its matching disposable volume tree:
   1. Start Express alone and create baseline data.
   2. Stop Express, then start FastAPI alone on that same current disposable dataset.
   3. Through FastAPI, create a project, upload, candidate, and appended revision.
   4. Stop FastAPI, then start the verified Express runtime alone on the same current disposable dataset.
   5. Verify both eras' records, relationships, current pointers, hashes, and NRRD bytes; then complete another normal Express write.
   6. Stop Express, return the same disposable dataset to FastAPI alone, and verify FastAPI can read and continue writing all preserved data.
8. Record successful S13 evidence as a prerequisite for live cutover. Do not reuse either parity root, and never run S13 against live storage.
9. Begin the successful live path: stop the live Express writer and all clients. Copy `app-model.sqlite` and `volumes/` from one quiesced point to a timestamped backup; verify database readability, expected files/hashes, and restoreability.
10. Start FastAPI as the sole live writer. Verify application readiness, built-frontend/API behavior, normal reads/writes, restart persistence, and data/file consistency. Leave FastAPI running.

Exit criteria:

- The UI client requires no public-contract rewrite.
- Only FastAPI writes live data.
- Browser smoke and restart preserve current pointer, history, bytes, and relationships.
- Built frontend routes and assets work; unknown `/api` paths retain API errors and are never swallowed by SPA fallback.
- S13 succeeds on disposable storage before live cutover and proves sequential bidirectional handoff without simultaneous writers.
- The successful live path ends with FastAPI as the sole application backend and live writer.
- Pre-write snapshot rollback and post-write code/runtime rollback remain separate conditional procedures.

Conditional live rollback:

Use this section only if cutover fails or rollback is required. It is not part of the successful live path.

Before FastAPI acknowledges a live write:

1. Stop FastAPI and all clients.
2. Verify no post-backup write was acknowledged.
3. Restore the paired database and volume snapshot together.
4. Start Express as the only writer and verify reads before reopening writes.

After FastAPI acknowledges a live write:

1. Stop FastAPI and all clients; preserve the current database/volume root and the pre-cutover backup.
2. Start the already-verified Express code/runtime as the only writer against the current compatible data. Do not restore the pre-cutover snapshot by default.
3. Verify pre-cutover and post-cutover records, relationships, pointers, hashes, NRRD bytes, and a new write.
4. If compatibility or integrity is uncertain, keep writes stopped and reconcile explicitly. A backup alone is not reconciliation.
5. Treat any recovery that discards acknowledged writes as destructive and require separate approval.

## Phase E — Remove Express and update documentation

Requirements: R20, R26–R31, R33–R34; S11, S13–S16.

Expected files:

- `app/server/api.ts`, `app/server/storageSqlite.ts`, and `app/vite-api-plugin.ts` (planned removal).
- `app/package.json` and lockfile (planned reviewed edit): remove Express, Multer, and obsolete type/test dependencies.
- Node-specific test lifecycle code (planned removal); retain backend-neutral assertions.
- `AGENTS.md`, `docs/project.md`, `docs/ai/`, feature docs, setup, and work summary (planned verified-state updates).

Dependencies:

- Successful disposable S13 rehearsal, successful FastAPI live cutover/observation window, reviewed conditional rollback procedures, and an agreed Express rollback-support retention window.

Order and evidence:

1. Remove Express/Multer runtime and Vite middleware wiring.
2. Remove only Node repository tests replaced by equal or stronger backend-independent/Python coverage.
3. Run contract, Python repository/API, frontend, build, browser smoke, feature-doc, lint, and whitespace checks.
4. Start the application in a clean environment without Express or Multer installed.

Exit criteria:

- Runtime startup and the complete smoke flow succeed without Express/Multer.
- `npm` dependency inspection shows they are not runtime requirements.
- The production-style local launch has one FastAPI backend serving `/api` and the built frontend.
- Historical Express behavior remains documented; current docs describe FastAPI only after verification.

Conditional rollback after removal:

- Restore the last verified Express-capable code/runtime against the current compatible data, with Express as the sole writer. Apply the S13-proven handoff procedure and verify equivalent preservation/continued-write checks without treating live rollback as another rehearsal.
- If current data is incompatible or suspected corrupt, stop writes and preserve current data plus the paired backup for explicit reconciliation. Do not automatically replace current data with the pre-cutover snapshot.
- Any destructive recovery that loses acknowledged data requires a separate decision. The backup remains evidence and a recovery input, not automatic reconciliation.

## Phase F — Follow-up AI integration

Requirements: R21–R25, R27, R32; S8, S12, S15. This phase is outside the migration.

- Adapt future direct UI and AI mutations to the same authoritative FastAPI application services; do not create a second AI HTTP application backend.
- Define explicit translation from live Sample/Candidate/restore semantics before reusing sandbox operation concepts.
- Keep `AppWorkspaceAdapter` read-only until a live mutation contract is accepted.
- Keep LangGraph, checkpoint storage, Bedrock, SSE, pre-model retry/recovery, and generated-NRRD publication deferred.
- Keep reconstruction injected and labeled mock; synthetic JSON is not a real NRRD reconstruction.

Exit criteria:

- None for this migration. A separate accepted intent/spec/preflight/plan is required before implementation.

Rollback:

- Not applicable. No Phase F implementation is authorized here.

## Risks

- FastAPI defaults differ from Express for validation, multipart parsing, and errors. Lock accepted behavior in Phase A and use explicit handlers.
- The riskiest step is live cutover because database and files form one durable unit but are not transactionally atomic. Quiesce writers and back up both together.
- Restoring the pre-cutover snapshot after acknowledged FastAPI writes would lose user data. Separate snapshot rollback from code/runtime rollback and prove Express can continue on current FastAPI-produced data.
- Running S13 on live storage would turn a rehearsal into a real rollback. Complete the Express → FastAPI → Express → FastAPI sequence only on one disposable dataset before live cutover.
- Running two writers can corrupt revision ordering and cleanup assumptions. Never share a parity root.
- A broad SPA fallback can hide API 404s. Register `/api` before static/fallback handling and exclude every `/api` path from the fallback.
- Vite preview has no current API integration. Treat it as frontend-only and use FastAPI for the supported built-frontend launch.
- Reusing sandbox storage would change the domain model. Build a separate live application repository and keep the guard.
- Contract snapshots can hide relationship drift. Normalize only generated values and assert the identity graph explicitly.

## Proof

Phase A verified commands (2026-11-14):

```sh
cd app && npm test -- tests/backendContract/expressContract.test.ts
# → 1 file, 16 passed

cd app && npm test -- tests/backendContract/expressContract.test.ts tests/backendApi.test.ts tests/backendCrud.test.ts
# → 3 files, 26 passed

cd app && npm test
# → 18 files, 55 passed

PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
# → 64 tests OK (unchanged by Phase A)

cd app && npm run build && npm run lint
python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py .
git diff --check
```

Phase A evidence mapped to requirements (Express only; FastAPI adapter not created):

- R1: `coverage.ts` inventories 13 method/path pairs; scenarios exercise each route.
- R2: ProjectManifest key set, nested identity graph, omitted optional fields.
- R3: ownership links and wrong-owner sample import asserted over HTTP; repository ownership tests retained.
- R4: multipart file/meta/displayName/spatiallyVerified encoding and malformed fields.
- R5: NRRD byte equality, `application/octet-stream`, raw lowercase SHA-256.
- R6: nested spatial metadata and flat 16-element poses; invalid-element baseline labeled separately.
- R7: initial candidate returns `candidateId` + `revisionId`; order 0; shared volume/hash; identity pose.
- R8: transform appends revision and updates current pointer.
- R9: restore older revision without appending; transform after restore uses next order.
- R10: candidate/sample/case/project deletes and public cascades; missing-delete and cross-project baselines labeled.
- R11: planned Phase B Node-created seven-table database/file compatibility tests.
- R12: Phase A Express restart persistence over disposable root; FastAPI cutover persistence planned later.
- R13: Phase A temporary-root lifecycle; live-path exclusion retained for later phases.
- R14: shared scenarios accept only base URL/lifecycle; verified against Express lifecycle only (FastAPI adapter later).
- R15: repository CRUD/fault tests retained; Express HTTP fault characterization in `backendApi.test.ts`.
- R16: missing/malformed JSON, oversized body, invalid types, multipart failures characterized.
- R17: planned Phase C route-to-service composition tests without direct SQL.
- R18: planned Phase D Vite proxy integration and single-writer checks.
- R19: Phase D disposable rehearsal verified; live paired backup remains gated.
- R20: Phase E removal and Express-free clean-install checks remain gated.
- R21: responses assert current shapes without new idempotency/revision fields.
- R22: planned distinct application/sandbox/checkpoint configuration tests.
- R23: existing sandbox database-protection regressions retained.
- R24: planned live-schema serialization checks and sandbox-schema exclusion.
- R25: sandbox/mock boundary regressions and documentation trace retained.
- R26: planned clean runtime start and browser smoke without Express/Multer.
- R27: planned architecture/startup inspection showing one FastAPI application backend.
- R28: planned built-frontend static, SPA fallback, API precedence, readiness, and shutdown smoke.
- R29: planned preview documentation check plus production-style launch evidence.
- R30: planned disposable Express → FastAPI → Express → FastAPI handoff/rollback rehearsal (S13).
- R31: planned reconciliation/destructive-recovery guard scenarios and operator procedure review.
- R32: planned architecture trace showing future AI uses the same FastAPI service boundary.
- R33: planned successful live-cutover scenario ending with FastAPI running as sole writer.
- R34: planned conditional pre-write/post-write rollback procedure checks.

Not yet executed as FastAPI evidence: R11 FastAPI storage port; R14 dual-backend; R17–R20; R22–R34; S13.

## Deviations

None for Phase A scope. D1–D5 remain proposed; baseline characterization asserts current Express behavior without amending the public contract.

## Coordinated queue implementation record

Phase B repository, Phase C FastAPI and Phase D routing/disposable rehearsal are implemented and verified. Task7/8 fake-model graph implementation is recorded in the separate AI scoped plan; it does not wait for the observation window. Live Phase D step and Phase E removal remain blocked. No whole-draft acceptance is inferred. Actual final evidence and per-task status are in execution-evidence.md and task-board.md.

Additional files serving the existing proof: app/tests/applicationCompatibility.test.ts, app/tests/backendContract/fastapiLifecycle.ts, fastapiContract.test.ts, routeInventory.test.ts and handoff.test.ts; app/e2e/migration.e2e.ts; app/playwright.config.ts; opt-in app/vite.config.ts; pinned Playwright and Python dependencies; local Python environment/egg-info ignore rules; backend runner extensions; docs/history/current setup and task records. All changes map to the nine-task queue; no live schema conversion, provider, SSE, checkpoint, live AI mutation, commit or push was added.

## Approved live-cutover continuation

Owner approved T05 live root discovery/backup/cutover and T06 removal after a full30-minute observation, with7day recovery retention and no commit/push. Preflight: preflights/task-05-live-cutover.md. Discovery selected canonical data/storage after no old application DB, env override or running application process was found. Verified empty baseline backup is explicitly recorded as a fresh installation. Live user-facing workflow and restart passed. Periodic monitoring starts09:10:05 America/New_York and will run at least1800seconds through09:40:05; no removal before the actual gate.

Coordinator changes: backend/ai/scripts/application_snapshot.py and two WAL/hash/restore tests; app/scripts/cutover-smoke.mjs (explicit origin/project/evidence required); data/storage ignore rule; taskboard/runbook/current docs. Removal candidate is prepared in an isolated staging checkout with a checksum/preimage apply manifest; it deletes only named old backend/Express-test files after independent clean-install verification. Legacy runtime and tests remain in the7day recovery archive outside the repo. Current replacement coverage includes shared FastAPI16, frozen Node-produced data, Python repository/graph and HTTPfault cases, and actual browser3. Final exact counts/evidence will be recorded after actual application and checks.

## Final close

Owner approved concrete cutover and removal; actual full30-minute monitor passed before removal. Final application has no Express/Multer dependency, default dev proxies to FastAPI and built app is served by the sole persistent FastAPI writer. Current105 Python/45 app/3 real browser checks, clean install, build/type/lint and document/whitespace checks passed. New empty baseline rather than old-data migration is explicitly recorded. Backup/rollback runtime retained7days; no commit/push. See cutover-completion.md for exact times/paths and execution-evidence.md for earlier staged proof.
