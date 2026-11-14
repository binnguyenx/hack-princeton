# AI/backend publication status

This branch implements synchronous sandbox operation service and replaceable reconstruction mock. It is an isolated Python foundation; the shipped TypeScript app remains authoritative for live UI projects and candidates. No Python demo record is a live UI record.

Implemented here: schemas and fixtures, SQLite storage/artifacts, operation service and reconstruction mock. Still deferred: live workspace integration, API transport, graphs and models. Reconstruction mock output, when available, is synthetic and is not NRRD reconstruction. Proposed R35–R39 recovery behavior and real operation contracts are not accepted by this publication.

## Verification

Install Python 3.11+ and run `python3 -m pip install -e backend/ai`. From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
```

Expected: 59 tests and OK. No AWS/network calls are required. Tests verify only this slice and its prerequisites, not API/SSE, models, real geometry, or automatic recovery.
