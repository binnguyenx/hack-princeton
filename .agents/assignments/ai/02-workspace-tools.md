# Assignment: Workspace context, tools, and operations

Status: blocked until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Accepting one does not accept the other. Write `plan.md` before coding. Separate plan approval is not required unless the user asks. This status is not acceptance.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Load authoritative workspace context and expose thin tools over shared operations. Enforce capabilities, constraints, revision freshness, and idempotency before a geometry call. Own the reconstruction adapter in `integrations/geometry/`. A labeled mock is one implementation of that adapter. Requirements: R2, R3, R4, R5, R6, R7, R8, R11, R12, R14, R15, R16, R17, R19, R20, R21, R22. Success criteria for this agent include S3, S5, S6, S7, S8, S9, and S10 at the operation boundary.

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
- `measure.candidate` may run a fake only when the result source is `test-double`. That fake is not the reconstruction mock and not a real measurement.
- `generate.candidate.from_contour` stays unsupported. Do not add it to the mock.
- An edit that requests a preserved region runs only when the filled `edit.local` contract says that constraint is supported. Do not satisfy inspection, editing, or comparison with the reconstruction mock.

## Depends on

- Explicit acceptance of `intent.md` and `spec.md`, a written `plan.md`, and a filled preflight record at the path the main agent assigned. Separate plan approval is not required unless the user asks. The checklist is not another approval gate. Shared schemas from the main agent.
- Storage functions for "current revision" and "review result exists for idempotency key". If those functions are not ready, accept them as injected interfaces and use fakes in unit tests.

## Done when

- Unit tests cover S3, S5, S6, S7, and S8 without a network call.
- S9 stores a generate result from the mock adapter with source `mock` or `test-double`, and the limitation says the artifact is not a real reconstruction.
- S10 accepts a second adapter that returns that same schema without a mock-only branch. The second adapter is not described as real geometry unless its contract is marked agreed.
- A tool module contains the input schema and the call into one operation, and the registry lists it.
- No numeric measurement is hardcoded as the volume of a skull.

## Handoff

List registry names and the operation ids they wrap. List contract rows that are still unresolved, and say which are agreed and which are provisional mock contracts. Hand off the reconstruction adapter interface, which implementation is the mock, and its assumptions and limitations. Agent 04 uses that interface for cross-component checks and does not replace this adapter. Do not document a fake or mock run as live geometry.
