# AI backend setup

## Live app authority (current)

The UI's Express backend and data/storage/app-model.sqlite are authoritative for live projects, cases, samples, candidates and revisions. The Python SQLite/operation-service/mock implementation below is an isolated demo, not a second app writer. AppWorkspaceAdapter and HttpAppManifestReader read the actual ProjectManifest contract; schemas/workspace.py preserves its hierarchy, camelCase spatial metadata, raw volume hashes and flat pose. Live AI mutations remain disabled. See [app-integration.md](app-integration.md) for implemented routes, mismatches, fixes and LangGraph readiness.


The backend is a synchronous Python library, not an HTTP service. Shared schemas, SQLite application storage, local artifacts, the canonical operation service, and a deterministic reconstruction mock are implemented. FastAPI/SSE, LangGraph/checkpoints, LangChain/Bedrock, and real geometry remain unimplemented.

The owner authorized the current operation-service slice. The completed plan is `features/ai-workspace-assistant/plan.md`; earlier plans are under `plans/`. Future graph/API/model work needs its own plan and task preflight. R35–R39 (pre-model request identity and interrupted-owner recovery) remain proposed.

## Install

Use Python 3.11 or newer. From the repo root:

```sh
python3 -m pip install -e backend/ai
```

The only third-party dependency is Pydantic 2.12.5. SQLite, file handling, hashing, and tests use the standard library. Offline checks need no AWS credentials.

## Configuration

Construct storage with `Path` values. Environment loading and a composition root are not implemented. The reserved settings are `SKULLFIX_AI_DB_PATH` for application state, `SKULLFIX_AI_ARTIFACT_DIR` for local content, and `SKULLFIX_AI_CHECKPOINT_DB_PATH` for future separate checkpoints. Do not commit local `.env` files, credentials, or data.

Future live model calls need `SKULLFIX_AI_MODEL_ID`, `AWS_REGION`, and AWS credentials/profile. No live call is made by current code. Future geometry formats, HTTP artifact retrieval, and browser uploads remain unresolved.

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

A healthy run reports 64 tests and OK: artifacts 4, SQLite 14, schemas 12, fixtures 11, missing-contract 1, reconstruction mock 1, operation service 16, app workspace 5.

Focused operation-service check:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/operations/test_operation_service.py
```

A healthy run reports 16 tests and OK. It covers generation, persistence/reopen, source preservation, canonical/direct convergence, compatible adapter substitution, active competing connections, duplicate/conflicting commands, pre-execution stale rejection, sanitized failures, invalid adapter output, and commit/outcome uncertainty.

```sh
python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py .
git diff --check
```

There is no configured lint command. Live tests remain opt-in and currently empty. These checks do not prove API/SSE delivery, graph/checkpoint resume, Bedrock access, AI retry recovery, or geometry quality.

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

Cross-language check (requires npm ci in app/, Python/Pydantic, and localhost listening): npm test -- tests/aiWorkspaceContract.test.ts from app/. All app checks: npm test, npm run build, npm run lint. The existing jsdom engine declaration requests Node ^22.22.2 or ^24.15.0 or >=26; this host's Node 24.12.0 produced installation warnings, although the checked suites/build passed. Lint has three existing warnings. No app package versions were changed.
