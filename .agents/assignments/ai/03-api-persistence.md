# Assignment: API, streaming, persistence, and checkpoints

Status: blocked until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Accepting one does not accept the other. Write `plan.md` before coding. Separate plan approval is not required unless the user asks. This status is not acceptance.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Expose the request over HTTP and SSE, store review results and revision rows, and keep LangGraph checkpoints in a separate database. Requirements: R1, R10, R12, R13, R16's stored parent and parameters, R18.

## Owns

- `backend/ai/src/skullfix_ai/api/`
- `backend/ai/src/skullfix_ai/storage/`
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

- Request fields match `docs/ai/contracts.md`.
- SSE event names: `progress`, `result`, `unavailable`.
- Application SQLite path: `SKULLFIX_AI_DB_PATH`.
- Checkpoint SQLite path: `SKULLFIX_AI_CHECKPOINT_DB_PATH`.
- A revision row stores parent id, operation id, validated parameters, and an artifact path plus hash. It does not store the checkpoint blob.
- Idempotency is a unique key on the review result or revision created by that request.

## Depends on

- Explicit acceptance of `intent.md` and `spec.md`, a written `plan.md`, and a filled preflight record at the path the main agent assigned. Separate plan approval is not required unless the user asks. The checklist is not another approval gate. Shared schemas from the main agent.
- A callable run function from the workflow assignment. Until it exists, use a fake runner that returns a labeled `test-double` result.

## Done when

- A test in `tests/integration/api/` posts one measurement request to a fake runner and reads a terminal SSE event whose review cites the revision id.
- A second post with the same idempotency key does not insert a second row.
- Opening the checkpoint file is not required to read the revision history.

## Handoff

Document the route path and the event schema you implemented. Do not add a frontend client.
