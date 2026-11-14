# Archived plan: SQLite storage and local artifacts

Status: completed and verified on 2026-11-14.

This record preserves the completed storage plan that preceded the operation-service slice. The active plan remains `../plan.md`.

## Delivered scope

- R42, R43: focused application-storage/artifact interfaces and explicit domain errors.
- R44, S27, S34: SQLite schema version 1, initialization, referential integrity, case-scoped request reservation, and reopen persistence.
- R45, S28, S29, S30, S33: immutable candidate revision commits with atomic current-pointer updates and stale/cross-candidate rejection.
- R46, S31: revision-scoped review and measurement history.
- R47, R48, R49, S32: contained local artifact writes/resolution, SHA-256 verification, public references, and explicit non-authoritative reconciliation.

The implementation deliberately excluded operation orchestration, API/SSE transport, model/graph integration, real geometry, checkpoint storage, and proposed R35–R39 recovery behavior.

## Files delivered

- `backend/ai/src/skullfix_ai/storage/interfaces.py`
- `backend/ai/src/skullfix_ai/storage/sqlite.py`
- `backend/ai/src/skullfix_ai/storage/artifacts.py`
- `backend/ai/src/skullfix_ai/storage/__init__.py`
- `backend/ai/tests/unit/storage/test_local_artifacts.py`
- `backend/ai/tests/integration/storage/test_sqlite_storage.py`
- `backend/ai/tests/integration/storage/fixture_loader.py`

## Transaction boundaries

- SQLite transactions atomically validate and advance application authority.
- Artifact filesystem writes occur outside SQLite transactions.
- Failed/stale commits leave recorded artifacts non-authoritative for explicit reconciliation.
- LangGraph checkpoint state is not stored in this database.

## Verification history

The completed slice passed:

```text
test_local_artifacts.py: 4 tests
test_sqlite_storage.py: 8 tests
test_shared_schemas.py: 15 tests
test_demo_fixtures.py: 4 tests
test_missing_contract.py: 2 tests
feature-document checker: 0 errors, 0 warnings
git diff --check: clean
```

No lint command was configured. No LangGraph, Bedrock, API transport, geometry execution, commit, push, or pull-request work was performed.
