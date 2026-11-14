# Preflight: operation service and reconstruction mock

Date: 2026-11-14

## Intent

- Fix the two confirmed storage defects without weakening immutable authority.
- Add the synchronous application execution boundary required before API, graph, or model integration.
- Prove initial candidate generation with deterministic synthetic data and a replaceable adapter.

## Accepted scope

- R50–R57 and S35–S42 are authorized by the owner.
- Existing accepted R1–R34 and R40–R49 remain unchanged.
- R35–R39 and S21–S24 remain proposed and are not implemented.

## Repository evidence

- SQLite schema version 1 currently stores authority but does not coordinate cleanup with commit.
- `LocalArtifactStore.delete_non_authoritative` trusts a potentially stale `ArtifactRecord`.
- Artifact commit validation currently checks case membership but not lifecycle eligibility.
- Run transitions omit the valid pre-execution `accepted` to `stale` termination.
- Shared schemas already define the canonical reconstruction-mock command and completed/unsuccessful results.
- Existing fixtures provide cases, source anatomy, revision history, spatial metadata, artifacts, and canonical requests.
- No real reconstruction contract, API transport, graph, model, or checkpoint database is available.

## Risks and mitigations

- Filesystem and SQLite cannot be atomic: acquire a durable cleanup claim before deletion and keep reconciliation explicit.
- Version-1 databases must survive: migrate in place by adding the nullable claim column, then set version 2.
- Duplicate callers could both execute: claim canonical command ownership and create its run in one transaction.
- Commit can succeed before final result bookkeeping: preserve `ready-to-commit`, return reconciliation-required, and never blindly replay.
- Mock output could be mistaken for clinical geometry: embed explicit synthetic provenance and limitation.

## Planned verification

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/storage/test_local_artifacts.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/storage/test_sqlite_storage.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/integrations/geometry/test_reconstruction_mock.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/operations/test_operation_service.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/schemas/test_shared_schemas.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/workflows/test_demo_fixtures.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
python3 .agents/skills/intent-spec-plan/scripts/check_features.py .
git diff --check
```

## Approval

The owner explicitly authorized this slice and waived separate plan approval. No additional acceptance is inferred.

## Continuation and completed record

The owner requested that Codex inspect the Cursor handoff, finish this authorized slice, and test it. The handoff already contained schema-v2 storage changes, a reconstruction mock, and an unverified operation service. These were retained and completed; the baseline evidence above describes the start of the Cursor task, not the final state.

1. **Task and scope:** Finish R50–R57, storage regressions, operation-service integration tests, and documentation. No graph/API/model work.
2. **Documents read:** AGENTS.md, project/AI docs, intent/spec/plan, assignment boundaries, intent-spec-plan and TDD skills, storage/adapter/service code, schemas, fixtures, and tests.
3. **Requirements:** R50, R51, R52, R53, R54, R55, R56, R57; S35–S42, with regressions for existing schemas and fixtures.
4. **Classification:** Authorized implementation continuation and behavior-restoring fixes.
5. **Intent:** Existing mock-first/shared-operation goals remain unchanged.
6. **Spec/contracts:** Record the authorized service requirements and real transaction/recovery boundaries; keep R35–R39 proposed.
7. **Acceptance:** The current owner request explicitly authorizes completion and testing of this slice. It does not authorize graph, model, API, or real geometry.
8. **Dependencies:** Pydantic and standard-library SQLite/filesystem only. Synthetic fixtures and mock/test-double outputs only.
9. **Verification:** Failing tests reproduced invalid provenance publication, untracked failed-commit artifacts, source I/O escape, deleted-source publication, and commit-acknowledgement uncertainty before fixes. The full offline runner now passes 59 tests; docs checker and diff whitespace check pass.
10. **Conclusion:** This slice is complete. Future work needs a new task plan/preflight; proposed AI recovery and real geometry contracts remain unresolved.
