# Backend migration and LangGraph work summary

## Current verified implementation

The owner authorized coordinated execution through fake-model LangGraph. Existing work was preserved; no commit, push, PR or merge occurred. Overall intent/spec remain draft for unresolved proposals.

- T01: actual Express route inventory verification and decision sheet. Under delegated optimization, migration preserves the Express baseline; proposed D1–D5 hardening is not silently applied or marked approved.
- T02: explicit-root Python ApplicationRepository preserving the existing seven-table app schema, NRRD files, hashes, metadata, transform history and pointer restore. Separate from sandbox SQLiteApplicationStorage. Fourteen repository tests include transaction/cleanup failure baselines. Node-created disposable copies were read/mutated in Python and reopened/written by Node.
- T03: opt-in FastAPI factory and explicit-root CLI; all13 UI routes, threadpool repository calls, multipart and JSON/error baseline parity. Compressed JSON supports gzip/deflate/br/zstd with decoded10MiB enforcement; multipart filename fallback matches Multer. Both actual route inventories verified.
- T04: default FastAPI Vite proxy with HACK_API_ORIGIN override, frontend-only preview, FastAPI built static/SPA serving with API precedence. Actual Chrome browser workflow and restart checked in dev and built modes.
- T05: disposable copied-data S13 Express→FastAPI→Express→FastAPI passed, preserving state/bytes and continued writes at every handoff. Live cutover completed after explicit approval, verified baseline backup and full30-minute observation.
- T06: complete after the actual observation gate. Active app Express/Multer and old Node backend removed; clean install/current regression/browser evidence passed. Independent old runtime and backups retained7days.
- T07/T08: genuine compiled LangGraph, fake model, repository-backed context, typed registry, grounded explanations, unavailable capabilities and invalid proposals/outputs rejected. Optional reconstruction delegates to the existing OperationService and uses isolated sandbox identities/storage. No live AI mutation.
- T09: available-scope integration acceptance passed. Live/removal acceptance is now complete.

## Verification

- Python runner:105 tests passed (64 legacy +17 application/backup/frozenNode +13 API/static/fault +11 graph).
- Current app suite:45 tests passed across16 files without Express/Multer. Earlier74-test cross-runtime/S13 proof remains in the external runtime archive; frozen Node fixture and Python/FastAPI replacements preserve current compatibility/fault coverage.
- Chrome browser:3 tests passed: dev proxy, built frontend/FastAPI and frontend-only preview. Real UI project/case/preparedNRRD import/candidate/transform/restore/reload plus binary integrity, API errors and backend restart.
- Build/type checks passed. Lint returned success with2 existing warnings (nrrdImport unused import and App useMemo dependency); existing Node engine/native-config/SQLite and bundle-size warnings are not claimed fixed.
- Python editable install passed in isolated environment. See features/express-to-fastapi/execution-evidence.md for exact commands and review limits.

## Exact live-writer state

FastAPI is the sole live writer at http://127.0.0.1:8000, PID54643, root `/Users/minhtrietnguyen/Desktop/hack princeton/hack-princeton/data/storage`. No old database was found; initial absence and verified empty baseline are recorded. Labeled verification data remains and survives restart. Default dev routes to FastAPI; Express/Multer are removed from active app. Full30-minute monitoring passed; recovery directory `/Users/minhtrietnguyen/Desktop/hack princeton/migration-recovery/20261114-090600-0500` is retained at least until 2026-11-21T09:44:21.807695-05:00. No commit/push.

## Remaining boundaries

D1–D5 hardening proposals remain recorded in decision-sheet.md. Completed live execution and rollback/retention instructions are in cutover-completion.md and live-cutover-runbook.md. Bedrock/provider calls, SSE, graph checkpoints/resume, proposed pre-model recovery, generated-NRRD publication and live AI mutations remain unavailable. Synthetic reconstruction JSON is not NRRD or clinical output.

Task ownership, dependencies, evidence and status: features/express-to-fastapi/task-board.md. Historical handoff retained at history/pre-queue-summary-2026-11-14.md.

## Publication integration with latest upstream UI

The reviewed publication integrates latest main d9bd21d (Radix management + Cross-reference Workbench), preserving production UI and dependencies. It adds transactional fixes for concurrent revision-order allocation and deletion volume capture, with regression reds then greens. Current combined verification is107 Python tests,87 app tests across33 files and5 actual Chrome tests; build/type pass; lint has8 existing upstream warnings and no new errors. Earlier105/45/3 cutover counts remain historical evidence of that local operation, not the current merged UI suite.

Four dependent feature PRs cover application storage/backup, FastAPI migration/browser integration, fake-model LangGraph, and final docs/agents. Publication review details are in features/express-to-fastapi/preflights/publication-review.md. No GitHub merge is authorized. Local runtime PIDs in the cutover record are historical and may change on restart; recovery data and live application storage stay outside Git.
