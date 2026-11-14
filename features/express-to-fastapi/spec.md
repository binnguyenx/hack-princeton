# Spec: Express-to-FastAPI application backend migration

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-14

## Summary

FastAPI replaces Express as the live application backend without changing the accepted UI-facing API or durable application model. The migration retains the existing SQLite schema and NRRD layout, proves compatibility against both backends before cutover, and keeps the isolated Python AI sandbox and future LangGraph checkpoints separate.

This specification records current source behavior, accepted migration requirements, proposed compatibility decisions, and deferred capabilities. The historical Express baseline was characterized; FastAPI live cutover and removal are now complete under scoped approval.

The owner authorized Phase A Express characterization tests on 2026-11-14. That authorization does not accept the entire draft migration, D1–D5, or implementation of Phases B–F.

## Requirements

- R1. FastAPI must expose all 13 currently implemented routes under the same `/api` paths and HTTP methods listed in the route inventory.
- R2. Successful responses must preserve current status codes, camelCase JSON keys, nested ProjectManifest structure, identifier values and relationships, nullability, omitted optional fields, and empty-array behavior.
- R3. The authoritative ownership chain must remain User → Project → Case → Sample → Candidate → CandidateRevision. Source anatomy belongs to a Sample. A Candidate and every CandidateRevision belong to that Sample through the existing relationships.
- R4. Sample import must accept multipart fields named `file`, `displayName`, `spatiallyVerified`, and `meta`. `file` contains raw bytes; `meta` is JSON text; only the exact string `true` currently maps to true; an absent or empty `displayName` falls back to the uploaded filename. Current Express JSON bodies are limited to 10 MB, while Multer keeps uploads in memory and declares no explicit file-size limit; any FastAPI limit change requires an explicit compatibility decision.
- R5. Sample download must return the stored NRRD bytes unchanged with `application/octet-stream`. Volume hashes must remain lowercase raw SHA-256 hex strings without a `sha256:` prefix.
- R6. Source spatial metadata must preserve `units`, optional `space`, `sizes`, `spacings`, and `bboxMm` without translating it to the sandbox spatial schema. Candidate poses must remain flat 16-element arrays in the current row-major application ordering and interpretation.
- R7. Candidate creation must require a spatially verified Sample, create a Candidate and order-0 CandidateRevision in one SQLite transaction, reference the Sample's existing volume/hash, use the identity pose, and return both `candidateId` and `revisionId`.
- R8. Transform must append a CandidateRevision using the current revision's volume/hash, assign the next order, persist the submitted flat pose, and atomically advance only that Candidate's `currentRevisionId`.
- R9. Restore must validate that the revision belongs to the Candidate, then move `currentRevisionId` to that existing revision without adding a revision. Restoring below the maximum order is valid, and a later transform appends after the maximum existing order.
- R10. The migration must preserve accepted deletion, cascade, transaction, rollback, and file-cleanup outcomes. Known defects or framework accidents in those areas must be classified and resolved explicitly before their FastAPI slice; they must not be silently copied or silently changed.
- R11. FastAPI application storage must open and preserve the existing seven-table SQLite schema and `volumes/<volumeId>.nrrd` layout under `HACK_STORAGE_ROOT`, whose default is `data/storage`; the database filename remains `app-model.sqlite`.
- R12. Existing identifiers, timestamps, case counts, relationships, revision pointers, raw hashes, JSON metadata, pose arrays, volume rows, and NRRD files must survive process restart and backend cutover.
- R13. Compatibility and migration tests must use temporary roots and disposable database/file copies produced by the Node implementation. They must never mutate the user's live database or volume files.
- R14. A reusable backend-neutral HTTP contract suite must run against Express before implementation and against FastAPI later. Backend startup/storage setup must be separate from API assertions, and generated IDs/timestamps may be normalized only while preserving identity links, order, hashes, poses, and metadata.
- R15. Repository integration tests must separately prove SQLite/file transactions, cascades, shared volume survival, rollback, restart persistence, and compatibility with Node-created storage. Browser smoke tests must cover the user workflow but must not replace HTTP or repository tests.
- R16. FastAPI validation and exception handling must map to the accepted public status/body contract instead of exposing default `422` validation responses, Python tracebacks, local paths, or framework-specific details.
- R17. FastAPI routes must be thin. Application services/repositories own membership, persistence, revision, and file behavior; route functions own transport parsing and public error mapping.
- R18. Development must run Vite and FastAPI as separate processes, with Vite proxying unchanged `/api` URLs to FastAPI. Express and FastAPI parity runs must use separate disposable database/volume roots. The S13 handoff/rollback rehearsal instead uses sequential ownership of one disposable database/volume copy, with exactly one backend writing it at a time. Neither mode may use live storage.
- R19. Before FastAPI accepts live writes, cutover must stop the current writer, create and verify a consistent paired backup of `app-model.sqlite` and the complete `volumes/` directory, then start FastAPI as the sole writer. That snapshot supports rollback only while no later write has been acknowledged.
- R20. Express, Multer, Vite middleware wiring, and Node-specific test setup may be removed only after contract, Node-created-data, restart, browser-smoke, backup, and rollback evidence passes against FastAPI.
- R21. Migration parity must not add `expectedRevisionId`, `requestId`, idempotency, recovery, parent revisions, or different restore semantics. Each requires a separately accepted contract change.
- R22. The authoritative live application repository/database must remain distinct from `SQLiteApplicationStorage`, the sandbox operation service, and synthetic artifact root. Future LangGraph checkpoint storage must use a third, separate database.
- R23. The sandbox initializer must continue rejecting the live `app-model.sqlite` path and databases that contain the live project/sample/volume schema. Migration work must not weaken or bypass that protection.
- R24. Reusable Python pieces are limited to compatible primitives and adapters. Live Pydantic models must represent the actual ProjectManifest and API contracts; sandbox cases, immutable revisions, run ownership, synthetic JSON artifacts, and result envelopes must not become live records by implication.
- R25. The reconstruction mock remains replaceable and sandbox-only until a generated-NRRD publication contract is accepted. It must not be exposed as real geometry or used to populate the live viewport.
- R26. Express runtime removal is complete only when the app starts, serves the browser workflow, and passes acceptance checks without importing or installing Express or Multer at runtime.
- R27. The completed application must have one application backend: FastAPI/Python. React/TypeScript/Three.js remain the frontend, Vite remains frontend build/development tooling, and the isolated AI sandbox or future checkpoint stores must not be presented as additional live application backends.
- R28. A production-style local launch must use the FastAPI application to serve the built frontend and the same `/api` routes. API routes must be registered before the SPA fallback; unknown `/api` paths must remain API errors, while non-API client routes may fall back to the built `index.html`. Static asset paths, startup readiness, and shutdown must be documented and verified.
- R29. `vite preview` is frontend-only unless an explicit API-routing mechanism is later implemented and tested. The supported integrated built-frontend check must use the production-style FastAPI launch, not the current development middleware or an assumed preview proxy.
- R30. Before live cutover, a disposable handoff/rollback rehearsal must prove that Express can create baseline data, FastAPI can continue on that same copied dataset, Express can then read and continue writing all FastAPI-produced data, and FastAPI can resume on the same preserved dataset. The backends must be stopped between handoffs and must never write concurrently.
- R31. If current live data is incompatible or suspected corrupt, rollback must stop writes and preserve both current data and the pre-cutover backup for explicit reconciliation. A backup is not reconciliation. Any option that discards acknowledged writes is destructive and requires separate approval.
- R32. Future live AI integration must use the same FastAPI application-service boundary as direct UI actions. A separate AI HTTP application backend is out of scope unless separately requested; separate sandbox and LangGraph checkpoint stores do not create additional live application backends.
- R33. The successful live migration path must stop Express, create and verify the paired backup, start FastAPI as the sole live writer, verify readiness and normal operation, and finish with FastAPI running. Returning live ownership to Express is a separate conditional rollback action, not part of successful cutover.
- R34. If live rollback is conditionally triggered after FastAPI acknowledges writes, it must stop writes and prefer the S13-verified Express code/runtime over the current compatible data. Before acknowledged writes, the paired snapshot may be restored. If compatibility or integrity is uncertain, preserve current data and backup for explicit reconciliation; discarding acknowledged data remains destructive and separately approved.

## Current route inventory

Source inspection found 13 routes in `app/server/api.ts`; `app/vite-api-plugin.ts` mounts them below `/api`.

| # | Method and path | Request | Success | Observable errors |
|---|---|---|---|---|
| 1 | `GET /api/projects` | No body | `200`, array of `{id,name,updatedAt,caseCount}` ordered by newest `updatedAt` | Storage failures use `{error:string}` and source-derived status mapping |
| 2 | `POST /api/projects` | JSON `{name?:string}` | `201`, `{projectId}` | Empty/missing name reaches `"Project name is required"` → `400`; absent/non-object body can currently become `500` |
| 3 | `GET /api/projects/:id` | Path id | `200`, ProjectManifest | Missing project → `404`, `{error:"Project <id> not found"}` |
| 4 | `DELETE /api/projects/:id` | Path id | `204`, empty body | Current missing id is also `204`; database failures use mapped JSON error |
| 5 | `POST /api/projects/:id/cases` | JSON `{name?:string}` | `201`, `{caseId}` | Missing project → `404`; empty/missing name → `400`; absent/non-object body can currently become `500` |
| 6 | `DELETE /api/projects/:id/cases/:caseId` | Path ids | `204`, empty body | Missing project → `404`; a missing case in an existing project currently returns `204`; mismatched ownership has defective repository behavior described below |
| 7 | `POST /api/projects/:id/cases/:caseId/samples` | Multipart `file`, `displayName`, `spatiallyVerified`, `meta` | `201`, `{sampleId,spatiallyVerified}` | Missing file → `400`; missing case/project → `404`; malformed `meta` currently becomes `500`; file/transaction failures become `500` |
| 8 | `GET /api/samples/:id/volume` | Path id | `200`, exact bytes, `application/octet-stream` | Missing Sample or missing file → `404` JSON |
| 9 | `DELETE /api/samples/:id` | Path id | `204`, empty body | Missing Sample → `404`; parked-file/database failure → `500` |
| 10 | `POST /api/samples/:id/candidates` | Body ignored | `201`, `{candidateId,revisionId}` | Missing Sample → `404`; unverified Sample → `409` |
| 11 | `POST /api/candidates/:id/transform` | JSON `{pose:number[16]}` by declared contract | `201`, `{revisionId}` | Non-array or length other than 16 → `400`; missing Candidate/current revision → `404`; element types/finiteness are not currently checked |
| 12 | `POST /api/candidates/:id/restore` | JSON `{revisionId:string}` | `200`, `{ok:true}` | Missing field → `400`; missing/cross-candidate revision → `404` |
| 13 | `DELETE /api/candidates/:id` | Path id | `204`, empty body | Missing Candidate → `404` |

Application errors caught by the router return `{error: message}`. `ENOENT` or text matching `not found` maps to `404`, `required` maps to `400`, `verified` maps to `409`, and other caught errors map to `500`. Malformed JSON is handled before the router by Express and currently produces a framework response rather than the router's JSON envelope.

The router is mounted by Vite's `configureServer` development hook. Source contains no standalone Express production server and no equivalent API mount in the Vite preview lifecycle.

## Current data and storage behavior

- Tables are `users`, `projects`, `cases`, `volume_assets`, `samples`, `candidates`, and `candidate_revisions`: seven tables including the seeded user table. There is no schema-version pragma or migration framework.
- Every repository call opens a `node:sqlite` synchronous connection, enables foreign keys, creates missing tables, seeds `local-dev`, runs the operation, and closes the connection.
- Project/case/sample/candidate/revision JSON is assembled into `formatVersion: 1` ProjectManifest with `user`, `project`, `cases`, `samples`, `candidates`, `revisions`, `viewState`, `openDocuments`, and `activeDocumentId`. User/project/case fields preserve `displayName`, `ownerUserId`, and `projectId`. Samples contain nested `sourceAnatomy`; Candidates use `objectId`, `sampleId`, and `currentRevisionId`; revisions use `id`, `candidateId`, `order`, `volumeId`, `pose`, and `volumeHash`.
- Nullable database display names are omitted in manifest JSON rather than emitted as `null`. The HTTP repository currently returns default empty `openDocuments`, `activeDocumentId: null`, and a default `viewState`; those workspace fields are not stored in the seven tables.
- Import writes a UUID-named NRRD before starting the database transaction. Any later failure removes that new file. Successful rows and metadata commit together.
- `volume_assets.rel_path` records `volumes/<volumeId>.nrrd`, but current reads reconstruct that path from `volumeId` instead of consulting the column.
- Candidate and transform writes use `BEGIN IMMEDIATE`. Restore is one SQL update after membership validation.
- Candidate revisions share the Sample volume asset. Deleting a Candidate cascades its revisions but keeps the Sample and volume. Deleting the Sample cascades Candidates/Revisions and deletes its volume row/file.
- Sample deletion parks the NRRD as `.pending-delete`, commits row deletion, then unlinks the parked file; an error attempts to rename it back.
- Case/project deletion commits database cascades and volume-row deletion before best-effort file removal. File-removal errors are swallowed and can leave unreferenced files.
- Data persists because the database and NRRD files remain under the configured root across process restarts.

## Existing defects and accidental behavior

These facts are not automatically accepted compatibility requirements:

- A 16-element pose is accepted without checking that every element is a finite number.
- Missing multipart `meta` becomes `{}` and is stored; malformed JSON maps to `500`.
- `spatiallyVerified` is true only for exact text `true`; other spellings silently become false.
- Missing request bodies can produce `500`, and malformed JSON can produce Express's framework-specific non-JSON error.
- Deleting a missing Project or a missing Case in an existing Project returns `204`, while missing Sample/Candidate returns `404`.
- Case deletion reads volume ids by `caseId` before confirming project ownership. A case id from another project can trigger a foreign-key failure instead of a clean ownership `404`.
- Case/project database deletion succeeds before best-effort volume cleanup, so filesystem failure can leave orphan files.
- Sample unlink failure can be reported after the database commit and attempted file restoration, leaving an orphaned NRRD.
- Transform order uses `COUNT(*)` without a uniqueness constraint or expected-current-revision check; concurrent writers are not an accepted idempotency or compare-and-swap contract.
- `current_revision_id` has no database foreign key. Application code maintains it.

## Success criteria

- S1. A route-inventory check finds exactly the 13 method/path pairs above, and the reusable HTTP suite exercises each against Express before any backend replacement. Verifies R1, R14.
- S2. Given a complete CRUD workflow, normalized Express and FastAPI responses retain the same identity graph, manifest keys, optional-field behavior, statuses, revision order, current pointer, raw hash, pose, and spatial metadata. Verifies R2–R9, R16.
- S3. Given valid multipart input with arbitrary NRRD bytes, import followed by download returns byte-for-byte equality and the recorded lowercase raw SHA-256. Verifies R4–R6.
- S4. Given missing resources, wrong ownership, malformed JSON/multipart fields, invalid pose/revision input, and unverified spatial state, the accepted status and error envelope are identical across backends. Any intentional defect fix is isolated behind an accepted contract amendment. Verifies R10, R16, R21.
- S5. Given a restored revision below maximum order, reload preserves that current pointer and the next transform appends at the next maximum order without changing older revisions. Verifies R8–R9.
- S6. Given candidate, sample, case, and project deletions, database cascades and surviving shared Sample volumes match accepted behavior; injected file/database faults leave the documented prior or recoverable state. Verifies R10, R15.
- S7. A disposable copy of a Node-created database and volume root opens in Python, round-trips reads and writes, survives restart, and remains readable with all relationships and bytes intact. Verifies R11–R13.
- S8. Attempts to initialize sandbox storage against the live database path or a copied live schema remain rejected without writing schema or metadata. Verifies R22–R23.
- S9. With Vite proxying unchanged `/api` URLs to a separate FastAPI process, browser smoke completes project creation → case → upload → candidate → transform → restore older revision → reload. Express and FastAPI use separate disposable roots. Verifies R17–R18.
- S10. Before FastAPI accepts writes, all writers stop, a paired database/volume backup is created and verified, FastAPI starts as the only writer, and the original snapshot remains an eligible rollback only until the first acknowledged FastAPI write. Verifies R18–R19.
- S11. After removal, the application runtime and production/development launch do not require Express or Multer, while backend-independent acceptance coverage remains. Verifies R20, R26.
- S12. No migration result or documentation claims LangGraph, Bedrock, SSE, live AI mutation, recovery, or real reconstruction. Verifies R21–R25.
- S13. Given one disposable database and matching volume tree, create baseline data with Express; stop Express; start FastAPI on that same dataset; create a project, upload, candidate, and appended revision; stop FastAPI; start the verified Express runtime on the same current dataset; verify both eras' records, relationships, current pointers, hashes, and NRRD bytes; complete another Express write; stop Express; return the dataset to FastAPI; and verify FastAPI can read and continue writing all preserved data. Exactly one backend writes the rehearsal dataset at a time. Verifies R13, R18, R30.
- S14. Using the built frontend through the production-style FastAPI launch, smoke verifies the initial page/static assets, client-route refresh where applicable, the complete project workflow, binary NRRD retrieval, API error envelopes, restart persistence, and operation without Express or Multer installed. Unknown `/api` paths are not swallowed by the SPA fallback. Verifies R26–R29.
- S15. Architecture inspection shows one live FastAPI application backend. Vite is frontend tooling, Express is absent after acceptance, sandbox storage remains isolated, and future AI integration targets the same application-service boundary. Verifies R22–R27, R32.
- S16. The successful live cutover stops Express, verifies the paired backup, starts FastAPI as the sole writer, passes readiness and normal-operation checks, and ends with FastAPI still running. Express starts on live data only if a separately triggered rollback condition occurs and follows the pre-write or post-write rule. Verifies R19, R31, R33–R34.

## Design

The compatibility seam is HTTP plus durable storage, not Express internals. Phase A captures responses and side effects with backend-neutral assertions and separate launch adapters. Repository tests cover state that is impractical or unsafe to infer only through HTTP.

The Python application repository will target the current tables and files directly. Pydantic aliases preserve camelCase public JSON while internal Python names may use snake_case. FastAPI exception handlers must override default `422` details wherever the accepted contract requires the current status and `{error:string}` shape.

The live repository is a new application boundary. `AppWorkspaceAdapter` and workspace Pydantic models can inform manifest compatibility, but the sandbox `SQLiteApplicationStorage`, operation runs, immutable-child model, synthetic artifact references, and reconstruction result envelope cannot replace the live model. Future AI code must adapt to the live application service after migration.

The minimal production-style local topology is one FastAPI process serving the built frontend and `/api`. Static files come from the frontend build output. The application registers API routes before a final non-API SPA fallback. Development keeps a separate Vite process only for frontend tooling and proxying. `vite preview` is not an integrated application launch in this migration.

## Proposed compatibility decisions

These decisions require review before the affected implementation slice:

- D1. Proposed: normalize malformed JSON, missing bodies, malformed `meta`, and invalid pose elements to JSON `400` errors instead of preserving Express HTML or accidental `500` responses. Why: those are framework/validation defects, not useful UI contracts. Phase A must first record the baseline and the approved delta.
- D2. Proposed: preserve exact `true`/false multipart encoding for parity in this migration; stricter accepted spellings can be a later contract change. Why: the current client emits exact lowercase strings.
- D3. Proposed: preserve current missing-delete statuses initially (`204` for Project/Case, `404` for Sample/Candidate) unless product owners choose a consistent policy before Phase C.
- D4. Proposed: fix cross-project Case deletion to return `404` without mutation. Why: the current foreign-key failure is an ownership defect, not an intentional contract.
- D5. Proposed: preserve database outcomes but make post-commit file-cleanup failures explicit and recoverable rather than reproducing silent orphaning. Why: data safety outweighs accidental best-effort behavior; the exact reconciliation policy remains open.
- D6. Retain the schema and layout unchanged for the first cutover. Add a schema version only if compatibility tests show a concrete need. Why: minimizing data conversion reduces migration risk.
- D7. Serve the built frontend from FastAPI for the production-style local launch. Why: this keeps one application backend and avoids adding a reverse proxy without a concrete need.
- D8. Use two rollback stages. Before acknowledged FastAPI writes, the verified paired snapshot may be restored; afterward, prefer code/runtime rollback over current compatible data. Why: restoring the old snapshot after new writes would silently lose acknowledged work.

## Where it lives

- Migration records: `features/express-to-fastapi/`
- Live routes and repository: `backend/ai/src/skullfix_ai/api/routes/application.py`, `backend/ai/src/skullfix_ai/application/sqlite.py`
- Frontend integration: `app/src/api/client.ts`, `app/src/domain/types.ts`, `app/src/io/projectPackage.ts`, `app/vite.config.ts`
- Phase A HTTP contracts: `app/tests/backendContract/`
- `app/tests/backendContract/scenarios.ts`
- `app/tests/backendContract/fixtures.ts`
- `app/tests/backendContract/types.ts`
- `app/tests/backendContract/coverage.ts`
- `app/tests/backendContract/fastapiLifecycle.ts`
- `app/tests/backendContract/fastapiContract.test.ts`
- HTTP fault characterization: `backend/ai/tests/integration/api/test_storage_faults.py`; historical Express source/tests are retained outside the active repo.
- Repository integration tests: `backend/ai/tests/integration/application/test_repository.py`
- Ownership/revision/failure suites: `app/tests/`
- Python sandbox and workspace adapter: `backend/ai/src/skullfix_ai/`
- AI integration boundaries: `docs/ai/architecture.md`
- `docs/ai/app-integration.md`
- Project and setup guidance: `docs/project.md`
- `docs/ai/setup.md`
- `AGENTS.md`

## Flagged concerns

- The live table count is seven, not six, when the seeded `users` table is included.
- The frontend's `createCandidate` type omits the server's returned `revisionId`, and `transformCandidate` discards its returned `revisionId`; migration must preserve both server responses even though current callers ignore part of them.
- The current Vite plugin mounts Express only for the development server. `vite preview` does not have an equivalent explicit API plugin lifecycle guarantee in source.
- Existing UI operation tests also exercise an in-memory/project-package path. They are valuable mechanical regressions but are not proof of HTTP backend parity.
- Existing working-tree changes predate this migration plan. Later implementation must isolate its diff and must not overwrite them.

## Open questions

1. Accept, revise, or reject D1–D5 before Phase C handlers (or any accepted contract amendment). Phase A recorded Express baselines without resolving them.
2. Choose the FastAPI development-process command, port, health check, and supervision approach.
3. Decide whether an explicit application schema version is required before cutover.
4. Define the exact recovery record or operator procedure for a database commit followed by failed file deletion.
5. Confirm whether API error messages must match exact text or only stable status plus `{error:string}` for each scenario.
6. Choose the exact FastAPI development/production commands, port, build-output path, and readiness probe during implementation.
7. Set the Express rollback-support retention window before Phase E removes its runtime dependencies.

## Out of scope

This migration does not add AI request/result contracts to the UI API, expected-revision checks, request identity, retry recovery, SSE, LangGraph, Bedrock, checkpoint storage, real reconstruction, generated NRRD publication, measurement, editing, inspection, comparison, contour guidance, authentication, cloud storage, or an ORM.

## Queue implementation evidence (not whole-document acceptance)

The owner authorized the nine-task queue. Current-baseline Python application repository and FastAPI transport, disposable cross-runtime/S13/browser verification and genuine fake-model LangGraph are implemented. Live cutover and active-app Express removal completed after approved1800second observation. D1–D5 hardening and proposed recovery are not inferred accepted. Live authority is now the FastAPI application on the explicitly recorded root. See features/express-to-fastapi/task-board.md and docs/ai/work-summary.md.

Implemented locations: backend/ai/src/skullfix_ai/application/, backend/ai/src/skullfix_ai/api/, backend/ai/src/skullfix_ai/agent/, backend/ai/src/skullfix_ai/tools/, backend/ai/tests/integration/application/, backend/ai/tests/integration/api/, backend/ai/tests/integration/agent/, app/tests/backendContract/ and app/e2e/migration.e2e.ts. No geometry/model/live-mutation capability is implied.
