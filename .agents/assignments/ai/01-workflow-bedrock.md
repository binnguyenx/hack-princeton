# Assignment: AI workflow and Bedrock

Status: foundation scope accepted; shared schemas and application storage are published. Workflow coding remains blocked on its own implementation plan and task preflight. R35–R39 and S21–S24 are proposed retry behavior pending review and must not be implemented yet.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Implement the LangGraph run that loads authoritative context, proposes one registered operation and typed arguments, calls the common operation service, calls Bedrock for the explanation step, and stops on unsupported or stale requests. Model arguments receive the same application validation as direct mechanical requests. Requirements: R2, R4, R6, R9, R14's rule that the model does not emit mesh coordinates, R18, R24.

## Owns

- `backend/ai/src/skullfix_ai/agent/`
- `backend/ai/src/skullfix_ai/integrations/bedrock/`
- `backend/ai/tests/unit/agent/`
- `backend/ai/tests/unit/integrations/bedrock/`
- `backend/ai/tests/integration/agent/`

## Must not edit

- `schemas/` after the main agent publishes them
- `api/`, `storage/`, `operations/`, `tools/`
- Test paths owned by agents 02, 03, or 04, and the main agent's shared test files
- Teammate frontend or geometry code

## Tests

Write a failing test in the owned test paths before implementing the requirement it covers. Fixtures for those tests stay inside those directories. The canonical map and coordination rules are in [README.md](README.md).

Missing `SKULLFIX_AI_MODEL_ID` is a deterministic unit test under `tests/unit/integrations/bedrock/`. It must not call Bedrock. Live provider checks belong to agent 04 in `tests/live/` and stay opt-in.

## Interfaces

- Input: the request schema and the workspace snapshot schema from `schemas/`.
- Tool choice: the registry in `tools/`. Call only a name that registry returns.
- Operation execution: submit the proposal as a validated-command candidate to the common operation service. Do not write candidate records or bypass operation validation from the graph.
- Proposed retry behavior after review: invoke the model only for the owner of a persisted client-request claim. Persist the accepted command before execution. Equivalent retries reuse that command/run/result instead of invoking Bedrock again.
- Output: an explanation that quotes the tool result. If a number is not in the result, fail the explanation step.
- Bedrock: read `SKULLFIX_AI_MODEL_ID` and AWS settings from the environment. Do not hardcode a model id or a key.

## Depends on

- The accepted foundation record, a workflow implementation plan, and a filled preflight record at the path the main agent assigned. A task using R35–R39 also depends on explicit review of that proposal.
- Shared schemas from `skullfix_ai.schemas`, authoritative reads from `skullfix_ai.storage`, and the future tool registry plus the published OperationService canonical-command interface.
- A fake workspace snapshot. Do not wait on the live workspace URL.

## Done when

- A test in `tests/unit/agent/` or `tests/integration/agent/` returns the fake tool's value in the explanation and rejects an explanation that adds a new number.
- An unsupported user message ends without a tool call that writes geometry.
- A unit test in `tests/unit/integrations/bedrock/` fails closed when `SKULLFIX_AI_MODEL_ID` is missing and does not call the network.

## Handoff

Return the graph entry function and the Bedrock client interface. Note any schema field you needed that was missing. Do not mark S1 as a live geometry success.

## Operation-service handoff

The synchronous service and reconstruction mock are published. See docs/ai/setup.md for supported imports, canonical/direct request entry points, schema-v2 cleanup coordination, 107 deterministic backend tests, and reconciliation limits. Read-only fake-model graph and application FastAPI are implemented under their scoped plans; provider/live-mutation/checkpoint/SSE work remains deferred.

## UI canonical integration correction

The live app hierarchy/routes in app/src/domain/types.ts and app/src/api/client.ts take precedence over standalone Python demo storage. Use AppWorkspaceAdapter/HttpAppManifestReader and schemas/workspace.py for context; do not seed or write a second copy of live UI candidates. Candidate creation is not reconstruction, restore moves a pointer, and pose is a flat row-major array. App AI mutation is blocked until backend CAS/idempotency and generated-NRRD publication are agreed. See docs/ai/app-integration.md.
