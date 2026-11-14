# AI/backend work summary

This file lives on `feat/ai-missing-contract-result`. It describes the AI workstream prepared so far, not what is on `main`. No pull request has been merged. The intent and spec remain draft.

## Goal and scope

The SkullFix AI/backend takes a selection and a request, calls a registered operation, and explains the tool result. This scope does not define the 3D frontend and does not assign an owner for a real geometry algorithm.

The real integration milestone is still: select a candidate, request one measurement, run the real operation, and show the result in the frontend. That milestone is not done.

## Structure created

- `backend/ai/src/skullfix_ai/`: scaffold for `api`, `schemas`, `agent`, `tools`, `operations`, `integrations/bedrock`, `integrations/workspace`, `integrations/geometry`, and `storage`.
- `backend/ai/tests/unit/`, `tests/integration/`, `tests/live/`, and `backend/ai/evaluation/`.
- `docs/ai/`: architecture, workflow, contracts, and setup.
- `features/ai-workspace-assistant/intent.md` and `spec.md`, kept as separate files.
- `features/ai-workspace-assistant/preflight.md` is the template. Per-task records live under `preflights/`.
- `.agents/assignments/ai/`: four briefs and the ownership table.
- `features/measure-candidate/` keeps the earlier draft, folded into the assistant. Do not implement it separately.
- `docs/project.md` and `AGENTS.md` add only the AI workflow exception and the feature index.

## Decisions already made

- Reconstruction may use a mock first, labeled `mock` or `test-double`, behind the geometry adapter. The mock does not wait for mechanical tools or a measurement contract, and it does not complete the real measurement milestone. Inspection, editing, and comparison are not expanded into the mock without their own contracts.
- The result schema is shared. The agent, API, and storage do not depend on fields that exist only on the mock. Swap an implementation by changing the adapter when the schema stays compatible. The `schemas/` package is still a scaffold.
- Intent and spec stay two separate Markdown files. They may be edited in one documentation round, but they are not merged into one file.
- Preflight is a checklist before coding: one record per task, one editor at a time. The checklist does not itself authorize implementation, and it is not an extra approval gate.
- After the user accepts both the intent and the spec, write the plan and implement. A separate plan approval is not required unless the user asks. There is no acceptance yet, so there is no `plan.md`.

## Code and tests that exist

Only on this branch. Not on `main`, and not on `feat/ai-backend-foundation`:

- `backend/ai/src/skullfix_ai/operations/execute.py`: `execute_operation` returns `unavailable`, reason `operation-contract-missing`, and `value` `None` when the operation id is not in the agreed set. The agreed-id branch raises `NotImplementedError` and has no test.
- `backend/ai/tests/unit/operations/test_missing_contract.py`: one unit test for those three fields.
- The record `features/ai-workspace-assistant/preflights/r7-s6-missing-contract.md`.
- `AGENTS.md` and `docs/ai/setup.md` record the test command for this slice.

There is no FastAPI service, Bedrock integration, persistence, or working reconstruction. The reconstruction mock has not been written.

## Not implemented, and contracts still open

There is no agreed contract for `measure.candidate`, `generate.candidate`, `inspect.candidate`, `edit.local`, or `compare.revisions`. `generate.candidate.from_contour` stays unavailable.

Still open: which measurement and which unit, which local edit, who mints ids, the artifact format and coordinate metadata, whether the workspace read is in-process or HTTP, and the Bedrock model id. Real geometry ownership is not assigned.

## Verification

On this branch, from the repo root:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
```

The latest run printed `Ran 1 test` and `OK`. The test checks only status, reason, and `value` `None`. It does not prove that nothing was written to a database, it does not complete all of S6, and it is not an integration test or real geometry.

`python3 .agents/skills/intent-spec-plan/scripts/check_features.py .` reported 2 features, 0 errors, and 0 warnings on both branches. `git diff --check` was clean.

## Branches and review order

1. `feat/ai-backend-foundation`, base `main`. Foundation draft PR: https://github.com/binnguyenx/hack-princeton/pull/3. Scaffold, docs, draft intent and spec, workflow, preflight template, and assignments. No operation code.
2. `feat/ai-missing-contract-result`, based on the branch above. Slice draft PR: https://github.com/binnguyenx/hack-princeton/pull/4. Adds the missing-contract result, the R7/S6 record, the test command, and this summary.

Review and merge the foundation PR first, then the slice PR. The slice PR does not repeat the foundation diff because its base is the foundation branch. Neither branch is on `main`.
