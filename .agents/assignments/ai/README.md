# AI assignment index

Status: blocked until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Write `plan.md` before coding. Separate plan approval is not required unless the user asks. `features/ai-workspace-assistant/preflight.md` is the shared template, maintained here by the main agent. Before delegation, the main agent assigns one record at `features/ai-workspace-assistant/preflights/<task-id>.md`. That record names one responsible agent and has one editor at a time. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate.

Paths below are the only test directories these agents may edit. A parent such as `backend/ai/tests/unit/` is not itself owned by an agent. Do not put tests directly in that parent.

## Ownership

| Agent | Implementation | Tests |
|---|---|---|
| 01 Workflow and Bedrock | `backend/ai/src/skullfix_ai/agent/`, `backend/ai/src/skullfix_ai/integrations/bedrock/` | `backend/ai/tests/unit/agent/`, `backend/ai/tests/unit/integrations/bedrock/`, `backend/ai/tests/integration/agent/` |
| 02 Tools, context, and reconstruction adapter | `backend/ai/src/skullfix_ai/tools/`, `backend/ai/src/skullfix_ai/operations/`, `backend/ai/src/skullfix_ai/integrations/workspace/`, `backend/ai/src/skullfix_ai/integrations/geometry/` (including the labeled reconstruction mock) | `backend/ai/tests/unit/tools/`, `backend/ai/tests/unit/operations/`, `backend/ai/tests/unit/integrations/workspace/`, `backend/ai/tests/unit/integrations/geometry/`, `backend/ai/tests/integration/operations/` |
| 03 API and persistence | `backend/ai/src/skullfix_ai/api/`, `backend/ai/src/skullfix_ai/storage/` | `backend/ai/tests/unit/api/`, `backend/ai/tests/unit/storage/`, `backend/ai/tests/integration/api/`, `backend/ai/tests/integration/storage/` |
| 04 Cross-component tests and evaluation | none | `backend/ai/tests/integration/workflows/`, `backend/ai/tests/live/`, `backend/ai/evaluation/` |
| Main integrating agent | `backend/ai/src/skullfix_ai/schemas/`, dependency wiring, `features/ai-workspace-assistant/preflight.md` | `backend/ai/tests/conftest.py`, `backend/ai/tests/helpers/`, and the pytest or project test configuration at `backend/ai/` |

## Coordination

- Agents 01–03 write a failing test in their own test paths before implementing the requirement it covers.
- Agent 02 implements the reconstruction adapter and the labeled mock, including R14, R20–R22, and S9–S10 at that boundary. The mock does not wait for a measurement contract. Agent 04 verifies S9 and S10 only where they cross components. Agent 04 does not implement the mock and does not replace agent 02's tests.
- Agent 04 tests cross-component behavior, acceptance scenarios, and evaluation criteria. It does not replace those component tests.
- The main agent assigns each preflight record before delegation. An agent edits only its own record. If the task grows, update that record. Do not create a record for a coding task that does not exist yet.
- Agents may add fixtures only inside their assigned test directories. A change to `backend/ai/tests/conftest.py` or `backend/ai/tests/helpers/` goes through the main agent.
- No agent edits another agent's files at the same time. Report a defect to the owner, or agree an explicit handoff before editing.
- Agree the expected behavior of a `tests/integration/workflows/` test with the owners it depends on before those owners implement that behavior.
- Live provider checks live only in `backend/ai/tests/live/`. They are opt-in and must not run as part of the deterministic unit or integration suite.
