# AI backend architecture

## Live app authority (current)

The UI's Express backend and data/storage/app-model.sqlite are authoritative for live projects, cases, samples, candidates and revisions. The Python SQLite/operation-service/mock implementation below is an isolated demo, not a second app writer. AppWorkspaceAdapter and HttpAppManifestReader read the actual ProjectManifest contract; schemas/workspace.py preserves its hierarchy, camelCase spatial metadata, raw volume hashes and flat pose. Live AI mutations remain disabled. See [app-integration.md](app-integration.md) for implemented routes, mismatches, fixes and LangGraph readiness.


Status: draft. This describes the AI subproject only. It does not set the product-wide stack in `docs/project.md`.

The owner has accepted the foundation boundaries in this document. Real operation contracts remain unresolved. The two-fingerprint AI retry lifecycle is a proposed clarification pending review and is not yet an implementation requirement.

## Standalone sandbox boundary and future target

The target `backend/ai` accepts direct mechanical or AI-assisted requests, loads authoritative backend state, validates a registered operation, coordinates execution, and commits the result. Within the Python sandbox, its backend owns persistent cases, candidates, immutable revisions, artifacts, current-revision pointers, annotations, measurements, operation runs, and idempotency records. The frontend owns temporary camera, hover, selection, and optimistic presentation state.

The 3D canvas and real geometry algorithms are separate work. This package calls geometry through an adapter and does not claim that a proposed browser or geometry interface is teammate-approved.

## Modules

| Module | Owns | Must not own |
|---|---|---|
| `api/` | Direct and AI request endpoints, HTTP errors before streaming, `progress` and terminal `result` SSE events | Candidate mutation or tool routing rules buried in route functions |
| `schemas/` | Direct request, AI request, validated command, event, result, artifact, spatial, and error types | Geometry math |
| `agent/` | LangGraph steps: load, propose a registered operation, explain | Argument-validation bypasses, revision writes, or application idempotency |
| `tools/` | One module per model-facing tool, with its input schema | Measurement formulas |
| `operations/` | Common mechanical/AI operation service: capability, typed arguments, revision checks, execution coordination, idempotency, and commit orchestration | Bedrock client setup or direct database mutation outside storage interfaces |
| `integrations/bedrock/` | Model calls | Case records |
| `integrations/workspace/` | Read of backend-owned authoritative case state | A second current-revision pointer or candidate geometry algorithms |
| `integrations/geometry/` | The reconstruction and measurement adapter. The mock is one implementation of that interface | A real geometry algorithm, or a second result schema for the mock |
| `storage/` | Authoritative application records, immutable revision commits, local artifact content, case-scoped request reservations, and run state | LangGraph checkpoints, request fingerprint interpretation, model ownership, or operation orchestration |

The shared structural contracts are implemented in `backend/ai/src/skullfix_ai/schemas/`: `common.py`, `spatial.py`, `artifacts.py`, `requests.py`, `commands.py`, `results.py`, and `events.py`, with supported imports re-exported from `skullfix_ai.schemas`. They reject undocumented fields, preserve revision-bound spatial references, and enforce typed mock result/event invariants. They do not establish case membership, authoritative freshness, capability availability, idempotency, artifact existence, geometry correctness, execution permission, event ordering, or exactly-once delivery; those remain application-service responsibilities.

## Records

Original anatomy, intended repair, proposed design, and review results stay separate in application storage. Proposed designs have immutable parented revisions. A geometry-changing commit inserts a child and advances the candidate's current-revision pointer atomically after rechecking freshness. Inspection does not create a revision. Measurements stay attached to the revision and method that produced them.

LangGraph checkpoints live in a different SQLite file and only preserve workflow or conversation state. They do not determine current revision, candidate history, or request idempotency.

## Implemented sandbox storage foundation

`storage/interfaces.py` defines immutable records, focused protocols, and domain errors. `storage/sqlite.py` implements application schema version 2 with standard-library SQLite and foreign keys. `storage/artifacts.py` implements contained local content writes, ingestion, SHA-256 verification, resolution, and explicit non-authoritative cleanup. Supported imports are re-exported from `skullfix_ai.storage`.

The database owns cases, source anatomy, artifacts, candidates, immutable revisions, review history, request reservations, and run lifecycle. Child revision insertion, artifact authority, and current-pointer advancement share one SQLite transaction. Filesystem writes do not. A pending file from a stale or failed commit remains a non-authoritative artifact record until an explicit caller retains or deletes it.

Request reservation enforces case-scoped uniqueness and conflict detection for a caller-supplied canonical identity. It does not implement the proposed pre-model fingerprint, ownership expiration, retry interpretation, recovery, or external-execution deduplication.

## Tool registry

Each tool registers a name, typed input and output schemas, and the operation id it wraps. The graph may propose only registered tools. Direct mechanical requests name an operation directly. Both paths become the same validated command and use the same operation service. A graph node or API route must not mutate a candidate around that service.

## Proposed retry boundary

The API/storage boundary claims a case-scoped `request_id` and stores a canonical client-request fingerprint before the graph or model runs. AI message and submitted context are part of that fingerprint. The graph may run only for the claim owner. After the model proposes and application validation accepts a command, storage records that command and a separate command fingerprint before operation execution.

Equivalent retries attach to persisted request, command, run, or result state. A completed retry returns the original result even when the completed mutation changed current revision. Freshness checks protect new execution and commit, not result retrieval. Conflicting client input returns `request-id-conflict`.

If a request stops before command persistence, one local recovery owner may resume from persisted canonical client input after the previous claim is explicitly interrupted or expired. If execution may have started, recovery reconciles persisted run and artifact state before deciding whether to resume or fail. This proposal adds no broker, distributed coordinator, or resumable SSE.

## Local runtime

The proposed first demo is one local process and one request that streams its response. FastAPI and SSE remain unimplemented. SQLite application storage is implemented; checkpoint storage remains separate and unimplemented. Artifact files stay local and are exposed through backend-resolvable artifact references rather than server-local paths. Bedrock remains a proposed model provider. LangSmith tracing is optional and off unless configured.

Application storage can atomically check an expected revision, insert a child, and advance the current pointer. It cannot make external geometry execution or filesystem writes atomic. Runs distinguish accepted, execution, ready-to-commit, and terminal states. Artifacts left by failed or stale commits are non-authoritative and require local reconciliation or cleanup.

## Replacement

Bedrock, workspace, and geometry are adapters. The agent, API, operation service, and storage use shared command and result schemas, not mock-only fields. Replacing the reconstruction mock primarily changes adapter and composition wiring when the common contract still fits.

A mock or test double sets provenance to `mock` or `test-double`. It uses the same validation, immutable revision commit, artifact record, and event path. That result is not a real reconstruction, a real measurement, or evidence of geometric quality. A real capability is advertised only after `docs/ai/contracts.md` marks an agreed contract. The mock does not extend to editing, inspection, comparison, or contour-guided generation. Live checks stay opt-in.

If a mechanical operation executes in the browser, the proposed compatible path submits its artifact and expected input revision to the operation service. The backend validates provenance, typed parameters, artifact metadata, spatial metadata, and freshness before applying the same commit rules. The exact protocol remains unresolved with the mechanical owner.

## Implemented synchronous operation boundary

`skullfix_ai.operations.OperationService` exposes execute_request for direct envelopes and execute_reconstruction for canonical mock commands. The latter is the future AI tool seam. It resolves source context, verifies revision/frame references, claims one canonical run, validates adapter output before publication, ingests artifacts, commits an initial candidate, and persists a shared result. It contains no model or geometry calculation.

`skullfix_ai.integrations.geometry` exports ReconstructionAdapter, ReconstructionContext, ReconstructionArtifactOutput, ReconstructionAdapterError, and DeterministicReconstructionMock. Adapter output is pre-commit bytes and metadata; application storage assigns authoritative candidate/revision identity. Mock output is synthetic JSON and is not a repair mesh or clinical result.

SQLite claim_operation_run binds a case-scoped canonical command identity and one run atomically. Equivalent completed retries return stored outcomes; active duplicates report request-in-progress and do not execute. Conflicts report request-id-conflict. This is post-selection canonical coordination, not the proposed R35–R39 pre-model/recovery lifecycle.

Source and candidate commits enforce artifact lifecycle eligibility. Version 2 adds a cleanup token through an in-place version-1 migration. Cleanup must acquire a live claim before deleting bytes; deletion and completion are not filesystem/SQLite atomic. Reconciled non-authoritative records cannot be republished, and stale record snapshots cannot authorize deletion.

Mutation commit precedes completed-outcome persistence. A lost acknowledgement, uncertain commit, or failed outcome write reports reconciliation-required and does not replay the adapter. Known failed artifacts remain inspectable. A file whose record write failed is identified in the failed run by its public reference and artifact_record_missing detail. Storage outage can prevent even that record; explicit local reconciliation remains necessary. No automatic recovery or exactly-once external execution is claimed.

Stable service outcomes include cross-case-reference, reference-mismatch, stale-revision, operation-contract-missing, operation-unsupported, adapter-failed, adapter-output-invalid, artifact-failed, and persistence-failed. Malformed structural input raises Pydantic ValidationError before execution. FastAPI/SSE, HTTP retrieval, graph, checkpoints, model integration, and real operations remain unimplemented.
