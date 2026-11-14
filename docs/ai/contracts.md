# Shared integration contracts

## Live app authority (current)

The FastAPI application and ApplicationRepository own live projects, cases, samples, candidates and revisions at data/storage/app-model.sqlite. Express was removed after the approved cutover/observation; the old runtime remains only in the external recovery archive. The Python SQLite/operation-service/mock implementation below is an isolated demo, not a second app writer. AppWorkspaceAdapter and HttpAppManifestReader read the actual ProjectManifest contract; schemas/workspace.py preserves its hierarchy, camelCase spatial metadata, raw volume hashes and flat pose. Live AI mutations remain disabled. See [app-integration.md](app-integration.md) for implemented routes, mismatches, fixes and LangGraph readiness.


Status: foundation accepted; shared schemas and local application storage implemented; retry clarification proposed; operation-specific contracts unresolved. These AI/backend interfaces are not teammate-approved geometry or browser contracts, and they do not duplicate the requirements in `features/ai-workspace-assistant/spec.md`.

An **agreed contract** is required before a real measurement, edit, comparison, or reconstruction is advertised. None are agreed. A **provisional mock contract** may exercise `generate.candidate`; it is AI-owned, labeled, and not an agreed real capability.

The accepted foundation covers backend authority and identifiers, one mechanical/AI operation service, immutable revisions and atomic freshness checks, revision-scoped measurements and spatial metadata, request/run/conversation identity, the common result and terminal SSE envelope, checkpoint separation, and the replaceable reconstruction mock. The two-fingerprint retry lifecycle below is a new proposal pending review.

## Standalone sandbox authority and identifiers

- Backend application storage is authoritative for cases, source-anatomy revisions, candidates, immutable candidate revisions, artifact records, current-revision pointers, persisted annotations or regions, measurements, and operation runs.
- The backend assigns persistent `case_id`, `candidate_id`, `revision_id`, `artifact_id`, annotation ids, and persisted-region ids.
- The frontend assigns temporary selection references and owns camera, hover, and current-selection state. A submitted selection or region includes the immutable geometry revision and coordinate frame it refers to.
- The client creates `request_id`. It is the idempotency identifier and is unique within one `case_id`.
- The backend creates `run_id`. It identifies execution and commit state. An identical retry attaches to the existing run instead of creating an independent mutation.
- The AI client supplies `conversation_id` to group workflow context. It is not a geometry or request id.
- The workspace adapter reads backend-owned authoritative state. It must not maintain a second current-revision pointer.

Optimistic frontend state is presentation only. A new current revision exists only after a successful backend commit.

## Common request paths

Direct mechanical requests identify a registered operation and typed parameters. AI requests provide a message and context; the model may propose only a registered operation and arguments. Both paths converge on the same validated operation command and operation service.

The common service performs capability checks, typed argument validation, object and revision checks, execution coordination, idempotency, and persistence. A graph node or API route must not mutate candidate records around this service.

### Proposed direct mechanical request

```json
{
  "request_id": "req-01J...",
  "case_id": "case-01J...",
  "operation_id": "edit.local",
  "candidate_id": "candidate-01J...",
  "expected_revision_id": "revision-01J...",
  "selection": {
    "selection_id": "selection-client-01J...",
    "kind": "region",
    "reference_id": "region-01J...",
    "geometry_revision_id": "revision-01J...",
    "coordinate_frame": "frame-defined-by-contract"
  },
  "parameters": {
    "edit_kind": "operation-specific-value"
  }
}
```

### Proposed AI request

```json
{
  "request_id": "req-01J...",
  "conversation_id": "conversation-01J...",
  "case_id": "case-01J...",
  "message": "Apply the supported local edit to this region.",
  "candidate_id": "candidate-01J...",
  "expected_revision_id": "revision-01J...",
  "selection": {
    "selection_id": "selection-client-01J...",
    "kind": "region",
    "reference_id": "region-01J...",
    "geometry_revision_id": "revision-01J...",
    "coordinate_frame": "frame-defined-by-contract"
  }
}
```

### Proposed validated operation command

```json
{
  "request_id": "req-01J...",
  "case_id": "case-01J...",
  "operation_id": "edit.local",
  "candidate_id": "candidate-01J...",
  "input_revisions": {
    "expected_revision_id": "revision-01J..."
  },
  "references": {
    "selection": {
      "selection_id": "selection-client-01J...",
      "kind": "region",
      "reference_id": "region-01J...",
      "geometry_revision_id": "revision-01J...",
      "coordinate_frame": "frame-defined-by-contract"
    }
  },
  "parameters": {
    "edit_kind": "operation-specific-value"
  }
}
```

The AI proposal is not trusted input. Its operation and arguments pass through the same command validation as the direct request.

Canonical command normalization preserves the complete `selection` object shown above. It may resolve `selection_id` or `reference_id` against authoritative state, but it must retain selection kind, immutable `geometry_revision_id`, and `coordinate_frame`. Reducing command references to only `selection_id` is invalid because it discards stale-reference and spatial context. Structural schema validation does not prove that the referenced object belongs to the case.

## Fields by operation type

- Every request requires `request_id` and `case_id`.
- Direct mechanical requests require `operation_id` and typed `parameters`.
- AI requests require `conversation_id` and `message`; operation-specific context is required only when that operation needs it.
- Initial `generate.candidate` requires an immutable `source_anatomy_revision_id` or equivalent backend source reference. It does not require `candidate_id` or `expected_revision_id`.
- Measurement, inspection, editing, and comparison of an existing candidate require `candidate_id`.
- Any operation that depends on current candidate geometry requires `expected_revision_id`.
- Selection or region references are required only when the operation uses them. Each identifies its geometry revision and coordinate frame.
- Compare requires two explicit revision references. Whether either must be current is operation-contract specific.

## Idempotency and freshness

`request_id` replaces `idempotency_key`.

### Proposed client-request fingerprint

Before model invocation or direct-operation execution, normalize the accepted client request and atomically claim `(case_id, request_id)`. Store the canonical client input and its fingerprint.

The fingerprint includes every submitted field that can change interpretation or behavior:

- Common: request-path kind, `case_id`, candidate/source ids, expected revision, and normalized submitted selection or region context.
- AI: `conversation_id` and the complete `message`.
- Direct mechanical: `operation_id` and typed parameters.

It excludes transport headers, connection details, tracing metadata, and frontend camera, hover, or other presentation state not submitted as operation context. `request_id` selects the idempotency record and is not part of its own fingerprint.

### Proposed validated-command fingerprint

After an AI request selects a registered operation and application validation succeeds, persist the validated command before execution. Its separate fingerprint covers operation id, case and object ids, input revision references, normalized selection or region references, and typed operation parameters.

The client-request fingerprint answers whether a retry is the same accepted client input. The command fingerprint identifies the execution input selected for that request. Neither substitutes for the other.

### Proposed retry lifecycle

- New id: atomically persist the request claim and client-request fingerprint before invoking the model or executing a direct command.
- Same id and same client-request fingerprint, completed request: return the original result. Do not invoke the model, execute again, or reject because the original successful commit advanced current revision.
- Same id and same client-request fingerprint, command or run already persisted: attach to that command/run/result.
- Same id and different client-request fingerprint: return `request-id-conflict` before model invocation or mutation.
- Concurrent equivalent requests: one claim owns model selection and execution. Other callers attach to the same request and run.
- Retry before command persistence: attach while the current owner is active. If the owner is recorded as interrupted or its local claim is explicitly expired, one recovery owner may resume from the persisted canonical client request. Only that owner may invoke the model.
- Retry after command persistence but before terminal result: resume or reconcile from command, run, and artifact state. Do not ask the model to reinterpret the request and do not blindly repeat an external operation that may already have run.

Request lifecycle states distinguish at least `claimed`, `command-selected`, `executing`, `ready-to-commit`, and terminal result. Local recovery may reacquire an explicitly interrupted/expired claim; this does not require a broker, distributed lease service, or resumable SSE.

- Revision freshness is checked before execution when required and again at commit.
- Freshness checks guard new execution and commit. They do not block retrieval of a result already completed for the same request.
- Checking `expected_revision_id`, inserting the child revision, and updating the candidate's current revision occur atomically in application storage.
- A stale run does not advance current revision.

Geometry execution and artifact-file writes are external to the SQLite transaction. They are not atomic with commit. A file produced before a stale or failed commit is non-authoritative and is recorded for local reconciliation or cleanup. The initial local design needs no broker, distributed job system, or resumable event infrastructure.

Run states are `accepted`, `executing`, `ready-to-commit`, then one terminal state: `completed`, `unsupported`, `unavailable`, `stale`, or `failed`. Request lifecycle and run lifecycle are related but distinct: a request can be claimed before a run or model-selected command exists.

### Implemented storage idempotency boundary

SQLite storage now reserves `(case_id, request_id)` against an opaque `canonical_identity` supplied by future application code. Reusing the same identity returns the existing reservation; a different identity raises `request-id-conflict`. A run can be bound once to that reservation.

Storage does not compute either proposed fingerprint, choose canonical request fields, claim model ownership, expire claims, resume interrupted work, or prevent duplicate external execution by itself. Those R35–R39 behaviors remain pending review and belong to the future operation service if accepted.

## Immutable revisions and measurements

A geometry-changing commit creates a child revision. It never overwrites the parent artifact. A revision records, when applicable:

- Candidate and parent revision ids.
- Operation id and validated parameters.
- Backend-resolvable artifact reference and content hash.
- Spatial metadata, units, coordinate frame, and transforms.
- Provenance: `real-operation`, `mock`, or `test-double`.

Measurements and observations remain attached to the revision and method that produced them. After an edit, historical measurements remain readable on the parent. They are not current measurements of the child; dependent measurements stay unavailable until recomputed. Original anatomy is separate from candidate edits. Inspection-only operations do not create geometry revisions.

## Application storage contract

`skullfix_ai.storage` exposes SQLite-independent records, errors, and protocols plus `SQLiteApplicationStorage`. Schema version 2 stores cases, source-anatomy revisions, artifacts, candidates, immutable candidate revisions, revision-scoped review results, case-scoped request reservations, and operation runs. Foreign keys are enabled for every connection.

Initial candidate creation inserts a candidate and its parentless first revision against source anatomy in the same case. A child commit starts an immediate SQLite transaction, verifies the expected revision belongs to that candidate and is still current, inserts the immutable child, marks its artifact authoritative, and advances only that candidate's pointer. A stale or failed transaction leaves no child or pointer change. The already-recorded artifact remains non-authoritative for explicit reconciliation.

Typed parameters, spatial metadata, review output, limitations, run input references, run output, and structured errors use JSON serialization and are validated or reconstructed through their shared types when read. Closing and reopening the database does not depend on a checkpoint database.

## Artifact contract

The frontend receives a backend-resolvable artifact object, not a server-local path:

```json
{
  "artifact_id": "artifact-01J...",
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "media_type": "application/vnd.skullfix.geometry+unresolved",
  "retrieval_url": "/api/artifacts/artifact-01J..."
}
```

The media type, file format, coordinate system, and physical units remain unresolved for real geometry. `retrieval_url` is an example backend route shape, not an implemented endpoint.

`retrieval_url` is the only canonical public retrieval field. `retrieval_reference` is not an alias. Internal artifact records and fixture loaders may retain a relative local path, but that path is not accepted by the public artifact reference model.

`LocalArtifactStore` writes or ingests bytes below `SKULLFIX_AI_ARTIFACT_DIR`, generates internal paths from artifact identity and content hash, verifies SHA-256 on reads, and rejects relative paths that escape the configured root. Supplied filenames are never used as authoritative storage paths. This implementation does not deduplicate content between artifact ids.

Artifact records distinguish `pending`, `authoritative`, and `non-authoritative` state. Non-authoritative records can be listed, explicitly retained, or deleted. Deletion is idempotent and rejects authoritative records. File deletion and the later reconciliation-state update are separate recoverable steps, not one transaction. `retrieval_url` remains metadata; no HTTP retrieval endpoint exists yet.

## Common result envelope

The envelope stays stable while `output` is typed by operation.

```json
{
  "run_id": "run-01J...",
  "request_id": "req-01J...",
  "case_id": "case-01J...",
  "operation_id": "generate.candidate",
  "status": "completed",
  "input_revisions": {
    "source_anatomy_revision_id": "anatomy-revision-01J..."
  },
  "output_candidate_id": "candidate-01J...",
  "output_revision_id": "revision-01J...",
  "artifacts": [
    {
      "artifact_id": "artifact-01J...",
      "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "media_type": "application/vnd.skullfix.geometry+unresolved",
      "retrieval_url": "/api/artifacts/artifact-01J..."
    }
  ],
  "output": {
    "kind": "candidate-generation"
  },
  "source": "mock",
  "limitations": [
    "This artifact is not a real reconstruction."
  ],
  "error": null
}
```

Unsuccessful example:

```json
{
  "run_id": "run-01J...",
  "request_id": "req-01J...",
  "case_id": "case-01J...",
  "operation_id": "measure.candidate",
  "status": "unavailable",
  "input_revisions": {
    "expected_revision_id": "revision-01J..."
  },
  "output_candidate_id": null,
  "output_revision_id": null,
  "artifacts": [],
  "output": null,
  "source": null,
  "limitations": [],
  "error": {
    "code": "operation-contract-missing",
    "message": "No agreed contract is available for this real operation.",
    "details": {}
  }
}
```

`operation_id` is nullable when no operation was selected. Revision and artifact fields are nullable or empty when none exist. Error codes are stable; messages and structured `details` provide useful context without inventing geometry.

## HTTP and SSE

The first design is one request that streams its response.

- Authentication, malformed JSON, unsupported media type, and request-schema failures detected before a stream is established use ordinary HTTP errors.
- After streaming starts, runtime, adapter, stale-commit, and persistence failures produce exactly one terminal `result` event.
- `progress` events may appear during execution. They include `run_id`, `request_id`, `case_id`, and a non-terminal step.
- The one terminal SSE event is named `result` and carries the common result envelope.
- The frontend identifies completion by receiving `result`. There is no separate `unavailable` terminal event.

## Browser-executed mechanical operations

A compatible proposed path lets the browser execute geometry and submit the resulting artifact plus `expected_revision_id`, operation provenance, typed parameters, content hash, spatial metadata, and transforms. The backend validates the submission and applies the same idempotency, freshness, and immutable commit rules. The exact browser execution and upload protocol is unresolved until agreed with the mechanical owner.

## Operation slots

- `measure.candidate`: first real integration. Agreed contract unresolved: method, unit, inputs, and limitations.
- `generate.candidate`: agreed real contract unresolved. A provisional AI-owned mock contract is allowed. It must use the common validation, commit, result, and event path and state that it is not a real reconstruction.
- `generate.candidate.from_contour`: unavailable. Not part of the mock.
- `inspect.candidate`: agreed contract unresolved. Mock scope does not include it.
- `edit.local`: agreed contract unresolved. Mock scope does not include it.
- `compare.revisions`: agreed contract unresolved. Mock scope does not include it.

No operation-specific method, unit, algorithm, browser protocol, or real artifact format in this document is teammate-approved.

## Implemented synchronous operation boundary

`skullfix_ai.operations.OperationService` exposes execute_request for direct envelopes and execute_reconstruction for canonical mock commands. The latter is the future AI tool seam. It resolves source context, verifies revision/frame references, claims one canonical run, validates adapter output before publication, ingests artifacts, commits an initial candidate, and persists a shared result. It contains no model or geometry calculation.

`skullfix_ai.integrations.geometry` exports ReconstructionAdapter, ReconstructionContext, ReconstructionArtifactOutput, ReconstructionAdapterError, and DeterministicReconstructionMock. Adapter output is pre-commit bytes and metadata; application storage assigns authoritative candidate/revision identity. Mock output is synthetic JSON and is not a repair mesh or clinical result.

SQLite claim_operation_run binds a case-scoped canonical command identity and one run atomically. Equivalent completed retries return stored outcomes; active duplicates report request-in-progress and do not execute. Conflicts report request-id-conflict. This is post-selection canonical coordination, not the proposed R35–R39 pre-model/recovery lifecycle.

Source and candidate commits enforce artifact lifecycle eligibility. Version 2 adds a cleanup token through an in-place version-1 migration. Cleanup must acquire a live claim before deleting bytes; deletion and completion are not filesystem/SQLite atomic. Reconciled non-authoritative records cannot be republished, and stale record snapshots cannot authorize deletion.

Mutation commit precedes completed-outcome persistence. A lost acknowledgement, uncertain commit, or failed outcome write reports reconciliation-required and does not replay the adapter. Known failed artifacts remain inspectable. A file whose record write failed is identified in the failed run by its public reference and artifact_record_missing detail. Storage outage can prevent even that record; explicit local reconciliation remains necessary. No automatic recovery or exactly-once external execution is claimed.

Stable service outcomes include cross-case-reference, reference-mismatch, stale-revision, operation-contract-missing, operation-unsupported, adapter-failed, adapter-output-invalid, artifact-failed, and persistence-failed. Malformed structural input raises Pydantic ValidationError before execution. Application FastAPI transport and the read-only/fake-model graph are implemented separately; sandbox artifact HTTP retrieval, SSE, checkpoints, Bedrock and real operations remain unimplemented.

## Nine-task queue integration status

ApplicationRepository is the Python implementation of the real app model, separate from sandbox SQLiteApplicationStorage. FastAPI13 routes, built frontend, opt-in dev proxy and actual Chrome smoke are verified. RepositoryManifestReader feeds genuine LangGraph with fake-model proposals and typed tools; explanations use actual observations. Sandbox reconstruction requires an explicit binding and never writes live candidates. Live cutover/removal are gated independently and do not block graph tests. See setup.md, work-summary.md and features/express-to-fastapi/task-board.md for commands/evidence.

## Completed live migration

Read features/express-to-fastapi/cutover-completion.md for exact approved discovery, new empty baseline, backup/restore, full1800second monitoring, retained-data/restart and removal evidence. Active app requires no Express/Multer. Shared FastAPI contracts, actual browser checks, frozen Node data and Python HTTPfault/backup/repository/graph tests retain equivalent coverage. External backup/rollback runtime is retained7days. Full draft acceptance and pending hardening/recovery/provider/geometry requirements are not inferred.
