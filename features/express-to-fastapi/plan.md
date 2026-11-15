# Plan: Remove the Node application runtime

Spec: [spec.md](spec.md) · Status: done · Date:2026-11-14

> Historical: describes how this runtime consolidation was built. For current behavior, read spec.md.

## Approach

Use the already registered FastAPI application as the compatibility authority. First add FastAPI and browser-client tests that fail against the current mock chat path, then replace the panel client. Keep existing FastAPI route tests and add inventory/ownership checks where needed. Delete the Node server, its tests, and dependencies only after no application path imports them.

## Files that change

- `app/src/api/chat.ts` (new): typed same-origin read-only chat client. (R37)
- `app/src/ui/AiChatPanel.tsx` (modified): submit current workspace context through the typed FastAPI client and render its result. (R37)
- `app/src/ai/langGraphClient.ts` (deleted): separate-server and fabricated-response path. (R37)
- `app/tests/ui/aiChatPanel.test.tsx` and chat-client tests (modified/new): FastAPI request and outcome/limitation rendering at the browser seam. (R37)
- `backend/ai/tests/integration/api/test_app.py` and focused FastAPI API tests (modified): route inventory and repository-backed API coverage. (R1, R2, R35, R38)
- `app/server/`, `app/vite-api-plugin.ts`, `app/tests/backendApi.test.ts`, `app/tests/backendCrud.test.ts`, `app/tests/aiWorkspaceContract.test.ts` (deleted or replaced): remaining Node application runtime and Node-only proofs. (R36)
- `app/package.json`, `app/package-lock.json`, `app/vite.config.ts` (modified only as needed): remove Express/Multer and preserve FastAPI proxy plus frontend tooling. (R18, R26, R27, R29, R36)
- `docs/ai/app-integration.md`, `docs/ai/setup.md`, `docs/project.md`, feature specs and this plan (modified): correct stale runtime claims and record the shipped boundary. (R35–R38)

## Order of work

1. Add a failing typed-client/panel test that expects one `/api/ai/chat` request, active context, and returned limitations; run it to confirm the current mock client fails for that reason.
2. Implement the typed chat client and migrate the panel without adding streaming, persistence, provider wiring, or mutations; run focused frontend tests.
3. Strengthen FastAPI route-inventory and repository-backed API proofs for the full R35 inventory; run focused Python API tests.
4. Replace Node-backed cross-runtime coverage with FastAPI-backed coverage where it proves an active contract, then remove the Node server, Vite middleware plugin, Node server tests, and Express/Multer dependencies.
5. Run source/dependency checks, frontend build/tests, FastAPI tests, and sandbox separation tests. Update docs and Close report.

## Risks

- Deleting Node code could remove a route that only a test or hidden frontend call uses. The explicit R35 inventory and route-inventory test run before deletion guard this.
- The panel currently lacks all request context. Its parent must supply the authoritative project/case/selection/revision values; no guessed ids or synthetic clinical response is allowed.
- Existing uncommitted Vite/test configuration changes belong to the user. Preserve them unless required for this scope and report any necessary overlap.
- Historical docs overstate Express removal. Do not use them as test evidence; executable FastAPI tests and actual imports decide completion.

## Proof

- R1, R2, R35, R38: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/api/test_app.py` and the focused route modules under `backend/ai/tests/integration/api/`.
- R3–R17, R21–R25: `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py`.
- R18, R26, R27, R29, R36: `cd app && npm test && npm run build`, plus `rg -n 'express|multer|createApiRouter|vite-api-plugin|app/server' app/package.json app/package-lock.json app/src app/tests app/vite.config.ts` returning no runtime references.
- R28, R35: FastAPI built-frontend integration checks in `backend/ai/tests/integration/api/test_app.py` and `cd app && npm run test:browser` after build.
- R37: focused chat client/panel tests plus `cd app && npm test -- tests/ui/aiChatPanel.test.tsx`.
- S1–S5: all commands above, with temporary storage roots only.

## Deviations

- The checked-in `.venv` uses Python 3.9 and cannot install the backend's Python ≥3.11 dependencies. Verification used a disposable Python 3.14 environment under `/private/tmp`; no application storage or repository files were written there.
