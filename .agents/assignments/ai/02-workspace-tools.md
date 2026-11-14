# Assignment: Workspace context, tools, and operations

Status: foundation scope accepted; shared schemas and application storage are published. Operation and adapter coding remains blocked on its own implementation plan and task preflight. R35–R39 and S21–S24 are proposed retry behavior pending review and must not be implemented yet.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Load backend-owned authoritative workspace context and expose thin tools over the common operation service. Enforce capabilities, typed arguments, constraints, revision freshness, and `request_id` idempotency around execution. Own the reconstruction adapter in `integrations/geometry/`. A labeled mock is one implementation of that adapter. Requirements: R2–R8, R11, R12, R14–R17, R19–R22, R25, R28–R32. Success criteria for this agent include S3, S5–S15, S17, and S18 at the operation boundary.

## Owns

- `backend/ai/src/skullfix_ai/tools/`
- `backend/ai/src/skullfix_ai/operations/`
- `backend/ai/src/skullfix_ai/integrations/workspace/`
- `backend/ai/src/skullfix_ai/integrations/geometry/`
- `backend/ai/tests/unit/tools/`
- `backend/ai/tests/unit/operations/`
- `backend/ai/tests/unit/integrations/workspace/`
- `backend/ai/tests/unit/integrations/geometry/`
- `backend/ai/tests/integration/operations/`

## Must not edit

- `agent/` graph wiring, `api/` routes, `storage/` table definitions
- Any formula for a measurement or edit. Call the geometry integration.
- Test paths owned by agents 01, 03, or 04, and the main agent's shared test files

## Tests

Write a failing test in the owned test paths before implementing the requirement it covers. Fixtures for those tests stay inside those directories. S3, S5, S6, S7, S8, S9, and S10 belong in `tests/unit/operations/`, `tests/unit/integrations/geometry/`, or `tests/integration/operations/`, with no network call. S10 here proves a second adapter can return the same operation result schema. Agent 04 verifies that schema across the API and storage. The canonical map and coordination rules are in [README.md](README.md).

## Interfaces

- Real implementation: read the slots in `docs/ai/contracts.md`. Without an agreed contract, do not advertise or execute the operation as a real capability. Return `operation-contract-missing` and an empty value. A provisional mock contract is not that agreed contract.
- Reconstruction mock: `generate.candidate` may use a provisional contract proposed by the AI workstream. It does not wait for finalized mechanical tools or a measurement contract. Label the result `mock` or `test-double`. Write the assumptions and limitations next to the adapter. Never describe the output as a real reconstruction, a real measurement, or geometric quality.
- The mock returns the shared operation result schema. Do not add mock-only fields that the agent, API, or storage must branch on. Replacing the mock is a change of adapter wiring when that schema stays the same.
- Direct mechanical commands and model proposals converge on the same validated operation command. Do not let tools, adapters, or routes bypass the common operation service.
- Use `skullfix_ai.storage` for authoritative state, atomic child commits, review history, run records, and artifact authority. Do not recreate current-revision or artifact-authority state in the workspace adapter.
- Proposed retry behavior after review: consume the persisted validated command and command fingerprint. Do not execute an equivalent command independently for attached retries, and reconcile uncertain external execution before retrying it.
- The workspace adapter reads application state and does not own a second current-revision pointer. Submitted selections and regions identify their geometry revision and coordinate frame.
- `measure.candidate` may run a fake only when the result source is `test-double`. That fake is not the reconstruction mock and not a real measurement.
- `generate.candidate.from_contour` stays unsupported. Do not add it to the mock.
- An edit that requests a preserved region runs only when the filled `edit.local` contract says that constraint is supported. Do not satisfy inspection, editing, or comparison with the reconstruction mock.

## Depends on

- The accepted foundation record, an operation/adapter implementation plan, and a filled preflight record at the path the main agent assigned. A task using R35–R39 also depends on explicit review of that proposal. Shared schemas are published from `skullfix_ai.schemas`.
- Published storage interfaces for authoritative current revision, opaque request reservation, run state, atomic revision commit, and non-authoritative artifact reconciliation. OperationService now owns canonical command identity and execution coordination; the proposed pre-model recovery policy remains unimplemented.

## Done when

- Unit tests cover S3, S5, S6, S7, and S8 without a network call.
- S9 stores a generate result from the mock adapter with source `mock` or `test-double`, and the limitation says the artifact is not a real reconstruction.
- S10 accepts a second adapter that returns that same schema without a mock-only branch. The second adapter is not described as real geometry unless its contract is marked agreed.
- Mechanical and AI commands receive the same validation and commit rules. Identical concurrent `request_id` retries do not independently execute, conflicting reuse is rejected, and stale commit does not advance current revision.
- Spatial metadata is preserved or explicitly transformed in the adapter result submitted for commit.
- A tool module contains the input schema and the call into one operation, and the registry lists it.
- No numeric measurement is hardcoded as the volume of a skull.

## Handoff

List registry names and the operation ids they wrap. List contract rows that are still unresolved, and say which are agreed and which are provisional mock contracts. Hand off the reconstruction adapter interface, which implementation is the mock, and its assumptions and limitations. Agent 04 uses that interface for cross-component checks and does not replace this adapter. Do not document a fake or mock run as live geometry.

## Operation-service handoff

The synchronous service and reconstruction mock are published. See docs/ai/setup.md for supported imports, canonical/direct request entry points, schema-v2 cleanup coordination, 107 deterministic backend tests, and reconciliation limits. Read-only fake-model graph and application FastAPI are implemented under their scoped plans; provider/live-mutation/checkpoint/SSE work remains deferred.

## UI canonical integration correction

The live app hierarchy/routes in app/src/domain/types.ts and app/src/api/client.ts take precedence over standalone Python demo storage. Use AppWorkspaceAdapter/HttpAppManifestReader and schemas/workspace.py for context; do not seed or write a second copy of live UI candidates. Candidate creation is not reconstruction, restore moves a pointer, and pose is a flat row-major array. App AI mutation is blocked until backend CAS/idempotency and generated-NRRD publication are agreed. See docs/ai/app-integration.md.
