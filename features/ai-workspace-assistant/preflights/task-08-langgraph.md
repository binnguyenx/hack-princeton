# Preflight: Task 08 LangGraph with a fake model

Date: 2026-11-14 · Owner: langgraph agent · Status: done (scoped verification)

## Scope and authorization

The owner authorized a genuine LangGraph fake-model workflow within the nine-task queue. Intent/spec stay draft except their recorded scoped acceptance. Read Task 07 preflight and plans/langgraph-fake-model.md before implementation.

## Requirements and behavior inventory

R2–R7, R9, R20–R22, R32–R34, R58–R63: load context → propose a registered tool → validate → execute allowed capability → explain the actual result. Test unknown tools, invalid arguments, unavailable capabilities, adapter errors, context failures before the model, restored pointer/spatial preservation, fresh repository reads, and grounded explanations. Default graph is read-only; opt-in sandbox generation delegates to the existing shared OperationService and preserves mock provenance.

## Verification

Use genuine StateGraph.compile/invoke, fake model only, no network. Validate public result/graph behavior rather than internal private methods. Obtain red state, implement the smallest green slice, add failure/sandbox/repository slices and run the existing backend regressions. Coordinator owns dependencies and final graph/application wiring.

## Exclusions

No HTTP endpoint, provider integration, checkpoint persistence, live application writes, automatic recovery, geometry algorithms, candidate publication into the UI, or acceptance of D1–D5 is authorized by this graph slice.

## Evidence and review

- Genuine LangGraph 1.2.22 installed by the coordinator in the isolated implementation virtualenv; no substitute graph runner.
- Focused command: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src /private/tmp/hp-implementation-venv/bin/python -B -m unittest discover -s backend/ai/tests/integration/agent -v`: 11 tests passed.
- Existing deterministic runner through the same interpreter: 64 tests passed, including sandbox guard regressions.
- Feature checker: 0 errors, 2 pre-existing editor warnings. `git diff --check`: passed.
- Red evidence: initial acceptance test failed because graph exports were still scaffold-only (`/tmp/hp-graph-red.log`). Invalid-output regression then reproduced an explanation KeyError (`/tmp/hp-graph-failure-red.log`); output validation now rejects it with `tool-output-invalid`.
- Diff review: owned changes implement typed registered selection, authoritative fresh context, five-step graph and grounded outcomes only. Real application repository tests cover restored pointer, spatial metadata/hash and unchanged application manifest. Sandbox integration delegates to the existing operation service, persists only synthetic sandbox artifacts and retains shared result/provenance/limitations.
- No application mutation API, graph checkpoint store, provider call, geometry method, proposed recovery or D1–D5 decision was implemented. The graph is an in-process library, not a second HTTP backend. Coordinator owns final setup/spec/work-summary integration.

Final boundary review: contour-guided generation is absent from the registry and reports unsupported (R15), rather than advertising an unavailable real capability. Regression red state captured at `/tmp/hp-graph-contour-red.log`; corrected behavior passes. Model input cannot supply a callable or override live/sandbox identities; default metadata execution has no repository writer reference, and the optional sandbox executor delegates to the existing service with composition-bound sandbox identities.
