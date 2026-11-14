# FastAPI recovery completion

## Intent
Restore the backend composition already referenced by main without changing any frontend file. The soft monochrome frontend recovery branch remains authoritative for UI. Keep Vite's local API plugin until parity and an explicit later cutover. This repair restores existing documented behavior; it does not accept the whole migration or AI specification.

## Requirements and preflight
- Initial investigation base: origin/main at 8bb2d6b. After owner confirmation of UI promotion via PR #28, rebased onto origin/main at 7cdb725. Owner authorizes commit, push and a backend-only PR; no merge, frontend changes, live storage, runtime restart or cutover.
- Restore missing settings, JSON/body helpers, 13-route application router and CLI; declare runtime dependencies for Python >=3.11.
- Keep existing placement, landmark, voxel, measurement and package services and tests.
- Verify projects CRUD/restart, API errors and actual CLI HTTP on disposable storage; include mechanical tests in the runner.
- Preserve the original dirty workspace. All repair changes live in an isolated worktree.

## Plan and task board
- B1: Restore import closure and dependency declarations. Owner coordinator. Acceptance: new recovery boot regression passes. Status: done.
- B2: Run all backend suites including mechanical routes; fix scoped composition failures. Depends B1. Status: done.
- B3: Prove CLI HTTP and clean dependency installation, document exact evidence. Depends B1. Status: done.
- U1: Sync restored UI after promotion. PR #28 is on main at 7cdb725; backend recovery rebased without frontend conflicts or edits. Status: done.
- U2: Additive mechanical UI controls and prior UI repair findings. Depends U1; separate frontend concern. Status: deferred.
- A1: Prior six AI/revision repair findings are not claimed fixed by boot recovery. Preserve original preflight/plan for a separate backend or additive-UI change as appropriate. Status: pending.

## Verification
Run `python -B backend/ai/tests/run_checks.py` from the repository root with the recovery environment. Launch `PYTHONPATH=backend/ai/src python -m skullfix_ai.api --storage-root <disposable> --host 127.0.0.1 --port <free-port>` and exercise projects CRUD/restart over HTTP. Never reuse the live port if occupied.

## Setup
From the repository root, use Python >=3.11:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e 'backend/ai[test]'
.venv/bin/python -B backend/ai/tests/run_checks.py
.venv/bin/python -B backend/ai/recovery/smoke_cli.py
PYTHONPATH=backend/ai/src .venv/bin/python -m skullfix_ai.api --storage-root /absolute/path/to/disposable-storage --host 127.0.0.1 --port 8000
```

Use port 8000 only when free; the smoke script uses an OS-assigned port and cleans up both processes and storage. Do not point this proof at user storage. No Node dependency or Vite configuration change is part of this backend repair.

## Evidence (2026-11-14)
- Red: the new boot regression failed on `ModuleNotFoundError: skullfix_ai.config` before repair.
- Green: clean Python 3.13.7 venv installation with declared dependencies succeeded; `pip check` reports no broken requirements.
- Backend runner: **136 tests passed**, including the previously omitted HTTP/mechanical suites and both new boot/read-only-chat regressions. Existing exact router inventory passes unchanged, covering the 13 compatibility routes plus mechanical/chat endpoints.
- Actual subprocess CLI/HTTP proof: projects GET/create, shutdown/restart, retained project read, continued writes and unknown API JSON all passed on disposable storage with OS-assigned loopback ports.
- Feature checker: 4 features, 0 errors, 0 warnings. `git diff --check`: passed.
- Diff review: all changed/new files are under `backend/ai`; no frontend files differ from this checkout's main base. Vite plugin and `app/server/*` are untouched.
- Verification uses only disposable storage. Owner now authorizes commit/push/PR publication after checks; no live runtime change or cutover.

## Compatibility and remaining work
The chat route required by the existing router-inventory contract was absent alongside the settings/JSON/CLI modules. Restoring it also required the existing graph's missing typed tool registry and metadata tool; these are justified backend composition dependencies, not new AI capabilities. The registry exposes only `workspace.describe_selection` to HTTP chat. Chat request IDs are correlation IDs here: there is no mutation execution, replay guarantee, checkpoint history or SSE contract in this recovery endpoint.

The restored shell's `AiChatPanel` uses `app/src/ai/langGraphClient.ts` (mock by default, optional LangGraph Server protocol). It does **not** call `/api/ai/chat`. This backend proof therefore does not claim UI chat integration or full Vite-to-FastAPI parity. Keep the plugin until an explicit subsequent compatibility/browser gate and cutover.

The recovery frontend was promoted through PR #28. Rebase onto that main completed without replaying old UI changes. Controls remain deferred to a separate additive UI change, preserving the studio, grid, slices and Assistant column. The previous six review findings remain pending in the preserved original workspace's repair plan; this scoped boot repair does not claim them resolved.

## Close
Existing behavior restoration: the request explicitly scopes code to `backend/ai`, so recovery intent/requirements/preflight/plan/evidence are recorded together here rather than editing root feature or setup documents outside that boundary. Intent/spec approval states are unchanged. Backend composition acceptance passed; frontend integration and Vite cutover remain separate future changes. No human decision is requested by this repair.
