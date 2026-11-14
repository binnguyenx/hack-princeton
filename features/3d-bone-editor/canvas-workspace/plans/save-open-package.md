# Plan: Portable Save/Open Package

Spec: [spec.md](../spec.md) · Status: done · Date:2026-11-14

## Approach and scoped authorization

Owner authorized implementing Save/Open Package and routine choices without approval questions. Use a versioned ZIP around the app manifest plus NRRD files. FastAPI/ApplicationRepository stay authoritative; open creates a new copy rather than restoring over acknowledged writes. No whole-ledger acceptance, new dependency/schema, reconstruction or AI writes.

## Files that change

- application/packages.py: bounded ZIP codec, graph/hash/session validation, export/import orchestration and errors (R76–R79,R82).
- application/sqlite.py: consistent export read, staged immutable file import/transaction and candidate revision-volume read (R76,R78,R79,R83).
- api/routes/packages.py, api/app.py and inventory test: new explicit manual export/import/read endpoints (R76–R79,R83).
- app/src/api/packages.ts, api/client.ts: typed download/upload and immutable revision volume client (R80–R83).
- App.tsx, AppHeader.tsx, ProjectsHome.tsx, commands/registry.ts, dialogs/OpenPackageDialog.tsx, App.css: one guarded UI flow, file download/chooser, pending/errors/cancel and presentation hydration (R80–R82,R84).
- geometry/trustedDisplayMesh.ts and App mesh loading: content-bound trusted asset resolution and candidate-volume fallback (R83,R85).
- Backend HTTP/repository package tests, browser-safe client/asset/UI tests and actual Playwright package journeys (R76–R85).
- Separate canvas intent/spec, app-model deferral amendment, preflight, README/gap report, setup/work summary/project/AGENTS: current behavior and limits.

## Order and Proof

1. R76,R77: HTTP export red→codec/snapshot/route green. Test metadata/revision/source bytes/hash, corrupt/missing content and no writes.
2. R78,R79,R81,R82: import red→validate/remap/stage/commit green. Test collision-free reimport, wrong ownership/pointer/hash/paths/limits, rollback/cleanup and reopen persistence; unverified metadata and empty project cases.
3. R80,R81,R84: client/dialog reds→guarded download/import UI. Actual Chrome file round-trip, cancel/corrupt/failure/busy, restored pointers, restart and unchanged original project.
4. R83,R85: revision-volume ownership and trusted hash asset tests, including distinct revision content and wrong-name GLB fallback.
5. Full Python runner, SKULLFIX_PYTHON-backed app suite, build/typecheck, lint and actual browser suite; feature checker/diff/scope checks, docs and Close.

Commands: `.venv/bin/python -B backend/ai/tests/run_checks.py`; from app `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test`, `npm run build`, `npm run lint`, `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser`. All roots disposable.

## Risks and decisions

Zip files are untrusted; never extract supplied paths. Validate bounded metadata and hashes before storage; all new ids come from the server. Filesystem and SQLite are not one atomic resource; compensate caught failures and avoid claiming automatic crash recovery. Preserve restored pointers rather than selecting max order. Never label a successful server commit as rolled back when frontend hydration fails. View state and cached GLB cannot supersede authoritative volumes. Existing Node folder IO remains legacy; no browser imports of Node fs.

## Deviations

ProjectsHome.tsx already exposed a callback and needed wiring only in App.tsx. Review identified untracked management CRUD pending requests; App now counts them through authoritative hydration, blocks Save/Open synchronously, and blocks starting a management write during packaging. A held real browser case-create request reproduced the enabled-button defect before the fix. Existing broad dirty work was left intact; task-start hashes separate this slice. No package/dependency/schema changes outside the scoped plan.


## Verification evidence (2026-11-14)

Backend package suite:10 tests, including restored current pointer, remapped graph/shared volumes, bytes/hash/spatial/pose integrity, reopen/reimport, rollback after stage/publish/before commit, unsafe/duplicate/symlink/missing entries, invalid ownership/order/version and compressed/expanded/entry/JSON limits. Full backend runner:127 tests/OK. App:105 tests across43 files, including6 new package client/asset/dialog tests. Actual Chrome:12 journeys, including2 package journeys through real Vite proxy and built FastAPI serving. Held CRUD/export requests exercise synchronous pending/draft/shortcut guards; ZIP download/file chooser/new-copy rendering, hidden recovery, invalid input/cancel/export error, restart and committed-import/failed-hydration are verified. Existing chat/placement/selection/migration journeys remain green.

Build/typecheck passes; lint exit0 with8 inherited warnings and the existing bundle-size advisory. Feature checker:4 features,0 errors,0 warnings. git diff --check clean. Intent → R76–R85 → plan → task-scoped diff/test review passes; no stray feature or automatic acceptance of unrelated draft ledgers. Local screenshot of the reopened candidate/history was inspected.

Evidence logs: /tmp/hp-package-all-python.log, /tmp/hp-package-app-tests.log, /tmp/hp-package-all-browser.log, /tmp/hp-package-build.log, /tmp/hp-package-lint.log, /tmp/hp-package-feature-check.log. Task-start preservation review: /private/tmp/hp-package-scope-review.json. Red evidence includes missing export/import/UI modules, bool version coercion, and the held CRUD pending defect (/tmp/hp-package-crud-red.log).

Owned local FastAPI was quiesced, a paired DB/volume backup verified, and restarted on the same root/port with18 routes. Snapshot/table/volume/hash comparison after restart is identical; backup/rollback retention remains unchanged. Runtime evidence: /tmp/hp-package-runtime-reload.log and the external recovery registry. No package test writes used live storage. No commit/push.
