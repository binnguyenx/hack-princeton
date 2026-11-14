# Publication slice 1: Python application repository and verified paired backups

This branch publishes application repository, frozen Node-created data compatibility, transactional revision/cascade coordination, and paired SQLite/volume backups. Deferred here: FastAPI transport, frontend cutover, graph, providers and live AI mutation. The completed local cutover records and consolidated agent documentation arrive in the final documentation PR; they do not imply that missing code exists in this intermediate branch.

Python ApplicationRepository targets the actual seven-table UI model and NRRD files. SQLiteApplicationStorage remains an isolated sandbox and must not open app-model.sqlite. Current baseline contracts are preserved; proposed D1–D5 hardening and pre-model recovery are not inferred accepted. Intent/spec stay separate.

## Verification

Install Python3.11+ in an isolated environment and run `python3 -m pip install -e backend/ai`.

From repo root: `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py` → 83 tests/OK. No AWS/provider call is required.
