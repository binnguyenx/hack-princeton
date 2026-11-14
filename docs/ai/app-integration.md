# App integration contract and readiness

The shipped UI/backend is the live source of truth. This document records the correction after pulling main and is the app-facing contract; standalone Python mock schemas and storage remain a separate test environment.

## Completed Express-to-FastAPI migration

The current application has one FastAPI/Python backend. Thirteen UI routes retain the characterized Express contract. Shared16 scenarios passed on both backends before removal and currently run against FastAPI. The historical Node→Python→Node and S13 Express→FastAPI→Express→FastAPI proofs remain in the separate recovery runtime; checksum-locked synthetic Node fixtures keep compatibility executable without Express.

The owner approved live cutover, a full30-minute observation and removal. Discovery found no old application database, so the canonical root was initialized as a new empty installation; both the verified empty baseline and all acknowledged post-cutover data are backed up. Actual UI/restart/monitor evidence passed before Express/Multer removal. See features/express-to-fastapi/cutover-completion.md for exact times, root, process and7day retention.

Vite dev always proxies /api to FastAPI; preview is frontend-only. FastAPI serves the built frontend with API precedence over non-API SPA fallback. D1–D5 hardening remains proposed; no API redesign or live AI mutation was introduced.

## Implemented app behavior

The app is Vite + React + TypeScript + Three.js. FastAPI serves the application API and built frontend; Vite supplies only development/build tooling. app/src/api/client.ts and App.tsx read and mutate the existing /api endpoints, then reload project state.

skullfix_ai.application.ApplicationRepository owns data/storage/app-model.sqlite and volumes/*.nrrd (or HACK_STORAGE_ROOT). Its hierarchy is User → Project → Case → Sample → Candidate → CandidateRevision. Source anatomy belongs to a sample, not directly to a case. NRRD volume bytes are authoritative. Candidate revision 0 references the source volume and identity pose. Transform appends a revision using the same volume and a flat row-major 16-value pose. Restore sets currentRevisionId to an existing revision; it does not append an immutable child. The current pointer can therefore refer to a revision below the maximum order.

Actual routes include project/case/sample/candidate CRUD, GET /api/projects/:id, GET /api/samples/:id/volume, POST /api/samples/:id/candidates, POST /api/candidates/:id/transform with {pose}, and POST /api/candidates/:id/restore with {revisionId}. The live routes do not use the standalone Python command/result envelope.

Source spatial metadata is sourceAnatomy.spatial: units, optional space, sizes, spacings, bboxMm. Revisions carry id, candidateId, order, volumeId, pose, volumeHash. volumeHash is the app's raw hex string, not a Python sha256:-prefixed artifact hash. No adapter may manufacture an anatomy revision id or infer revision parentage from order.

The browser publicOps/session/debug bridge also contains local editing functions for legacy sessions/tests. The management UI's current durable path is apiClient → FastAPI → ApplicationRepository, followed by project reload. These two paths are not yet one shared cross-runtime operation service. Do not route AI writes through the legacy browser cache or a second Python candidate store.

## Implemented AI alignment

schemas/workspace.py models the actual app manifest and retains additive fields. Camel-case aliases preserve app metadata on serialization. AppWorkspaceAdapter resolves a fresh project manifest into a sample/source/candidate context, verifies the ownership chain, honors currentRevisionId after restore, and optionally checks an expected revision. It preserves source spatial metadata and the selected candidate pose without claiming geometric correctness. It loads metadata only, not NRRD bytes or benchmark targets.

HttpAppManifestReader performs GET /api/projects/:id against the configured app origin. It never POSTs or reads the app database directly. Dependency-injected readers support offline fixture tests. A read is a point-in-time context snapshot, not a mutation lock.

SQLiteApplicationStorage, OperationService and DeterministicReconstructionMock are retained as an isolated Python sandbox. Their candidate ids, immutable-child commits, run ownership, synthetic JSON artifacts and result envelope are not live app records. The sandbox initializer refuses app-model.sqlite and renamed databases containing the app project/sample/volume schema before applying any schema or metadata changes. Do not connect SKULLFIX_AI_DB_PATH to the app database.

## Mutation gaps

- The app transform endpoint accepts pose but no expectedRevisionId or requestId. A GET freshness check followed by that POST is not atomic and does not prevent duplicate execution.
- The app restore contract moves a pointer; it is different from the sandbox's child-commit semantics.
- createCandidate is an initial draft referencing source anatomy, not an inferred repair or reconstruction operation.
- The app exposes sample NRRD retrieval. Python /api/artifacts/... references have no route in the app.
- No endpoint publishes a generated NRRD candidate with mock provenance, limitation and spatial metadata. The Python mock emits synthetic JSON, which must not be relabeled as NRRD or offered to the viewport as a reconstruction.
- Live mechanical foreground-volume measurement is bound at `POST /api/candidates/{id}/measurements` and revision-scoped GET history. It does not create geometry revisions or rewrite volume bytes. LangGraph/`measure.candidate` and AI mutation remain unbound. Local sculpt beyond the explicit voxel prototype, annotation/compare productization, and cited-retrieval remain separate. View inspection planes do not edit geometry.

AppWorkspaceAdapter.execute_mutation explicitly raises app-mutation-contract-missing. It issues no POST and does not fall back to sandbox writes. This keeps the live app contract unchanged while avoiding a false cross-runtime capability.

## LangGraph readiness

A genuine read-only/fake-model LangGraph is now implemented with repository-backed context, typed tools and grounded explanations. Its scoped plan is features/ai-workspace-assistant/plans/langgraph-fake-model.md. Default tools read metadata; optional reconstruction stays sandbox-only. Bedrock, checkpoint persistence and live mutations remain unavailable.

A graph may exercise the existing Python mock service only in a clearly isolated sandbox mode. Live candidate-changing AI requires an agreed app backend operation path with atomic revision validation, accepted request identity/deduplication, generated-NRRD publication/provenance and explicit restore semantics. Automatic recovery and pre-model request claiming remain proposed R35–R39. Bedrock integration can remain a separately injected model adapter.

## Verification

- Python workspace tests validate real fixture hierarchy, source identity, raw metadata, restored-pointer selection, fresh reads, ownership/freshness rejection, mutation blocking and sandbox database protection.
- app/tests/aiWorkspaceContract.test.ts creates records through actual FastAPI HTTP, starts the actual FastAPI subprocess and calls the Python HTTP reader. It verifies restored currentRevisionId, metadata, pose/hash and unchanged app state.
- npm test covers the existing mechanical/backend suite. npm run build regenerates public demo assets from data/fixtures and compiles the app. The generated public manifest now matches the nested sourceAnatomy.spatial form in that canonical fixture.
- No live model, real reconstruction or AI mutation was verified.

## Verified migration integration

Both real HTTP implementations pass the shared16 scenarios. Actual Express registered routes and FastAPI OpenAPI paths match13 method/path pairs. Node-created copied storage is readable/mutable in Python and reopened by Node; the graph also reads a restored pointer from that copied dataset without changing it. S13 sequential handoff passes. Chrome verifies dev, built and preview behavior. The npm run dev default now proxies to FastAPI; one persistent FastAPI writer serves the live built app.

## Completed live migration

Read features/express-to-fastapi/cutover-completion.md for exact approved discovery, new empty baseline, backup/restore, full1800second monitoring, retained-data/restart and removal evidence. Active app requires no Express/Multer. Shared FastAPI contracts, actual browser checks, frozen Node data and Python HTTPfault/backup/repository/graph tests retain equivalent coverage. External backup/rollback runtime is retained7days. Full draft acceptance and pending hardening/recovery/provider/geometry requirements are not inferred.

## Read-only chat transport (2026-11-14)

POST /api/ai/chat connects the typed browser client to the genuine fake-model graph and authoritative mode=ro application snapshot. Only workspace.describe_selection is registered. Context preserves restored pointers, ownership, pose, spatial metadata and raw hashes. Request/conversation ids are transient correlation only. HTTP outcomes and limitations are explicit; no provider, sandbox tool, history or AI live writes. Chat panel is deferred; the client seam and actual browser dev/built transport are verified. Current slice evidence:112 backend tests,90 app tests,7 browser journeys (the two added chat journeys also pass focused). See plans/read-only-chat.md and setup.md.

## Manual rigid placement and chat separation

The current UI uses numeric rigid-placement deltas, full rotation/translation rendering and new POST /api/candidates/{id}/placement, guarded by expected revision and project/case membership. The13 legacy routes remain compatibility contracts. Read-only chat, placement, package routes, and live measurement POST/GET are additional domain routes on the same FastAPI application. Manual placement changes only a candidate pose revision and never source NRRD content. Foreground-volume measurement persists revision-scoped results without creating a geometry revision. Neither capability is registered with the read-only AI registry. Browser mode=place still means one-shot view point placement, distinct from candidate rigid construction.


## Portable manual package boundary (2026-11-14)

Save/Open adds POST /api/projects/{id}/package (validated presentation JSON → ZIP), POST /api/packages/import (bounded raw ZIP →201 {projectId,presentation}), and GET /api/candidates/{id}/revisions/{revision_id}/volume (owned immutable bytes). Measurement adds POST /api/candidates/{id}/measurements and GET /api/candidates/{id}/revisions/{revision_id}/measurements. Total application method/path pairs:20. Existing13 compatibility contracts plus chat/placement/packages remain intact. Import is a manual create-copy transaction with fresh identities, SHA-256 verification, current Restore pointer and volume alias preservation. Browser hydration uses the newly committed authoritative manifest, then validated/remapped presentation. Post-commit UI failure reports the copy exists and never retries the import. See canvas-workspace R76–R85 and setup.md for precise archive/view/crash limits. No package or measurement mutation is registered with the read-only graph.

## Live foreground-volume measurement

`ForegroundVolumeService` is the mechanical measurement path: revision-scoped labelmap foreground volume (`candidate.foreground-volume.label-voxel.v1`), additive reservation/result tables, completed-result replay before freshness, bounded in-progress wait, and no automatic claim takeover. It does not create geometry revisions or modify NRRD bytes. Sandbox OperationService still reports `operation-contract-missing` for `measure.candidate`; chat registry stays metadata-only.
