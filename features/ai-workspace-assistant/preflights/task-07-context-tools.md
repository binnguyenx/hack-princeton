# Preflight: Task 07 authoritative context and tool boundary

Date: 2026-11-14 · Owner: langgraph agent · Status: done (scoped verification)

## Scope and authorization

The owner explicitly authorized the nine-task queue, including read-only LangGraph preparation. This record does not accept the full draft spec or R35–R39 recovery proposals. Read AGENTS.md, docs/ai/workflow.md, intent/spec, app-integration.md, workspace models/adapter, operation service, migration plan and current tests. Preserve other agents' and pre-existing work.

## Requirements and boundary

R2–R7, R9, R20–R22, R32–R34, R58–R63 apply. Load authoritative application context through a repository reader and AppWorkspaceAdapter. Preserve source ownership, spatial metadata, raw hashes, poses and restored currentRevisionId. Register typed read-only context inspection and unavailable real geometry capabilities. No graph path may mutate live application data. Optional mock generation requires an explicit isolated sandbox binding and the existing OperationService.

## Files and proof

Own agent/, tools/, tests/integration/agent/ and the two task records plus plans/langgraph-fake-model.md. Shared schemas/config/dependencies/docs and application repository remain coordinator-owned. Tests use a real disposable application repository once available, plus existing canonical sandbox fixtures for mock execution. Run PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B -m unittest discover -s backend/ai/tests/integration/agent -v.

## Risks and decisions

Workspace Pydantic validation intentionally rejects legacy malformed records; the graph fails explicitly instead of rewriting records. Model output is untrusted. Only validated registered tools execute. No pending retry lifecycle, live mutation, measurements, SSE, Bedrock or checkpoint persistence is introduced.

## Evidence and review

- Genuine LangGraph 1.2.22 installed by the coordinator in the isolated implementation virtualenv; no substitute graph runner.
- Focused command: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src /private/tmp/hp-implementation-venv/bin/python -B -m unittest discover -s backend/ai/tests/integration/agent -v`: 11 tests passed.
- Existing deterministic runner through the same interpreter: 64 tests passed, including sandbox guard regressions.
- Feature checker: 0 errors, 2 pre-existing editor warnings. `git diff --check`: passed.
- Red evidence: initial acceptance test failed because graph exports were still scaffold-only (`/tmp/hp-graph-red.log`). Invalid-output regression then reproduced an explanation KeyError (`/tmp/hp-graph-failure-red.log`); output validation now rejects it with `tool-output-invalid`.
- Diff review: owned changes implement typed registered selection, authoritative fresh context, five-step graph and grounded outcomes only. Real application repository tests cover restored pointer, spatial metadata/hash and unchanged application manifest. Sandbox integration delegates to the existing operation service, persists only synthetic sandbox artifacts and retains shared result/provenance/limitations.
- No application mutation API, graph checkpoint store, provider call, geometry method, proposed recovery or D1–D5 decision was implemented. The graph is an in-process library, not a second HTTP backend. Coordinator owns final setup/spec/work-summary integration.

Final boundary review: contour-guided generation is absent from the registry and reports unsupported (R15), rather than advertising an unavailable real capability. Regression red state captured at `/tmp/hp-graph-contour-red.log`; corrected behavior passes. Model input cannot supply a callable or override live/sandbox identities; default metadata execution has no repository writer reference, and the optional sandbox executor delegates to the existing service with composition-bound sandbox identities.
