# Backend setup

## Runtime and authority

FastAPI/Python is the sole application backend after authorized live cutover and verified30-minute observation. Express/Multer are removed from the active app. The fake-model LangGraph remains in-process; no separate AI HTTP server or live AI mutation is introduced.

The live application repository is `skullfix_ai.application.ApplicationRepository`; it matches the seven-table Node schema and NRRD layout. `skullfix_ai.storage.SQLiteApplicationStorage` and reconstruction OperationService remain isolated sandbox components. Never point sandbox storage at app-model.sqlite. LangGraph checkpoint persistence is not implemented.

## Install

From the repository root, create an isolated environment (Python3.11+):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e 'backend/ai[test]'
cd app && npm ci
```

Pinned direct dependencies: Pydantic2.12.5, FastAPI0.162.7, Uvicorn0.54.0, python-multipart0.0.33, Brotli1.2.1, Zstandard0.25.0 and LangGraph1.2.22. The test extra includes HTTPX0.28.1. SQLite/hash/filesystem operations use the standard library. No AWS credentials or network model calls are needed for deterministic tests. Playwright1.65.1 is an app dev dependency. Browser checks use installed Chrome by default; set HACK_BROWSER_CHANNEL to a separately installed supported channel if necessary.

## Disposable development launch

Use an explicitly chosen disposable root, never an existing live root for experimentation. The CLI refuses to choose a root implicitly; --storage-root or explicit HACK_STORAGE_ROOT is required.

```sh
PYTHONPATH=backend/ai/src .venv/bin/python -m skullfix_ai.api --storage-root /tmp/hp-my-disposable-app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
cd app
HACK_API_ORIGIN=http://127.0.0.1:8000 npm run dev
```

Vite always proxies /api to FastAPI, default http://127.0.0.1:8000; HACK_API_ORIGIN may override the target. No Express fallback or middleware remains. Start only one application writer for a selected root. /healthz verifies startup composition; actual DB/file checks are separate. SIGTERM/Ctrl-C triggers graceful Uvicorn shutdown.

## Built frontend and preview

```sh
cd app && npm run build
```

From repository root, use explicit absolute paths:

```sh
PYTHONPATH=backend/ai/src .venv/bin/python -m skullfix_ai.api --storage-root /tmp/hp-my-disposable-app --frontend-dir "$PWD/app/dist" --host 127.0.0.1 --port 8000
```

FastAPI serves /api first, then built assets and non-API SPA fallback. Unknown /api paths return JSON404 rather than index.html. Missing static files return404. `npm run preview` is frontend-only; preview.proxy is explicitly empty even when a dev API origin is present. It is not the integrated application launch.

## Verification

From repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B backend/ai/tests/run_checks.py
```

Expected:107 tests/OK: application19 (including frozen Node baseline and backup/WAL proof), API13 and graph11 alongside64 legacy tests. API tests use an in-process ASGI client; the following app tests supply the required actual cross-runtime TCP checks:

```sh
cd app
SKULLFIX_PYTHON=../.venv/bin/python npm test
npm run build
SKULLFIX_PYTHON=../.venv/bin/python npm run test:browser
npm run lint
```

Use an absolute SKULLFIX_PYTHON path if your test environment changes working directories. The harness otherwise defaults to python3. The initial queue used a temporary interpreter; final cutover and tests use the persistent repository .venv. Current combined verification reports105 app tests and12 browser tests; earlier publication/cutover counts below are historical. Earlier45/3 counts belong to the local cutover record. Historical Express-only tests are retained in the independent recovery runtime, not current dependencies; equivalent current coverage is Python/FastAPI plus the frozen Node-produced fixture. Test roots and ports are allocated and cleaned by the harness; no live HACK_STORAGE_ROOT is used. Current API contracts run16 scenarios against FastAPI; historical Express execution and S13 remain in the recovery archive. Focused commands:

```sh
SKULLFIX_PYTHON=../.venv/bin/python npm test -- tests/backendContract
SKULLFIX_PYTHON=../.venv/bin/python npm test -- tests/aiWorkspaceContract.test.ts
```

## Graph usage and limitations

See features/ai-workspace-assistant/plans/langgraph-fake-model.md for the in-process invocation example. Compose WorkspaceGraph with AppWorkspaceAdapter(RepositoryManifestReader(ApplicationRepository(explicit_root))), FakeToolModel and default_tool_registry. The default tool reads selected metadata only. Model/tool arguments cannot replace authoritative ownership or revision context. Unsupported/invalid/failed tools produce grounded failure explanations, not invented geometry.

An explicit SandboxReconstructionBinding can expose the existing reconstruction mock through OperationService, with composition-supplied sandbox identities and a separate database/artifact root. It never creates a live application candidate. LangGraph checkpoints, Bedrock, SSE, live AI mutation and real geometry are not implemented.

## Migration gates and configuration

S13 passed before live operation. Owner approved the concrete procedure; paired backup/restore and full30-minute observation passed. Live cutover and active-app Express removal are complete; the independent rollback runtime/backups remain retained7days. Read features/express-to-fastapi/live-cutover-runbook.md and task-board.md. Do not run S13 on live data.

Application server: --storage-root or HACK_STORAGE_ROOT; optional --frontend-dir; host/port explicit defaults loopback8000. Frontend dev proxy: HACK_API_ORIGIN. Sandbox settings remain SKULLFIX_AI_DB_PATH/SKULLFIX_AI_ARTIFACT_DIR and future SKULLFIX_AI_CHECKPOINT_DB_PATH; pass Path values to constructors. No credentials or data should be committed. Future model calls still require separate provider configuration and acceptance.

## Standalone sandbox operation usage

After preparing a case and immutable source anatomy through the storage interfaces:

```python
from pathlib import Path
from skullfix_ai.storage import SQLiteApplicationStorage, LocalArtifactStore
from skullfix_ai.integrations.geometry import DeterministicReconstructionMock
from skullfix_ai.operations import OperationService, OperationServiceError

storage = SQLiteApplicationStorage(Path("data/application.sqlite"))
storage.initialize()
try:
    service = OperationService(
        storage, LocalArtifactStore(Path("data/artifacts")),
        DeterministicReconstructionMock(),
    )
    result = service.execute_request({
        "request_id": "demo-request-001",
        "case_id": "case-demo-primary",
        "operation_id": "generate.candidate",
        "source_anatomy_revision_id": "anatomy-revision-primary-v1",
        "parameters": {"fixture_variant": "deterministic-default"},
    })
    print(result.model_dump_json())
finally:
    storage.close()
```

The ids above must already exist; initialization does not seed fixtures. For a self-contained prepared-fixture demonstration, run `tests/integration/operations/test_operation_service.py` using the command below. Its test-only loader prepares temporary state and exercises the same public interfaces.

`execute_reconstruction` accepts a shared `ReconstructionMockCommand`; `execute_request` normalizes direct mock requests into that same command. Other known real operation slots return unavailable after applicable membership/freshness checks; unknown or contour operations return unsupported. Neither path interprets AI messages.

`OperationServiceError` reports `request-id-conflict`, `request-in-progress`, `case-not-found`, or `reconciliation-required` when no new terminal execution result can honestly be claimed. An active retry does not launch another adapter. Completed canonical retries return their persisted result. There is no automatic recovery of interrupted owners and no exactly-once external-execution guarantee.

## Sandbox storage and artifacts

`skullfix_ai.storage` exports records, protocols, errors, `SQLiteApplicationStorage`, and `LocalArtifactStore`. Call `initialize()` before use and `close()` when done. Application schema version 2 migrates version 1 in place by adding a nullable cleanup-token column; existing records remain intact. No checkpoint database is opened.

Write/ingest and record an artifact as pending before publishing it. Source and candidate publication reject deleted, cleanup-claimed, or otherwise ineligible records. Child insertion, current-pointer update, and artifact authority change share one SQLite transaction. Existing authoritative immutable artifacts may be reused.

For cleanup, first mark a failed artifact non-authoritative. Then call `claim_artifact_cleanup(artifact_id, token)`, `LocalArtifactStore.delete_claimed(claim)`, and `complete_artifact_cleanup(artifact_id, token, ReconciliationState.DELETED)`. Complete with RETAINED when retaining bytes. Never delete from an old ArtifactRecord snapshot. Cleanup-claimed and reconciled non-authoritative artifacts cannot be published. Filesystem deletion and claim completion are separate; interrupted cleanup needs explicit reconciliation.

A failed commit leaves known produced artifacts non-authoritative and listable. If writing bytes succeeds but recording the artifact fails, the failed run retains its public artifact id/hash and `artifact_record_missing` detail for manual reconciliation. Files use `objects/<sha256(artifact_id)[:2]>/<sha256(artifact_id)>/<content_hash_without_prefix>.blob` beneath the configured root; this internal layout is not a public contract. If run-outcome persistence also fails, reconciliation requires inspection of the local artifact root and database; no terminal persistence guarantee is claimed.

Mutation commit and completed-result bookkeeping are separate transactions. Lost commit acknowledgement or failed outcome persistence reports reconciliation-required and leaves the run ready-to-commit. Inspect candidate/artifact state before any recovery. Identical retries do not execute again. No automatic reconciliation worker is implemented.

Public artifacts use retrieval_url, but that URL has no implemented HTTP endpoint yet.

## Checks

Run all deterministic suites from the repo root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
```

A healthy full runner reports157 tests/OK after T2 measurement (prior127 plus measurement HTTP coverage and other live API slices). Historical individual component counts below remain component-specific.

Focused operation-service check:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/operations/test_operation_service.py
```

A healthy run reports 16 tests and OK. It covers generation, persistence/reopen, source preservation, canonical/direct convergence, compatible adapter substitution, active competing connections, duplicate/conflicting commands, pre-execution stale rejection, sanitized failures, invalid adapter output, and commit/outcome uncertainty.

```sh
python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py .
git diff --check
```

Python has no separate lint command. App lint is npm run lint. Provider/live tests remain opt-in and empty. Current checks prove the listed API/fake-model slices, not SSE, checkpoint resume, Bedrock, AI recovery or geometry quality.

## Read the live UI/backend context

Start the app with npm run dev in app/ and use its printed origin (typically http://localhost:5173). Python needs the same pinned Pydantic dependency; no model or database mirror is needed.

```python
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter, HttpAppManifestReader

workspace = AppWorkspaceAdapter(HttpAppManifestReader("http://127.0.0.1:5173"))
context = workspace.load_context(
    project_id="existing-project-id",
    object_id="existing-sample-source-or-candidate-id",
    case_id="existing-case-id",
)
print(context.model_dump_json())
```

Supply real ids from GET /api/projects and GET /api/projects/:id. HttpAppManifestReader takes an origin without /api or other paths. If using SKULLFIX_WORKSPACE_BASE_URL, pass it explicitly; no implicit environment loading is installed. The adapter reads metadata only and rejects mutation. The local mock example above targets only a separate sandbox, never the live app store.

Cross-language check (requires npm ci in app/, Python/Pydantic, and localhost listening): npm test -- tests/aiWorkspaceContract.test.ts from app/. All app checks: npm test, npm run build, npm run lint. The existing jsdom engine declaration requests Node ^22.22.2 or ^24.15.0 or >=26; this host's Node 24.12.0 produced installation warnings, although the checked suites/build passed. Current lint has2 existing warnings. The queue added a pinned Playwright dev dependency; existing app dependency versions were preserved.

## Starting and operating the installed app

From app/, `npm start` launches the built app through the repository .venv using ../data/storage and dist. Build first with npm run build. `npm run backend -- --storage-root /absolute/root --frontend-dir /absolute/build` exposes explicit operator options. Stop an already running server before launching another. Current live URL/root/PID, exact backup paths, retention not-before and rollback instructions are recorded in features/express-to-fastapi/cutover-completion.md. npm run dev is frontend tooling and expects FastAPI; npm run preview is frontend-only. No automatic deletion of recovery data is scheduled.

## Read-only fake-model chat transport

The existing FastAPI process serves POST /api/ai/chat. No second server, provider configuration or new dependency is needed. The future UI calls app/src/api/chat.ts (`chatClient.send(request, signal)`). There is no chat panel yet. Request fields: request_id, conversation_id, project_id, case_id, object_id, message, optional expected_revision_id. IDs ≤256 characters; nonblank message ≤4000. Send the current candidate revision to detect stale selection.

The response echoes both correlation ids and includes mode=fake-read-only, limitations and outcome. HTTP200 can carry a stale/unavailable/failed graph outcome; check outcome.status/code. Invalid payload422, non-JSON415; existing parser400/413 behavior remains. The fake model always describes metadata regardless of the instruction. No measurement, mutation, history, SSE, retry persistence or Bedrock is available. A SQLite mode=ro snapshot prevents even lazy schema/user initialization. The route never registers the sandbox generation binding.

Verification at this slice:112 Python tests,90 app tests and7 browser tests (5 existing plus2 chat transport journeys). Run with the installed virtual environment: from app/, `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test`; build before `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser`. Browser tests execute the typed client in a real browser; they do not claim a chat widget exists. Node24 built-in type erasure is used by the browser harness. All test roots are disposable.

## Manual rigid construction in the UI

Open a project, create a case/import a spatially verified mm sample, create/open a candidate in3D, then Object → Transform Tool (T). The inspector exposes Translate X/Y/Z (mm) and Rotate X/Y/Z (degrees), initially zero deltas relative to the current revision. Axes are editor-world axes; rotation is about the candidate origin. Change a value to preview, Apply to commit one immutable revision, or Cancel/Escape to discard. Unchanged/nonfinite drafts cannot Apply. Restore renders the saved full pose. Source NRRD bytes stay unchanged; this tool places existing geometry and does not generate an implant or modify voxels. Samples/unverified/non-mm metadata do not enable construction.

POST /api/candidates/{id}/placement uses the application PlacementService. Stale or cross-case context409, missing candidate404, invalid/non-rigid/no-change input422. The old /transform route retains its migration baseline; the UI uses the new strict placement endpoint. There is no automatic retry or persisted idempotency claim. The metadata-only chat route has no access to this service.

At manual-placement close, the combined inventory was117 Python tests,93 app tests and8 browser journeys; see Select/Visibility below for the current inventory. Build the app before browser checks; use the .venv interpreter via SKULLFIX_PYTHON for app/browser tests. No pip/npm dependency changes are required. The new endpoints are loaded on restarting the existing FastAPI process; no live DB migration or new backend is involved. Browser coverage calls the typed chat client from the browser without a widget, and exercises actual placement controls, preview/cancel/commit/restore, camera preservation and immutable source hashes.

## Select and Visibility (view-only)

In the canvas, use Object → Select Tool / V, then click the loaded mesh. A blue bounding outline marks the whole source/candidate object. Background click or Escape clears it; navigation drags/modifiers do not pick. Sample selection uses sourceAnatomy.objectId, distinct from its document/sample id. Face/region selection is not included.

Use the eye control, H or menu Toggle Visibility to hide/show the active3D object. Hiding clears selection; Show object and Show all objects recover without selection. Visibility is per-object session view state across tabs; reload/backend hydration can reset it. It does not change source volumes, candidate poses/history, dirty edit state or backend records.2D reference slices remain available when the3D root is hidden. Shared debug view ops notify the UI; legacy debug domain writes remain separate from the live API. Reconstruction and AI live writes remain disabled.

No backend/schema/dependency change is required. At Select/Visibility close, the backend runner remained117 tests; see the package section for current totals. The Select/Visibility slice adds6 app tests (99 total) and2 actual Chrome journeys (10 total). Build before browser checks; run with SKULLFIX_PYTHON pointing to .venv. The browser tests use disposable storage and exercise actual raycasting, screenshot/highlight changes, rendered hide/show, tab state, recovery and selected WebGL rebuild. Reload the built local app after building to see the new controls.


## Portable Save/Open Package (manual,2026-11-14)

Open a stored project and use header Save, File → Save or Ctrl/Cmd+S to download a ZIP. The status says download started; your browser controls the actual disk save. Apply or Cancel any placement draft first. Open Package (header or Projects home) → choose ZIP → Import as new project creates a separate project named original + " (imported)". Cancel/file rejection leaves the old project intact. If import commits but subsequent opening fails, reload Projects to open the new copy; do not import again. No automatic retry is performed.

ZIP v1 has package.json, manifest.json and volumes/{id}.nrrd. Limits:64 MiB compressed,256 MiB expanded including JSON,512 entries,4 MiB per JSON document,10000 domain records. Unsupported versions, unsafe/duplicate/symlink/encrypted entries, missing/excess volumes, wrong ownership/pointers/orders or SHA-256 mismatches fail before storage writes. Files are staged under fresh IDs, exclusively published, and database rows/current pointers commit in one transaction; caught failures compensate files. Abrupt crashes may leave non-authoritative orphan/staging files; reconciliation remains explicit. This is an interchange copy, not a paired operational backup or an overwrite/rollback mechanism.

Project/case/sample/source/candidate/revision/volume identities remap. Raw NRRD bytes/hashes, verified spatial metadata, names/licenses, finite poses, contiguous history, volume sharing and a restored older current pointer survive. Camera, selection, visibility, inspection plane and open documents restore once from validated/remapped presentation; projection, Window/Level, layout, drafts and chat are excluded. Imported filesystem/asset paths are ignored. A bundled GLB is used only when its trusted catalog metadata matches the source volume hash; distinct candidate volume content uses the revision-volume endpoint and existing NRRD display fallback, not a reconstruction algorithm.

Routes added (20 total including the13 compatibility routes, chat, placement, packages, and measurement): POST /api/projects/{id}/package (presentation JSON → ZIP), POST /api/packages/import (raw application/zip →201 projectId/presentation), GET /api/candidates/{id}/revisions/{revision_id}/volume (membership/integrity-checked immutable bytes), POST /api/candidates/{id}/measurements (live foreground-volume), GET /api/candidates/{id}/revisions/{revision_id}/measurements (revision-scoped history). Same-origin Vite proxy and FastAPI built serving are verified. No npm/pip dependency, extra backend, Bedrock or AI live write capability is added. Existing AI tools stay read-only; sandbox `measure.candidate` stays unbound.

```sh
# From repository root
PYTHONPATH=backend/ai/src .venv/bin/python -B backend/ai/tests/integration/api/test_packages.py
.venv/bin/python -B backend/ai/tests/run_checks.py
# From app/, after installing the existing dependencies
SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test
npm run build
SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser
```

Package-specific proof:10 HTTP/repository tests,6 client/asset/dialog tests and2 actual Chrome journeys (development and built) covering download/upload/new-copy graph/bytes/hash, draft/pending guards, hidden view recovery, corrupt input/cancel, restart and successful commit followed by failed UI hydration. Combined inventory before T2:127 Python,105 app tests,12 browser journeys. T2 measurement adds focused HTTP/service coverage; current Python runner:157 tests/OK. All fixtures use disposable roots; no package/measurement verification writes live storage.

## Live foreground-volume measurement (T2)

POST /api/candidates/{id}/measurements runs `ForegroundVolumeService` over ApplicationRepository with accepted NRRD/grid/hash/idempotency semantics. GET /api/candidates/{id}/revisions/{revision_id}/measurements returns revision-scoped successful rows only. Additive tables: `measurement_request_reservations`, `candidate_measurement_results`. No geometry revision or volume-byte mutation. Sandbox OperationService and LangGraph remain unbound for `measure.candidate`. Proof: `backend/ai/tests/integration/api/test_measurements.py` (15 tests, disposable roots).

## Restored Assistant panel → read-only FastAPI chat (2026-11-14)

The restored UI now uses JSON `/api/ai/chat`, not LangGraph Server `/threads` or frontend canned clinical replies. The badge remains Mock because the backend uses a deterministic fake model. It can describe selected-object metadata and assemble a read-only brief; it cannot calculate defect measurements, recommend clinical constraints, reconstruct, call Bedrock or write application data. Conversation history is bounded and client-local; there is no persisted chat checkpoint or SSE service in this slice.

Development preserves the Vite SQLite `apiPlugin` for all CRUD. The additional `read-only-ai-chat` middleware runs before it and forwards **only the exact `/api/ai/chat` path** to `HACK_AI_ORIGIN` (default `http://127.0.0.1:8000`). Backend outage returns 502; it never falls back to canned success. Preview is still frontend-only. Built assets may be tested with FastAPI's existing `--frontend-dir`; this does not authorize a routing cutover.

Start both processes with the **same absolute storage root** containing your existing Node application database and volumes. In terminal 1, from the repository root:

```sh
export HACK_STORAGE_ROOT="/absolute/path/to/your/application-store"
PYTHONPATH=backend/ai/src .venv/bin/python -B -m skullfix_ai.api --storage-root "$HACK_STORAGE_ROOT" --host 127.0.0.1 --port 8000
```

In terminal 2, set that same `HACK_STORAGE_ROOT`, then:

```sh
HACK_AI_ORIGIN=http://127.0.0.1:8000 npm --prefix app run dev
```

Restart existing processes to load this code/configuration; do not run a second writer against another implicit root. Open a source or candidate in the studio to enable chat. Source document IDs resolve to canonical source object IDs; candidates use their current pointer, including a restored older revision. Changing project/object/revision or resetting aborts the pending request and starts a fresh conversation. A stale response is surfaced as an error; reload context explicitly rather than retrying automatically.

Disposable browser regression (after building for the optional built variant):

```sh
export HACK_CHAT_TEST_ROOT="$(mktemp -d /private/tmp/hp-chat-e2e-XXXXXX)"
SKULLFIX_PYTHON="$PWD/.venv/bin/python" HACK_CHAT_BROWSER_CHANNEL=chrome app/node_modules/.bin/playwright test --config app/e2e/read-only-chat.config.ts
```

Use installed Chrome as above, or omit the channel when Playwright Chromium is installed. To repeat against built assets, use a new disposable root and add `HACK_CHAT_BUILT=1`. Servers use isolated ports 18573/18583 and refuse reuse; results remain under the disposable root. Tests never select live storage. No new dependency or schema migration is required.

### PR #31 final review repairs

Chat now follows the active source/candidate document. Retained viewport selection from another tab cannot override the chat identity or history; switching tabs starts the corresponding conversation without changing viewport selection. Repeated follow-ups (`continue`, `yes`, `tell me more`, etc.) resolve to the most recent substantive human turn within the bounded history. Assistant text never selects intent or supplies geometry facts.

`npm --prefix app run test:browser` intentionally excludes the mutating chat spec. Run that spec only with `app/e2e/read-only-chat.config.ts` and a fresh `mktemp -d /private/tmp/hp-chat-e2e-XXXXXX` root, as shown above. The dedicated config rejects noncanonical roots and symlink/hardlink storage escapes; the spec rechecks its explicit disposable profile and actual base URL before any test HTTP request. Reusing a live server or setting a temporary-root variable under an unrelated config does not satisfy the guard. A regression runs an alternate profile against an in-memory HTTP trap and confirms zero requests arrive.

These repairs do not update any running app; the owner subsequently authorized publication to PR #31 after review, without merge. No live storage was used for verification, and the Vite SQLite apiPlugin, CRUD implementation, recovery CSS, viewport and slices remain unchanged.

## Optional Gemini read-only chat (R96–R99)

The chat route defaults to `SKULLFIX_AI_CHAT_MODEL=fake`. To enable Gemini, copy `backend/ai/.env.example` to ignored `backend/ai/.env.local`, set `SKULLFIX_AI_CHAT_MODEL=gemini`, `GEMINI_API_KEY` and an explicit account-enabled `SKULLFIX_AI_GEMINI_MODEL` (without `models/`). Source that file into the **backend process** before running the existing `python -m skullfix_ai.api --storage-root ...` command. The application does not automatically load dotenv files. Do not use `VITE_*` keys or shell tracing. No new Python dependency is needed; the adapter uses standard-library HTTPS against Google's fixed generateContent origin with the key in a header.

Each turn performs at most two provider calls: a structured registry proposal, then a conversational explanation of the validated metadata observation. Each call has a 10-second socket timeout, a one-MiB response limit and no retry; the existing Vite AI forwarding timeout remains 30 seconds. This is socket-level timeout protection, not cancellation of a provider request already running when the user resets. Reset still aborts browser delivery and suppresses late replies.

Only `workspace.describe_selection` is registered. No geometry, measurement, placement, generation or live-write tool is enabled. Gemini may answer or ask a clarification; numeric metadata and identifiers are rendered by the server from selected observation keys. Numeric model prose and unknown keys fail explicitly. This reduces fabricated numbers but does not certify natural-language claims. Gemini errors never fall back to fake. The response reports `mode=llm-read-only`, `model={provider:gemini,id:...}` and `capability_policy=metadata-read-only`; the existing badge shows Gemini after a verified response.

History is bounded to 24 turns of 4000 characters and exists only in React memory and the current backend invocation. Reset/context changes clear it and create a new local conversation ID; reload loses it. There is no database transcript, checkpoint, localStorage, IndexedDB or provider conversation resource. Google may apply its own API data-retention policy; application statelessness is not a claim about provider retention.

Verification uses provider HTTP doubles and disposable application roots. The dedicated browser profile explicitly forces fake mode and clears its provider key. Screenshot OCR initially produced an invalid credential (HTTP 401). The exact key supplied as text authenticated successfully. A synthetic disposable smoke completed all five LangGraph steps with Gemini `gemini-3.5-flash-lite`, with every storage file hash unchanged. `gemini-3.8-flash` timed out at the configured limit during an earlier smoke. No live application runtime was switched. Do not commit secrets. Official wire references: [generateContent](https://ai.google.dev/api/generate-content) and [structured JSON output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).


Local env startup (run from the checkout containing this change, never print/source with `set -x`):

```sh
set -a
. backend/ai/.env.local
set +a
PYTHONPATH=backend/ai/src .venv/bin/python -B -m skullfix_ai.api --storage-root /private/tmp/your-disposable-root --host 127.0.0.1 --port 8001
```

The private file uses mode 0600 and is ignored. Its model is explicitly `gemini-3.5-flash-lite`, verified by a successful real generation with synthetic metadata. Change the model locally if the account enables another one. The Developer API path does not require project ID/number or service-account credentials. Existing Bedrock/tracing placeholders in `.env.example` are preserved and are not used by this adapter. No default dotenv auto-loading or live-runtime switch is introduced.
