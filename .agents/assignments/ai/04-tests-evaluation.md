# Assignment: Tests, evaluation, and tracing

Status: foundation scope accepted; shared schemas and application storage are published. New operation/API/graph tests remain blocked on the corresponding implementation plan and task preflight. R35–R39 and S21–S24 are proposed retry behavior pending review and must not be treated as accepted application behavior.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Cover cross-component acceptance scenarios and evaluation. Keep live provider checks opt-in. Do not take over component tests that agents 01–03 write for their own TDD. Do not implement the reconstruction adapter or its mock. Agent 02 implements that adapter. Verify the cross-component result of R14, R20–R22, R26, R29, R32–R34, and S9–S20 where more than one component is involved. Mock output is labeled, the common envelope has no mock-only branch, mechanical and AI paths share validation and commit behavior, and an established SSE stream has exactly one terminal result.

## Owns

- `backend/ai/tests/integration/workflows/`
- `backend/ai/tests/live/`
- `backend/ai/evaluation/`

## Must not edit

- `backend/ai/tests/unit/agent/`, `backend/ai/tests/unit/tools/`, `backend/ai/tests/unit/operations/`, `backend/ai/tests/unit/api/`, `backend/ai/tests/unit/storage/`, and `backend/ai/tests/unit/integrations/`
- `backend/ai/tests/integration/agent/`, `backend/ai/tests/integration/operations/`, `backend/ai/tests/integration/api/`, and `backend/ai/tests/integration/storage/`
- `backend/ai/tests/conftest.py`, `backend/ai/tests/helpers/`, and the root test configuration under `backend/ai/`
- Production code, prompts, or API behavior in order to make a test pass
- `docs/ai/contracts.md` operation definitions

## Tests

This assignment does not replace component-level TDD. Agents 01–03 write their failing tests first in the paths listed in [README.md](README.md).

Agree the expected behavior of each `tests/integration/workflows/` test with the agents it depends on before they implement that behavior. Fixtures for these tests stay inside the owned directories. A shared fixture change goes through the main agent.

`tests/live/` calls real Bedrock or real geometry only when the matching environment variables and a filled contract exist. Otherwise the test is skipped, not passed. Live tests are not part of the deterministic unit or integration run.

Evaluation scenarios in `evaluation/` describe one prepared case and the expected operation id. They do not invent expected millimetre values.

## Depends on

- The accepted foundation record, the relevant component/application implementation plans, and a filled preflight record at the path the main agent assigned. Retry scenarios depend on explicit review of R35–R39 and S21–S24. Shared schemas are published from `skullfix_ai.schemas`.
- Storage-only portions of stale commit, immutable history, review scoping, checkpoint independence, request conflict, and artifact reconciliation are exercised in `tests/integration/storage/`; do not relabel them as full operation or API acceptance.
- The public behavior agreed with agents 01–03. Do not stub so broadly that an acceptance test passes without the `operation-contract-missing` reason when that is the agreed result. Do not relabel a mock result as a real reconstruction or as the real measurement milestone.

## Done when

- `evaluation/README.md` lists each acceptance scenario with the one test path that covers it. Component scenarios point at agent 01–03 paths. Cross-component scenarios point at `tests/integration/workflows/`.
- A workflow test that uses a fake is marked `test-double` and is not described as a live geometry success.
- A cross-component check of S9 and S10, agreed with agent 02 before that agent implements the adapter, shows source `mock` or `test-double` and accepts a second adapter through the same result schema. It does not describe either result as real geometry unless that contract is marked agreed. Agent 02's component tests remain the implementation proof.
- Cross-component scenarios cover immutable child revisions, stale commit, identical and conflicting request-id reuse, measurement history, spatial metadata, one terminal SSE result, and candidate history without checkpoints. Component proofs remain with agents 02 and 03.
- After retry review, scenarios cover a completed AI retry after revision advance, concurrent identical AI requests, conflicting client input, and retry before command persistence. Fixture samples alone are not behavior proof.
- A live test is skipped, not passed, when credentials or a filled contract are absent.

## Handoff

Give the main agent the command that runs unit and integration tests, and the command that runs live tests without failing the default check when credentials are absent.

## Operation-service handoff

The synchronous service and reconstruction mock are published. See docs/ai/setup.md for supported imports, canonical/direct request entry points, schema-v2 cleanup coordination, 59 offline tests, and reconciliation limits. Graph/model/API integration remains a separate future task.

## UI canonical integration correction

The live app hierarchy/routes in app/src/domain/types.ts and app/src/api/client.ts take precedence over standalone Python demo storage. Use AppWorkspaceAdapter/HttpAppManifestReader and schemas/workspace.py for context; do not seed or write a second copy of live UI candidates. Candidate creation is not reconstruction, restore moves a pointer, and pose is a flat row-major array. App AI mutation is blocked until backend CAS/idempotency and generated-NRRD publication are agreed. See docs/ai/app-integration.md.
