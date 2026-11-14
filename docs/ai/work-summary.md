# AI/backend work summary

## Live app authority (current)

The UI's Express backend and data/storage/app-model.sqlite are authoritative for live projects, cases, samples, candidates and revisions. The Python SQLite/operation-service/mock implementation below is an isolated demo, not a second app writer. AppWorkspaceAdapter and HttpAppManifestReader read the actual ProjectManifest contract; schemas/workspace.py preserves its hierarchy, camelCase spatial metadata, raw volume hashes and flat pose. Live AI mutations remain disabled. See [app-integration.md](app-integration.md) for implemented routes, mismatches, fixes and LangGraph readiness.


This summarizes the local checkout after the operation-service continuation. No commit, push, PR, or merge was performed by this continuation.

## Implemented

- Shared Pydantic schemas for common types, spatial references, artifacts, requests, canonical mock commands, results, and event payloads.
- Deterministic synthetic cases/artifacts and acceptance scenarios. Public artifacts use retrieval_url, commands retain full selection references, and AF-17 describes adapter substitution separately from AF-12.
- SQLite application storage schema version 2, with in-place version-1 migration, immutable revisions, atomic child/current-pointer commits, review history, request reservations, and runs.
- Local artifacts with hash verification, path containment, durable cleanup claims, and explicit reconciliation.
- Accepted-to-stale run termination and regression protection for deleted source/candidate artifacts.
- A synchronous OperationService with direct-request normalization and the canonical command seam for future AI tools.
- An injectable pre-commit reconstruction adapter contract and DeterministicReconstructionMock. Output is synthetic JSON, not a reconstruction mesh.
- Canonical run ownership, duplicate/conflict handling, persisted outcomes, sanitized failures, pre-publication adapter validation, and conservative commit-uncertainty handling.

## Verification

Run `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py` from the repo root. All 59 tests pass: artifacts 4, SQLite 14, schemas 12, fixture integrity 11, legacy operation seam 1, mock adapter 1, operation service 16. The feature checker reports zero errors/warnings and git diff --check passes. No repository lint command is configured.

## Limits and remaining work

There is no API/SSE transport, HTTP artifact retrieval, workspace adapter facade, tool registry, LangGraph/checkpoint integration, LangChain/Bedrock, real reconstruction, or real geometry operation. Event schemas alone are not transport. No clinical or geometry-quality result is claimed.

R35–R39 and S21–S24 remain proposed pre-model request/recovery behavior. Canonical operation run claims do not implement that proposal or promise exactly-once external execution. A known active owner is not replayed. Committed or uncertain mutations whose outcome bookkeeping failed require explicit reconciliation, not blind retry. An unrecorded generated file is identifiable through persisted failed-run artifact metadata when storage is available.

## Next slice

A read-only LangGraph with a fake model can use AppWorkspaceAdapter and the live app manifest, after a dedicated plan/preflight and tool facade. The Python mock operation service stays sandbox-only. Do not wire it to UI candidates. Live AI mutation still needs app-side atomic revision/idempotency and generated-NRRD publication contracts. No graph or model code was added by this alignment.

## Plans and ownership

The current plan.md is the completed operation-service/mock slice. Earlier fixture, schema, and storage plans remain under plans/. Main agent completed the handoff within the existing ownership boundaries; no subagents were started. Intent/spec remain separate and overall draft only for outstanding proposals, with accepted implementation scope recorded explicitly.

## Historical branch references

The branch/PR references below are retained from the earlier handoff and were not remotely verified or updated in this continuation:


1. `feat/ai-backend-foundation`, base `main`. Foundation draft PR: https://github.com/binnguyenx/hack-princeton/pull/3. Scaffold, docs, draft intent and spec, workflow, preflight template, and assignments. No operation code.
2. `feat/ai-missing-contract-result`, based on the branch above. Slice draft PR: https://github.com/binnguyenx/hack-princeton/pull/4. Adds the missing-contract result, the R7/S6 record, the test command, and this summary.

Review and merge the foundation PR first, then the slice PR. The slice PR does not repeat the foundation diff because its base is the foundation branch. Neither branch is on `main`.

## UI contract alignment

Added schemas/workspace.py, a GET-only HTTP manifest reader, ownership/freshness-aware context resolution, and a sandbox initializer guard. The app backend remains unchanged; its existing routes and restore behavior are canonical. The real cross-language HTTP proof runs in app/tests/aiWorkspaceContract.test.ts. Python now has 64 deterministic tests; the app suite has 42 tests. Build and lint run against locked app dependencies; lint reports existing warnings, not a clean-warning claim.
