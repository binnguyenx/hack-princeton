# AI workstream workflow

## Live app authority (current)

The FastAPI application and ApplicationRepository own live projects, cases, samples, candidates and revisions at data/storage/app-model.sqlite. Express was removed after the approved cutover/observation; the old runtime remains only in the external recovery archive. The Python SQLite/operation-service/mock implementation below is an isolated demo, not a second app writer. AppWorkspaceAdapter and HttpAppManifestReader read the actual ProjectManifest contract; schemas/workspace.py preserves its hierarchy, camelCase spatial metadata, raw volume hashes and flat pose. Live AI mutations remain disabled. See [app-integration.md](app-integration.md) for implemented routes, mismatches, fixes and LangGraph readiness.


This file applies only to `backend/ai`, `docs/ai/`, and `features/ai-workspace-assistant/`. Other features keep the gate between each document in `AGENTS.md`. The 3D frontend docs stay with that work.

`docs/ai/` explains this workflow and the adapter boundaries. Requirements live in `features/ai-workspace-assistant/intent.md` and `spec.md`. Do not copy requirements into this file.

## Major work

Intent and spec may be drafted or updated in the same documentation round. They stay separate files. Do not mark either `accepted` unless the AI owner says so. Confirming a decision in chat is not acceptance of the whole document.

1. Update the affected intent and spec. Stop for review.
2. After both are explicitly accepted, write `plan.md`, then implement and verify. Separate approval of the plan is not required unless the owner asks for it.
3. If the task changes accepted scope, behavior, or a shared contract, update the affected documents and obtain acceptance before implementing the changed requirements. Follow that same order. Do not treat the previous acceptance as approval of the new behavior.

A major task with no requirement basis stops. Draft the missing intent and spec first.

Mock choices inside an already accepted generate path do not need a new acceptance for each internal detail. The result must still be labeled `mock` or `test-double`.

## Current acceptance state

The owner has accepted the foundation scope recorded in `intent.md` and `spec.md`: backend authority and identifier ownership, the common mechanical/AI operation service, immutable revisions and atomic freshness checks, revision-scoped measurements and spatial metadata, request/run/conversation identity, the common result and terminal SSE envelope, checkpoint separation, and the replaceable reconstruction mock.

That acceptance does not include unresolved real measurement methods, artifact formats, browser execution, editing, inspection, comparison, contour guidance, or teammate approval of those interfaces. The two-fingerprint retry lifecycle in R35–R39 and S21–S24 is a new proposal pending review. A task that depends on that retry behavior remains blocked until it is reviewed.

The current plan.md is the completed operation-service/mock slice, including storage fixes and schema-v2 migration. Earlier plans remain under plans/. Graph/API/model tasks need their own plan and preflight; none may rely on the proposed recovery lifecycle before review.

## Small fixes

A bug that restores documented behavior, or a refactor that preserves it, may proceed after the preflight check. Verify the affected behavior. Do not add a feature document or an approval gate for that fix. API, schema, and new behavior are major work even when the diff is small.

## Preflight

[preflight.md](../../features/ai-workspace-assistant/preflight.md) is the shared template. The main agent maintains it. Before every implementation task, including a small fix, read the relevant intent and spec. The main agent assigns or agrees a record at `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. That record names one responsible agent, and only one editor changes it at a time. If investigation widens the task, update that same record. Do not create a record for a coding task that does not exist yet.

The checklist does not replace the intent, spec, or plan. It does not authorize coding by itself, and it is not another approval gate. Updating the intent or spec is required only when the task changes requirements or behavior.

## Build order inside this feature

The scaffold, shared request/command/result schemas, and authoritative sandbox storage/local artifact boundary now exist. The synchronous common operation service and reconstruction mock now exist. Direct requests and future AI-selected commands use the same canonical generation boundary. Within that isolated sandbox, its database is the only current-revision authority; LangGraph checkpoints and frontend optimistic state are not. The live UI continues to use its separate application database. After the service and adapter boundaries exist, two branches may proceed independently:

- A reconstruction mock for `generate.candidate`, using a provisional contract proposed by the AI workstream. It does not wait for mechanical tools or a measurement contract. Results are labeled `mock` or `test-double`, with assumptions and limitations written down. The output is not a real reconstruction.
- Real measurement of the current candidate revision, once `docs/ai/contracts.md` marks an agreed measurement contract. Until then the real operation returns `operation-contract-missing`.

The first real integration milestone remains: select a candidate, request a measurement, execute the real operation, and display the result in the frontend. A reconstruction mock does not complete that milestone.

Real inspection, one local edit, and comparison still require an agreed contract for that operation. Do not expand the mock to those operations.

Reference-contour-guided regeneration stays unsupported. Do not advertise a real capability from a provisional mock contract.

## Coding agents

Assignment briefs live in `.agents/assignments/ai/`. The index is [README.md](../../.agents/assignments/ai/README.md). Foundation acceptance, shared schemas, and application storage are recorded. Future tasks remain blocked on a suitable implementation plan, a task-specific preflight, and review of any proposed requirement they depend on. Completed plans do not authorize future API, graph, model, or real-adapter work. The checklist is not an approval gate.

Agents 01–03 own the tests for their code and write those failing tests before implementation. Agent 02 implements the reconstruction adapter and the labeled mock. Agent 04 owns `tests/integration/workflows/`, `tests/live/`, and `evaluation/` only, and verifies cross-component behavior of that mock without implementing it. The main agent owns `schemas/`, dependency wiring, root test configuration, `tests/conftest.py`, `tests/helpers/`, and the preflight template. Agents use those shared schemas. They do not publish a second result schema. No test directory has two owners. Live provider checks stay opt-in. Assigned agents do not edit the same files at the same time, including another agent's preflight record. They do not report a mock or test double as real geometry.

## Completed live migration

Read features/express-to-fastapi/cutover-completion.md for exact approved discovery, new empty baseline, backup/restore, full1800second monitoring, retained-data/restart and removal evidence. Active app requires no Express/Multer. Shared FastAPI contracts, actual browser checks, frozen Node data and Python HTTPfault/backup/repository/graph tests retain equivalent coverage. External backup/rollback runtime is retained7days. Full draft acceptance and pending hardening/recovery/provider/geometry requirements are not inferred.
