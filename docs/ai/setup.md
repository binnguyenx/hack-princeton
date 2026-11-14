# AI backend setup

`backend/ai` is a scaffold, not a running service. There is no FastAPI service, Bedrock integration, persistence, or working reconstruction. Do not add credentials to git. Application code waits until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Accepting one of those files is not acceptance of the other. After both are accepted, write `plan.md` and implement. A separate plan approval is not required unless the owner asks.

[preflight.md](../../features/ai-workspace-assistant/preflight.md) is the per-task checklist filled before coding. It does not itself authorize implementation, and it is not another approval gate. This setup file is the guide for environment, configuration, how to run, and how to check the project. Before each coding task, read the intent and spec and fill the record the main agent assigns under `features/ai-workspace-assistant/preflights/`.

## Local target

- Python 3.11 or newer, once the service starts.
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

There is no test command yet. When one exists, record it in `AGENTS.md` with what a healthy run looks like. `tests/live/` stays empty and must not be described as passing. There is no lint command.
