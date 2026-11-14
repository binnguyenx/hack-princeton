# Publication slice 3: Repository-backed fake-model LangGraph and typed workspace tools

This branch publishes application repository, frozen Node-created data compatibility, transactional revision/cascade coordination, and paired SQLite/volume backups, FastAPI13 routes, shared HTTP contracts, default dev proxy, built serving and actual Chrome journeys, genuine LangGraph with a fake model, typed tools and isolated sandbox reconstruction. Deferred here: providers, checkpoints, SSE, real geometry and live AI mutation. The completed local cutover records and consolidated agent documentation arrive in the final documentation PR; they do not imply that missing code exists in this intermediate branch.

Python ApplicationRepository targets the actual seven-table UI model and NRRD files. SQLiteApplicationStorage remains an isolated sandbox and must not open app-model.sqlite. Current baseline contracts are preserved; proposed D1–D5 hardening and pre-model recovery are not inferred accepted. Intent/spec stay separate.

## Verification

Install Python3.11+ in an isolated environment and run `python3 -m pip install -e backend/ai` with the test extra (`backend/ai[test]`) for API tests.

From repo root: `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py` → 107 tests/OK. No AWS/provider call is required.

Install app dependencies with cd app && npm ci. Set SKULLFIX_PYTHON to the installed interpreter, then run npm test, npm run build and npm run test:browser from app/. Existing upstream UI tests and both canvas journeys are retained. To start the built app, install backend dependencies into repo .venv, build, then cd app && npm start. Dev proxies /api to FastAPI(default8000); preview is frontend-only. Every test uses disposable roots. Do not run test scenarios on live data.

The frontend remains current upstream Radix management/Cross-reference Workbench. Application backend authority is FastAPI/ApplicationRepository; no separate AI HTTP backend.
