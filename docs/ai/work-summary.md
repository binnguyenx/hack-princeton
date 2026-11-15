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

## Read-only chat transport (2026-11-14)

POST /api/ai/chat connects the typed browser client to the genuine fake-model graph and authoritative mode=ro application snapshot. Only workspace.describe_selection is registered. Context preserves restored pointers, ownership, pose, spatial metadata and raw hashes. Request/conversation ids are transient correlation only. HTTP outcomes and limitations are explicit; no provider, sandbox tool, history or AI live writes. Chat panel is deferred; the client seam and actual browser dev/built transport are verified. Current slice evidence:112 backend tests,90 app tests,7 browser journeys (the two added chat journeys also pass focused). See plans/read-only-chat.md and setup.md.

## T1B read-only Chat UI + terminal status alignment (2026-11-14)

Inspector `ReadOnlyChatPanel` uses existing `chatClient` only. Transcript entries freeze the send-time target; pending is flight-scoped so an older aborted request’s `finally` cannot clear a newer flight. `conversation_id` is stable per `project_id`. HTTP/transport errors, HTTP-200 domain outcomes (`unsupported` / `unavailable` / `stale` / `failed`), and completed metadata reads stay distinct. Capability copy: reads metadata without mutation. Fake-read-only + limitations remain visible.

Shared-schema coordination: `GraphOutcome.status` is now a Literal matching `TerminalStatus` (including `unsupported`). Typed client `ChatOutcomeStatus` and UI domain-failure rendering accept the same set. Focused regression: HTTP-200 `unsupported` (unregistered tool proposal) serializes through `/api/ai/chat`, is accepted by `chatClient`, and renders as `.chat-bubble--domain-failure` (not transport alert).

Focused checks run this follow-up (actual):
- Backend `unittest …test_chat`: **6/6 pass**, including `test_unsupported_graph_outcome_serializes_as_http_200_domain_failure`.
- App focused Vitest (chatClient, lifecycle, useReadOnlyChat, ReadOnlyChatPanel, transcript, target): **6 files / 23 tests pass**; `tsc -b --noEmit` pass.
- Pending isolation: lifecycle `shouldDiscardInFlightResponse` + `releasePending` flight-id guard; hook test proves older flight `finally` cannot clear a newer pending flight.

**Not claimed / deferred:** mid-flight selection-change browser scenario — remains for the integration acceptance task. Environment polyfills (`Map.groupBy`, happy-dom) stay test-scoped. No AWS, geometry execution, automatic retries, or live AI mutations. No commit/push.

## Read-only chat and real manual placement follow-up

The owner authorized typed browser chat transport with the widget deferred, then defining/implementing a real mechanical tool. Chat now connects the same-origin client to FastAPI/LangGraph with a fixed metadata-only registry and a genuine read-only SQLite snapshot. A trigger-based regression prevents reuse of the old lazy-initializing getter; invalid/stale/cross-case/missing data and write instructions preserve application files.

The bounded mechanical capability is manual rigid placement of existing candidates, replacing the hard-coded8mm action. Numeric translation/rotation drafts preview in Three.js; Apply invokes the strict PlacementService with expected revision and membership checks; one transaction creates a new revision/current pointer. Full rotation is now rendered and derived mesh scale is preserved. Cancel/tool/document navigation removes preview; restore loads full saved pose. Concurrency permits one commit per expected revision, and fault tests prove rollback. Geometry generation, voxel editing and real measurement remain unavailable. The manual service is never bound to the chat graph.

Combined inventory:117 Python tests,93 app tests,8 actual browser journeys. Exact Close results and deviations are recorded in the scoped plans. No dependency/schema change, Bedrock, chat widget, conversation/checkpoint persistence, SSE or AI live writes. No commit/push is part of this follow-up.

## Object Select and rendered Visibility

The owner authorized the scoped R69–R75 canvas follow-up. Whole-active-object picking uses the real camera/raycaster, a guarded click gesture and canonical source/candidate ids. A separate bounding outline preserves cached geometry/materials. Hidden/unloaded/stale objects and navigation gestures cannot select. Shared view ops reject unknown/hidden identities and notify debug/UI callers.

Visibility now reaches the actual renderer, clears hidden selection and offers toolbar/H/menu, Show object and Show All recovery. View state survives tab switches and renderer rebuild; it is intentionally session-only. Source data, poses, revision records and backend state remain unchanged. Geometry rebuild dependencies now follow actual document/geometry changes rather than every view refresh, and loaded mesh ownership prevents stale scene identity. Camera snapshots follow rendered frames including damping so visibility tests observe actual camera state.

Scoped evidence and deviations are in features/3d-bone-editor/canvas-workspace/plans/select-visibility.md. Existing backend117 tests remain green; app inventory99 and browser inventory10. No provider, reconstruction, AI mutation, dependency or schema work; no commit/push.


## Portable Save/Open Package follow-up (2026-11-14)

Implemented the separately documented canvas R76–R85 intent/spec → scoped plan/preflight → test-first package slice. ZIP v1 export reads authoritative metadata/immutable volumes; import validates bounded entries, graph/ownership/current pointers, finite poses and hashes before staging a fresh remapped project copy. SQL rollback plus exclusive blob publication/compensation is fault-tested. Reopen/reimport, empty/unverified records, separate revision volumes and ignored external asset paths are covered. Raw source bytes and existing projects remain intact; no schema/dependency change.

Header/menu/shortcut Save downloads; Open Package chooses a file and explicitly imports a copy. Draft/pending guards, duplicate guards, cancel/error feedback, remapped hidden view recovery and truthful download/post-commit hydration messages are exercised. Trusted bundled display assets now require a matching volume hash. Reconstruction remains mock/sandbox-only; chat registry remains read-only, no Bedrock/live AI mutation. No commit/push.

Current Close evidence:127 Python tests,105 app tests,12 real Chrome journeys; build/typecheck and lint exit0 (8 inherited warnings; existing large bundle warning). Package additions:10 Python,6 app,2 browser. Scope review preserves earlier chat/placement/Select work. Feature checker and diff checks are recorded in the package plan/preflight. SQLite/files remain primary; package copy is not an operational backup, overwrite/merge, durable view preferences or automatic crash recovery.

## T2 live foreground-volume measurement (2026-11-14)

Owner authorized T2 after T1C fold-in. Implemented live `ForegroundVolumeService` over ApplicationRepository with:

- `POST /api/candidates/{id}/measurements` and revision-scoped GET retrieval
- Additive `measurement_request_reservations` + `candidate_measurement_results`
- Accepted NRRD/grid/hash/intrinsic-volume/provenance/error semantics
- Canonical request identity, completed-result replay before freshness, bounded in-progress wait, no automatic claim takeover
- Atomic result persistence + reservation completion + current-revision validation
- No geometry revision creation or volume-byte modification

**Not done / out of scope:** LangGraph `measure.candidate` bind, Chat UI changes, AI mutations, AWS/Bedrock, unrelated geometry.

**Verification (actual this run):**
- Focused measurement suite: 15/15 OK (`backend/ai/tests/integration/api/test_measurements.py`) covering AT-01–AT-18 / S51–S58
- Focused regressions: placement + chat + missing-contract OK
- Full Python runner: **157 tests OK**
- Feature checker: 0 errors (3 path warnings resolved via full Where-it-lives paths)
- `git diff --check`: clean
- Sandbox/tools: `measure.candidate` still unavailable in OperationService and LangGraph registry

No commit/push.

## T2 live foreground-volume measurement (2026-11-14)

Owner authorized T2 after accepted T1C fold-in. Implemented `ForegroundVolumeService` over live `ApplicationRepository`, additive `measurement_request_reservations` + `candidate_measurement_results`, and mechanical routes `POST /api/candidates/{id}/measurements` plus `GET …/revisions/{revision_id}/measurements`. Authoritative NRRD decode/count stays in the backend. Completed equivalent retries replay stored results before freshness; in-progress uses bounded wait then nonterminal `request-in-progress`; crash-incomplete requires reconciliation with no automatic takeover; completion is atomic with current-revision validation. Measurement does not create geometry revisions or modify volume bytes. LangGraph/`measure.candidate`, Chat UI, AI mutations, Bedrock/AWS, and unrelated geometry were not touched. Sandbox `OperationService` measurement remains unbound.

Verification (actual this Close):
- Focused `test_measurements.py`: **15/15 pass** (AT-01–AT-18 / S51–S58 coverage including concurrency wait, replay after revision change, integrity, raw/gzip, anisotropic, zero foreground, historical isolation).
- Full `backend/ai/tests/run_checks.py`: **157 tests OK** (includes router inventory update for the two measurement routes).
- Feature checker and `git diff --check` recorded in `plans/t2-foreground-volume.md`.
- No commit/push.

## Restored chat integration — 2026-11-14

Owner-authorized R90–R95 connects the recovered Assistant column to same-origin FastAPI JSON chat. Typed canonical source/candidate context and bounded history replace frontend keyword replies. Fake model explanations use graph-verified metadata only; unsupported geometry/clinical requests are disclosed, with no Bedrock or AI writes. Reset/context change/unmount abort pending fetches and discard late results; failed turns do not become future history.

Development adds an exact AI-only forwarding middleware before the unchanged Vite SQLite apiPlugin. CRUD, CSS, studio viewport, slice rendering and pre-existing sample edits are preserved. No live server/storage root was selected for verification and no live cutover command was run. Setup documents explicit shared storage roots and isolated browser proof. No commit or push.

Verification: 139 Python tests and 104 app tests pass; type/build passes; lint has existing warnings and no errors. Actual Chrome browser through Vite→FastAPI passes the two screenshot prompts, history identity and no-write manifest checks with disposable storage. The same browser journey also passes against built assets served by an isolated FastAPI process. No live routing was changed. Scoped plan/preflight record Close evidence.

Publication follow-up: owner authorized a separate reviewed chat PR after verification. The isolated publication branch starts from main 61189d7 and contains only the 24 scoped integration/test/doc files. Source workspace/sample changes are excluded. No merge or live cutover is authorized.

## PR #31 final review repairs

Owner-authorized fixes cover all three final findings: default runner exclusion plus fail-closed disposable-root/profile guards; active-document chat identity independent of retained viewport selection; and chained follow-up resolution to the last substantive human intent. Regressions cover actual test discovery, an alternate-runner HTTP trap, root traversal/links, real tab switching with retained selection/history reset, repeated follow-ups, and no-write invariance. Geometry/style code and the original Vite apiPlugin/CRUD remain untouched. No commit/push/merge or live runtime change in this repair run; final proof is recorded in plans/pr31-final-repairs.md.

Final repair verification: 144 backend tests, 110 app tests and 6 positive browser journeys (3 dev + 3 built) pass. The unsafe alternate-runner regression also proves zero HTTP requests before rejection. Type/build/strict guard checks pass; lint has only existing warnings. Tests used disposable storage exclusively. See scoped plan Close evidence. Changes were local/uncommitted at implementation Close; reviewed publication is authorized in the follow-up below.

Publication follow-up: owner authorizes review/commit/push of the three repairs to PR #31; merging and live runtime updates remain unauthorized. The regression for an unsafe alternate runner also uses a nonexistent browser executable, proving rejection happens before browser launch or HTTP requests.

## Gemini read-only chat — 2026-11-14

Implemented in isolated `feat/llm-read-only-chat` checkout over origin/main plus an uncommitted PR #31 dependency overlay. No commit, push, merge, live process restart or live-storage access. English prompt: `features/ai-workspace-assistant/prompts/gemini-read-only-chat.md`; separate intent/spec R96–R99, plan and preflight record the scope.

- Added replaceable stateless Gemini generateContent adapter with structured registry proposals and explanations from validated application-read observations. Only metadata tool is bound; all geometry and AI writes remain unavailable.
- Backend-only private `.env.local` is mode 0600 and ignored. Existing env template settings are preserved; Gemini entries are additive. No key is in frontend, source/test artifacts, provider URLs or response envelopes.
- Fake is explicit default, Gemini is opt-in. Provider identity/read policy are checked by the client; recovered panel badge changes after verified response without CSS/layout changes. History remains bounded React memory, reset/remount clears it and late responses are suppressed. No transcript/checkpoint/provider conversation persistence.
- Provider errors, complete JSON output, one-MiB response limit, ten-second socket timeouts and no retries are tested. Unknown tools/arguments, fabricated numeric prose, unknown fact references, stale context and restored pointers have regressions. Qualitative model prose is probabilistic; no clinical correctness claim.
- Verification: 151 Python tests; 115 app tests; TypeScript/build pass; lint has existing warnings and no errors; dev 3/3 and built 3/3 dedicated disposable browser journeys. Feature checker and diff/protected-file/secret audits are recorded in the scoped plan.
- Real access: image OCR initially failed authentication; the exact text key authenticated. `gemini-3.8-flash` hit timeout. `gemini-3.5-flash-lite` completed load_context → propose → validate → execute → explain on synthetic disposable data, with all storage hashes unchanged. Private env selects that verified model. No live app switch occurred.


### Gemini publication review
Owner authorized a separate Gemini PR after review, without merge or live-runtime switch. PR #31 remains open, so publication is stacked on that branch and excludes its existing wiring diff. Fixed missing Gemini configuration/provider error-code reporting in the frontend, with two new regressions (117 app tests total). Private env and API key are excluded; original Vite CRUD plugin and recovery styling remain unchanged. The application currently listening on port 8000 still runs the main-workspace fake model; chat reset does not change server code or provider settings.
