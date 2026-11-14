# Plan: T2 live foreground-volume measurement

Spec: [spec.md](../spec.md) · Status: done · Date: 2026-11-14

Contract: [docs/ai/contracts.md](../../../docs/ai/contracts.md) foreground-volume · Decision record: [t1c-measurement-contract.md](t1c-measurement-contract.md)

## Scope and authorization

Owner authorized T2 implementation within the accepted T1C measurement scope after canonical fold-in. No new scope or contract decision. Separate plan approval not required. Do not commit or push. Stop after T2.

In scope: live `ForegroundVolumeService(ApplicationRepository)`, mechanical POST/GET measurement routes, additive live persistence, exact accepted NRRD/grid/hash/idempotency/error semantics, AT/S51–S58 scenarios.

Out of scope: LangGraph tool bind, Chat UI, AI mutations, Bedrock/AWS, sandbox OperationService enablement, geometry revision creation, volume-byte modification, edit/inspect/compare/reconstruction.

## Files that change

- `backend/ai/src/skullfix_ai/application/foreground_volume.py` — command, NRRD/grid/hash/count, claim/wait/complete orchestration, public envelope (R70–R75, R78–R79).
- `backend/ai/src/skullfix_ai/application/sqlite.py` — additive `measurement_request_reservations` + `candidate_measurement_results`; claim/complete/list helpers; no seven-table rewrite (R76).
- `backend/ai/src/skullfix_ai/api/routes/measurements.py` + `api/app.py` — POST `/api/candidates/{id}/measurements`, GET `/api/candidates/{id}/revisions/{revision_id}/measurements` (R76–R77).
- `backend/ai/tests/integration/api/test_measurements.py` — AT-01–AT-18 / S51–S58 on disposable roots; `test_app.py` router inventory.
- Docs: this plan, preflight, spec Where-it-lives/runtime note, contracts runtime line, work-summary, project index, intent amendment, setup/app-integration, AGENTS inventory.

## Order (TDD)

1. Expand failing HTTP acceptance tests for volume math, encoding, unsupported inputs, integrity, stale completion, placement invariance, history isolation, idempotent replay, conflict, in-progress wait, crash reconciliation.
2. Implement repository persistence + service + routes until green.
3. Run focused measurement tests, surrounding API/application regressions, full `run_checks.py`, feature checker, `git diff --check`.
4. Close: update docs with actual counts; mark this plan done.

## Design notes

- Canonical identity: sorted JSON of path kind + project/case/candidate + expected revision + operation/measure/method → `sha256:`+hex (opaque; not volume hash).
- Claim/check in short `BEGIN IMMEDIATE`, commit before decode. Completed equivalent → stored result before freshness. In-progress → ≤2000 ms / ≤50 ms poll then nonterminal `request-in-progress`. Incomplete crash fixture → `reconciliation-required`. No ownership steal.
- Completion: one `BEGIN IMMEDIATE` inserts measurement row, marks reservation completed, re-checks `currentRevisionId == expected_revision_id`; mismatch → `stale` / no success row.
- Integrity failure HTTP 500 / domain `failed`; unsupported 422; coordination 409 with `{error:{code,message,details}}`. Public errors omit paths.
- Measurement must not call placement/voxel commit paths or rewrite volume bytes.

## Risks

- Do not reuse binary-mask `decode_binary_nrrd` max-value≤1 rule for labelmaps.
- Do not reuse package `read_revision_volume` 409 integrity mapping for the measurement integrity contract (500 / `artifact-integrity-failure`).
- Keep sandbox OperationService measurement unavailable.
- Preserve unrelated dirty working-tree files.

## Proof commands

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B -m unittest backend.ai.tests.integration.api.test_measurements -v
PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py .
git diff --check
```

## Verification evidence

- Focused measurement suite: 15/15 OK (disposable roots only).
- Full Python runner: 157 tests OK.
- Feature checker and `git diff --check`: see Close below.

## Deviations

- Terminal unsupported/failed/stale outcomes finish the reservation as `completed` with a stored envelope and **no** `candidate_measurement_results` success row (retries replay that terminal outcome; not a silent success). Crash-style `incomplete` remains only for AT-18 / `reconciliation-required`.
- Router inventory expectation in `test_app.py` updated for the two new measurement routes.

## Close result

Needs your decision: none for T2 scope. LangGraph bind / Chat UI / AI mutation remain explicitly deferred.

Checks (re-run at Close):
- `unittest …test_measurements -v`: Ran 15 tests / OK
- `run_checks.py`: Ran 157 tests / OK
- `check_features.py .`: 4 feature(s), 0 error(s), 0 warning(s)
- `git diff --check`: clean (exit 0)

Docs updated: intent amendment, spec Where-it-lives + Last updated 2026-11-14 + flags/open Q1, contracts runtime, work-summary, project index, setup/app-integration notes, AGENTS inventory, this plan (status done + Deviations), preflight verified.
