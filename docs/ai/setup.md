# AI backend setup

`backend/ai` is not a running service. One small slice exists: `execute_operation` returns `unavailable` when the operation has no agreed contract. The unit test for that return is below. There is no FastAPI service, Bedrock integration, persistence, or working reconstruction. Do not add credentials to git. Further application code waits until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Accepting one of those files is not acceptance of the other. After both are accepted, write `plan.md` and implement. A separate plan approval is not required unless the owner asks.

[preflight.md](../../features/ai-workspace-assistant/preflight.md) is the per-task checklist filled before coding. It does not itself authorize implementation, and it is not another approval gate. This setup file is the guide for environment, configuration, how to run, and how to check the project. Before each coding task, read the intent and spec and fill the record the main agent assigns under `features/ai-workspace-assistant/preflights/`.

## Local target

- Python 3.11 or newer for the service. The current unit test runs with the local `python3`.
- A local FastAPI process.
- Two SQLite files under a local data directory: application rows, and LangGraph checkpoints.
- An artifact directory for geometry files referenced by revision rows.
- Amazon Bedrock credentials in the environment, not in the repo.
- LangSmith off unless `LANGSMITH_TRACING=true` and a key are set locally.

## Configuration

Copy `backend/ai/.env.example` to `backend/ai/.env` when implementation starts. `.env` must stay untracked. Empty values in the example are intentional.

Required before a live model call:

- `SKULLFIX_AI_MODEL_ID`: a Claude Sonnet model id enabled on the team's Bedrock account. This doc does not guess that id.
- `AWS_REGION`
- AWS credentials supplied by the local environment or an AWS profile. The example leaves the key fields empty.

Required before a live geometry or workspace call:

- `SKULLFIX_WORKSPACE_BASE_URL` and `SKULLFIX_GEOMETRY_BASE_URL`, or an in-process wiring choice recorded in `docs/ai/contracts.md`.

## Checks

From the repo root:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
```

A healthy run prints `Ran 1 test` and `OK`. The test checks status `unavailable`, reason `operation-contract-missing`, and `value` `None` for `measure.candidate` when no agreed contract is passed in. It does not prove that nothing was written to a database, does not show that all of S6 is done, and is not an integration test or real geometry.

The same command and healthy-run sign are in `AGENTS.md`. `tests/live/` stays empty and must not be described as passing. There is no lint command.
