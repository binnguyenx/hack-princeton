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

Use an absolute SKULLFIX_PYTHON path if your test environment changes working directories. The harness otherwise defaults to python3. The initial queue used a temporary interpreter; final cutover and tests use the persistent repository .venv. Current combined upstream UI verification reports87 app tests and5 browser tests. Earlier45/3 counts belong to the local cutover record. Historical Express-only tests are retained in the independent recovery runtime, not current dependencies; equivalent current coverage is Python/FastAPI plus the frozen Node-produced fixture. Test roots and ports are allocated and cleaned by the harness; no live HACK_STORAGE_ROOT is used. Current API contracts run16 scenarios against FastAPI; historical Express execution and S13 remain in the recovery archive. Focused commands:

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

A healthy full runner reports107 tests/OK: the original64 plus application19, API13 and graph11. Historical individual component counts below remain component-specific.

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
