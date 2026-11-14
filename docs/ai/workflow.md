# AI workstream workflow

This file applies only to `backend/ai`, `docs/ai/`, and `features/ai-workspace-assistant/`. Other features keep the gate between each document in `AGENTS.md`. The 3D frontend docs stay with that work.

`docs/ai/` explains this workflow and the adapter boundaries. Requirements live in `features/ai-workspace-assistant/intent.md` and `spec.md`. Do not copy requirements into this file.

## Major work

Intent and spec may be drafted or updated in the same documentation round. They stay separate files. Do not mark either `accepted` unless the AI owner says so. Confirming a decision in chat is not acceptance of the whole document.

1. Update the affected intent and spec. Stop for review.
2. After both are explicitly accepted, write `plan.md`, then implement and verify. Separate approval of the plan is not required unless the owner asks for it.
3. If the task changes accepted scope, behavior, or a shared contract, update the affected documents and obtain acceptance before implementing the changed requirements. Follow that same order. Do not treat the previous acceptance as approval of the new behavior.

A major task with no requirement basis stops. Draft the missing intent and spec first.

Mock choices inside an already accepted generate path do not need a new acceptance for each internal detail. The result must still be labeled `mock` or `test-double`.

## Small fixes

A bug that restores documented behavior, or a refactor that preserves it, may proceed after the preflight check. Verify the affected behavior. Do not add a feature document or an approval gate for that fix. API, schema, and new behavior are major work even when the diff is small.

## Preflight

[preflight.md](../../features/ai-workspace-assistant/preflight.md) is the shared template. The main agent maintains it. Before every implementation task, including a small fix, read the relevant intent and spec. The main agent assigns or agrees a record at `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. That record names one responsible agent, and only one editor changes it at a time. If investigation widens the task, update that same record. Do not create a record for a coding task that does not exist yet.

The checklist does not replace the intent, spec, or plan. It does not authorize coding by itself, and it is not another approval gate. Updating the intent or spec is required only when the task changes requirements or behavior.

## Build order inside this feature

The scaffold, shared schemas, and adapter boundary come first. After those exist, two branches may proceed independently:

- A reconstruction mock for `generate.candidate`, using a provisional contract proposed by the AI workstream. It does not wait for mechanical tools or a measurement contract. Results are labeled `mock` or `test-double`, with assumptions and limitations written down. The output is not a real reconstruction.
- Real measurement of the current candidate revision, once `docs/ai/contracts.md` marks an agreed measurement contract. Until then the real operation returns `operation-contract-missing`.

The first real integration milestone remains: select a candidate, request a measurement, execute the real operation, and display the result in the frontend. A reconstruction mock does not complete that milestone.

Real inspection, one local edit, and comparison still require an agreed contract for that operation. Do not expand the mock to those operations.

Reference-contour-guided regeneration stays unsupported. Do not advertise a real capability from a provisional mock contract.

## Coding agents

Assignment briefs live in `.agents/assignments/ai/`. The index is [README.md](../../.agents/assignments/ai/README.md). They stay blocked until the intent and spec are explicitly accepted. Each brief requires the task's own preflight record before application code. The main agent assigns that path. The checklist is not an approval gate.

Agents 01–03 own the tests for their code and write those failing tests before implementation. Agent 02 implements the reconstruction adapter and the labeled mock. Agent 04 owns `tests/integration/workflows/`, `tests/live/`, and `evaluation/` only, and verifies cross-component behavior of that mock without implementing it. The main agent owns `schemas/`, dependency wiring, root test configuration, `tests/conftest.py`, `tests/helpers/`, and the preflight template. Agents use those shared schemas. They do not publish a second result schema. No test directory has two owners. Live provider checks stay opt-in. Assigned agents do not edit the same files at the same time, including another agent's preflight record. They do not report a mock or test double as real geometry.
