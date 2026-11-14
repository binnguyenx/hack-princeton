# Assignment: API, streaming, persistence, and checkpoints

Status: foundation scope accepted; shared schemas, SQLite application storage, and local artifact handling are implemented. API/SSE work remains blocked on its own implementation plan and task preflight. R35–R39 and S21–S24 are proposed retry behavior pending review and must not be implemented yet.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Expose direct mechanical and AI requests over HTTP and SSE. Store authoritative cases, candidates, immutable revisions, artifacts, review results, operation runs, request fingerprints, and current-revision pointers. Keep LangGraph checkpoints in a separate database. Requirements: R1, R10–R13, R16, R18, R23–R29, R31–R34.

## Owns

- `backend/ai/src/skullfix_ai/api/`
- `backend/ai/src/skullfix_ai/storage/` (sandbox) and `backend/ai/src/skullfix_ai/application/` (live application repository)
- `backend/ai/tests/unit/api/`
- `backend/ai/tests/unit/storage/`
- `backend/ai/tests/integration/api/`
- `backend/ai/tests/integration/storage/`

## Must not edit

- Tool implementations, Bedrock client, geometry integration
- The meaning of a measurement
- Test paths owned by agents 01, 02, or 04, and the main agent's shared test files

## Tests

Write a failing test in the owned test paths before implementing the requirement it covers. Fixtures for those tests stay inside those directories. API and storage checks stay in `tests/integration/api/` and `tests/integration/storage/`. They use a fake runner. They are not a substitute for agent 04's `tests/integration/workflows/` tests. The canonical map and coordination rules are in [README.md](README.md).

## Interfaces

- Storage callers import supported records, protocols, errors, `SQLiteApplicationStorage`, and `LocalArtifactStore` from `skullfix_ai.storage`.
- Application schema version 2 owns cases, source anatomy, artifacts, candidates/revisions, review results, request reservations, and runs. It does not open the checkpoint path.
- Request reservation accepts an opaque canonical identity and detects same-id conflicts. Future application code still owns canonicalization; storage does not implement fingerprints, model ownership, expiration, or recovery.
- Non-authoritative artifacts are explicitly listed and reconciled. Filesystem deletion and SQLite reconciliation updates are separate idempotent steps.
- Request fields match `docs/ai/contracts.md`.
- SSE event names are `progress` and `result`. An established stream receives exactly one terminal `result`; `unavailable` is a status, not an event name.
- Application SQLite path: `SKULLFIX_AI_DB_PATH`.
- Checkpoint SQLite path: `SKULLFIX_AI_CHECKPOINT_DB_PATH`.
- A revision row stores candidate and parent ids, operation id, validated parameters, backend artifact reference and hash, spatial metadata, units, coordinate frame, transforms, and provenance. It does not store a checkpoint blob or expose a server-local path as the frontend contract.
- `request_id` is unique within a case. The accepted foundation requires idempotent reuse and conflict rejection; the proposed retry clarification separates the client-request fingerprint from the validated-command fingerprint.
- Proposed retry behavior after review: atomically claim `(case_id, request_id)` and persist canonical client input plus its fingerprint before model invocation. Store the validated command and a separate command fingerprint before execution. Completed retries return the original result without a freshness rejection; active retries attach; interrupted requests are reclaimed by one local recovery owner.
- Expected-revision check, child insertion, and current-pointer update are one application-storage transaction. External geometry execution and file writes are not part of that transaction.
- Run state records non-authoritative artifacts left by stale or failed commits for local reconciliation.

## Depends on

- API/SSE work depends on a new implementation plan and filled preflight. A task using R35–R39 also depends on explicit review. Shared schemas and storage interfaces are already published.
- A callable run function from the workflow assignment. Until it exists, use a fake runner that returns a labeled `test-double` result.

## Done when

- A test in `tests/integration/api/` posts one measurement request to a fake runner and reads exactly one terminal `result` event whose review cites the revision id.
- A second post with the same `request_id` and fingerprint attaches to the existing run and does not insert a second authoritative row. A different fingerprint with that id returns conflict.
- After retry review, tests distinguish client-request and command fingerprints; prove one model owner for concurrent AI retries; return a completed result after revision advance; and reconcile a claimed request with no persisted command.
- Storage tests prove immutable child commit, stale atomic rejection, historical measurement scoping, and candidate history without the checkpoint database.
- Opening the checkpoint file is not required to read the revision history.

## Handoff

Document the route path and the event schema you implemented. Do not add a frontend client.

## Operation-service handoff

The synchronous service and reconstruction mock are published. See docs/ai/setup.md for supported imports, canonical/direct request entry points, schema-v2 cleanup coordination, 117 deterministic backend tests, and reconciliation limits. Read-only fake-model graph and application FastAPI are implemented under their scoped plans; provider/live-mutation/checkpoint/SSE work remains deferred.

## UI canonical integration correction

The live app hierarchy/routes in app/src/domain/types.ts and app/src/api/client.ts take precedence over standalone Python demo storage. Use AppWorkspaceAdapter/HttpAppManifestReader and schemas/workspace.py for context; do not seed or write a second copy of live UI candidates. Candidate creation is not reconstruction, restore moves a pointer, and pose is a flat row-major array. App AI mutation is blocked until backend CAS/idempotency and generated-NRRD publication are agreed. See docs/ai/app-integration.md.

Application repository ownership: the API/persistence owner maintains application/ and tests/integration/application/, distinct from sandbox storage/. Context/graph callers read through the application interface; no second live candidate store.
