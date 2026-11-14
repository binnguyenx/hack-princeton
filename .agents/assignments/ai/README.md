# AI assignment index

Status: foundation scope accepted; shared schemas, SQLite application storage, and local artifact handling are published. Future API, graph, model, and real-adapter work remains blocked on its own plan and preflight. Completed plans are archived under the feature's `plans/` directory. R35–R39 and S21–S24 are proposed retry behavior pending review and must not be implemented yet. Separate plan approval is not required unless the user asks. `features/ai-workspace-assistant/preflight.md` is the shared template.

Paths below are the only test directories these agents may edit. A parent such as `backend/ai/tests/unit/` is not itself owned by an agent. Do not put tests directly in that parent.

## Ownership

| Agent | Implementation | Tests |
|---|---|---|
| 01 Workflow and Bedrock | `backend/ai/src/skullfix_ai/agent/`, `backend/ai/src/skullfix_ai/integrations/bedrock/` | `backend/ai/tests/unit/agent/`, `backend/ai/tests/unit/integrations/bedrock/`, `backend/ai/tests/integration/agent/` |
| 02 Tools, context, and reconstruction adapter | `backend/ai/src/skullfix_ai/tools/`, `backend/ai/src/skullfix_ai/operations/`, `backend/ai/src/skullfix_ai/integrations/workspace/`, `backend/ai/src/skullfix_ai/integrations/geometry/` (including the labeled reconstruction mock) | `backend/ai/tests/unit/tools/`, `backend/ai/tests/unit/operations/`, `backend/ai/tests/unit/integrations/workspace/`, `backend/ai/tests/unit/integrations/geometry/`, `backend/ai/tests/integration/operations/` |
| 03 API and persistence | `backend/ai/src/skullfix_ai/api/`, `backend/ai/src/skullfix_ai/storage/` | `backend/ai/tests/unit/api/`, `backend/ai/tests/unit/storage/`, `backend/ai/tests/integration/api/`, `backend/ai/tests/integration/storage/` |
| 04 Cross-component tests and evaluation | none | `backend/ai/tests/integration/workflows/`, `backend/ai/tests/live/`, `backend/ai/evaluation/` |
| Main integrating agent | `backend/ai/src/skullfix_ai/schemas/`, dependency wiring, `features/ai-workspace-assistant/preflight.md` | `backend/ai/tests/unit/schemas/`, `backend/ai/tests/conftest.py`, `backend/ai/tests/helpers/`, and the test configuration at `backend/ai/` |

## Coordination

- Agents 01–03 write a failing test in their own test paths before implementing the requirement it covers.
- The main agent has published the shared direct-request, AI-request, validated-command, result, artifact, spatial, error, and event schemas from `skullfix_ai.schemas`. Mechanical and AI paths must not create competing envelopes.
- Agent 02 implements the reconstruction adapter and the labeled mock, including R14, R20–R22, and S9–S10 at that boundary. The mock does not wait for a measurement contract. Agent 04 verifies S9 and S10 only where they cross components. Agent 04 does not implement the mock and does not replace agent 02's tests.
- Agent 02 owns operation-service behavior and workspace/geometry adapters. Agent 03 owns authoritative application persistence, atomic revision commit, idempotency records, HTTP, and SSE. Neither bypasses the other's interface to mutate candidate state.
- Agent 03's storage foundation is available from `skullfix_ai.storage`. It provides atomic revision commits, review history, run records, opaque request reservations, and explicit artifact reconciliation. OperationService provides synchronous mock orchestration separately; storage does not implement the pending AI retry lifecycle.
- Proposed retry ownership after review: agent 03 claims and fingerprints accepted client requests before model invocation; agent 01 reuses persisted AI command/run state and does not reinterpret equivalent retries; agent 02 uses the persisted command fingerprint to prevent duplicate execution. Agent 04 verifies cross-component retry scenarios. Do not implement this proposal before review and the foundation implementation plan.
- Agent 04 tests cross-component behavior, acceptance scenarios, and evaluation criteria. It does not replace those component tests.
- The main agent assigns each preflight record before delegation. An agent edits only its own record. If the task grows, update that record. Do not create a record for a coding task that does not exist yet.
- Agents may add fixtures only inside their assigned test directories. A change to `backend/ai/tests/conftest.py` or `backend/ai/tests/helpers/` goes through the main agent.
- No agent edits another agent's files at the same time. Report a defect to the owner, or agree an explicit handoff before editing.
- Agree the expected behavior of a `tests/integration/workflows/` test with the owners it depends on before those owners implement that behavior.
- Live provider checks live only in `backend/ai/tests/live/`. They are opt-in and must not run as part of the deterministic unit or integration suite.

## Operation-service handoff

The synchronous service and reconstruction mock are published. See docs/ai/setup.md for supported imports, canonical/direct request entry points, schema-v2 cleanup coordination, 107 deterministic backend tests, and reconciliation limits. Read-only fake-model graph and application FastAPI are implemented under their scoped plans; provider/live-mutation/checkpoint/SSE work remains deferred.

## UI canonical integration correction

The live app hierarchy/routes in app/src/domain/types.ts and app/src/api/client.ts take precedence over standalone Python demo storage. Use AppWorkspaceAdapter/HttpAppManifestReader and schemas/workspace.py for context; do not seed or write a second copy of live UI candidates. Candidate creation is not reconstruction, restore moves a pointer, and pose is a flat row-major array. App AI mutation is blocked until backend CAS/idempotency and generated-NRRD publication are agreed. See docs/ai/app-integration.md.

Application repository ownership: the API/persistence owner maintains application/ and tests/integration/application/, distinct from sandbox storage/. Context/graph callers read through the application interface; no second live candidate store.
