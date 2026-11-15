# Spec: AI workspace assistant

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-14

## Scoped acceptance record

The owner has accepted R1–R34 only for the foundation boundaries they define: backend authority and ids, the shared operation service, immutable revisions and atomic commit freshness, revision-scoped measurements and spatial metadata, request/run/conversation identity, the common result/SSE contract, checkpoint separation, and the replaceable reconstruction mock.

That acceptance does not make any real measurement, artifact format, browser protocol, edit, inspection, comparison, or contour operation available, and it is not teammate approval of unresolved interfaces. R35–R39 and S21–S24 are new retry clarifications proposed after the foundation acceptance. They require review before an implementation plan may rely on them. The overall spec remains `draft` for that reason.

The owner separately authorized R40, R41, S25, S26, and their shared-schema implementation. The owner also authorized R42–R49 and S27–S34 for the SQLite application-storage and local-artifact slice. These authorizations do not accept R35–R39 or any unresolved real operation.

The owner separately accepted R70–R79 and S51–S58 for the T1C **foreground-volume** measurement contract, then authorized T2 live mechanical implementation of that contract. That does not bind sandbox measurement, enable AI/chat writes or LangGraph `measure.candidate`, or accept edit/inspect/compare/reconstruction contracts. The overall spec remains `draft`.

## UI/backend authority correction

The owner directs that the shipped UI/backend contract takes precedence for app integration. Existing R1–R57 schema, storage, artifact and synchronous-operation implementations describe the isolated Python demo unless explicitly connected through the app workspace adapter. They do not supersede the app database or provide mutation guarantees to its existing HTTP endpoints. The following app-facing requirements are authorized; existing requirement IDs remain stable for historical test traceability.

- R58. The live app's FastAPI API and data/storage/app-model.sqlite own Project → Case → Sample → Candidate → Revision. Python must not create a competing current-revision authority or initialize that database with its sandbox schema.
- R59. App-facing context preserves camelCase ProjectManifest fields at the boundary, sourceAnatomy.spatial, raw volumeHash/volumeId, sample ownership and flat row-major 16-element pose. Source object identity is not an invented source revision id; revision order is not an inferred parent id.
- R60. The workspace adapter loads a fresh authoritative project manifest, resolves sample/source/candidate object selection, verifies ownership and current-revision references, and rejects mismatches with stable errors. Restoring an earlier revision must be reflected by currentRevisionId, not by selecting the maximum revision order.
- R61. AI mutation against the app is disabled while its mutation endpoints lack accepted atomic expected-revision/idempotency and generated-NRRD publication contracts. A preflight GET followed by the existing POST is not a substitute. Existing UI mutations remain unchanged.
- R62. The Python sandbox initializer must reject the app-model.sqlite file and databases bearing the app project/sample/volume schema without altering their metadata.
- R63. Documentation must distinguish real app mechanical capabilities from mock generation and Python demo guarantees, and state the remaining tool facade, graph/model, checkpoint and app mutation work accurately.

## Summary

The AI backend turns a selection and a natural-language request into a supported workspace operation, streams the progress, and explains the tool result. The first real integration is one measurement of the current candidate revision, and only after an agreed measurement contract exists. A labeled reconstruction mock may exercise generation before that. The mock is not a real measurement and not a real reconstruction. The model does not calculate either one.

## Requirements

- R1. Every request must include a client-generated `request_id` and backend-assigned `case_id`. A direct mechanical request identifies a registered `operation_id` and typed parameters. An AI request includes a `conversation_id`, message, and applicable selection context. Required fields vary by operation as proposed in `docs/ai/contracts.md`.
- R2. Before any tool call, the backend must load authoritative case state through the workspace adapter. A submitted selection or region must identify the geometry revision and coordinate frame it refers to. The model must not infer coordinates from message text or an image.
- R3. The backend must stop before execution when a required id is missing, a referenced object is not in the case, or an expected revision is not current. It must check revision freshness again at commit and return a stable error code for the failed check.
- R4. The agent may call only operations present in the tool registry for that case. An instruction that matches no registered operation must be returned as unsupported. It must not be dropped.
- R5. Each registered tool must declare a typed input schema and a structured result. Adding a tool must require a registry entry and a new tool module, not a change to every API route or graph node.
- R6. Mechanical and AI paths must converge on the same validated operation command and operation service. That service owns capability checks, typed argument validation, revision checks, execution coordination, idempotency, and persistence. Neither a graph step nor an API route may bypass it to mutate candidate records.
- R7. A real measurement, edit, or compare is advertised as available only when `docs/ai/contracts.md` marks an agreed contract for it. Until then that real operation returns `operation-contract-missing` and stores no calculated number. A provisional mock contract is not that agreed contract.
- R8. When a measurement contract is filled, a measurement request must execute that operation for the validated revision and return its value, unit, method id, and stated limitation. The assistant must not replace those fields with an estimate.
- R9. Explanation text must mention a number, unit, or geometry claim only when that claim is present in the tool result for the same run.
- R10. A review result must be stored against the revision and method that produced it. Historical results remain readable after an edit but must not be presented as current measurements of a child revision. LangGraph checkpoints must not be treated as application records.
- R11. Checking the expected revision, inserting a child revision, and advancing the candidate's current revision must be one application-storage transaction. If the current revision changes before commit, the run ends `stale`, no child becomes authoritative, and the current-revision pointer does not advance.
- R12. `request_id` is the idempotency identifier, unique within one `case_id`. Equivalent reuse must return or attach to the existing request/run/result rather than create a duplicate mutation, while conflicting reuse returns `request-id-conflict`. The accepted foundation requires idempotent reuse and conflict rejection; the proposed fingerprint and pre-model claim details are defined separately in R35–R39.
- R13. After a stream is established, the API must emit zero or more `progress` events and exactly one terminal `result` event. Terminal statuses are `completed`, `unsupported`, `unavailable`, `stale`, and `failed`. Validation or authentication failures detected before streaming use ordinary HTTP errors.
- R14. A generate request must call the reconstruction adapter and commit the returned backend-resolvable artifact reference as an immutable candidate revision. The model must not emit mesh coordinates. When the adapter is the mock, stored provenance is `mock` or `test-double`, and the run must not be reported as a real reconstruction or the real measurement milestone.
- R15. A generate request that asks for reference-contour-guided regeneration must be returned as unsupported until a separate contract marks that capability available.
- R16. When one local-edit contract is filled, an edit request must run only if that contract supports the requested editable and preserved regions. A successful geometry change creates an immutable child revision recording candidate and parent ids, operation id, validated parameters, artifact reference and content hash, spatial metadata, units, coordinate frame, transforms, and provenance.
- R17. When a compare contract is filled, a compare request must return only the fields that operation produced for two revisions of the same candidate. It must not invent a fit score or a clinical threshold.
- R18. Model id, region, and credentials must come from environment or a local untracked config. The repository must not contain secrets.
- R19. An existing candidate supplied with the request must be checked for case membership and spatial metadata required by the operation. If those checks pass, the run must enter inspection or editing without requiring generation.
- R20. The agent, API, and storage must depend on the shared operation result schema. They must not branch on fields that exist only on the mock.
- R21. Replacing the mock with another adapter that returns the same result schema must not require a change to the API event shape or the review-result table. The new adapter is a real integration only when its contract is marked agreed.
- R22. The mock must not state a clinical measurement, a fit score, or a claim of geometric quality. Its limitation text must say the artifact is not a real reconstruction.
- R23. The backend must assign persistent case, candidate, revision, artifact, annotation, and persisted-region ids. The frontend owns temporary camera, hover, and current-selection state. Optimistic frontend state is not authoritative until a backend commit succeeds.
- R24. `request_id`, `run_id`, and `conversation_id` must be distinct from geometry ids. The client creates a request id for idempotency, the backend creates a run id for execution tracking, and the AI path uses a conversation id for workflow context.
- R25. Initial generation from source anatomy must identify an immutable source-anatomy revision or equivalent backend reference; it must not require a candidate or `expected_revision_id`. Operations on an existing candidate require the candidate id and expected revision when they depend on current geometry.
- R26. The common operation result envelope must keep stable run, request, case, operation, status, input-reference, output-reference, artifact-reference, structured-output, `source` provenance, limitation, and error fields while allowing typed operation-specific outputs.
- R27. Artifact records must expose backend-resolvable references. A frontend contract must not expose an inaccessible server-local filesystem path.
- R28. Artifact files produced before a failed or stale commit must not become authoritative revisions. The run records execution and commit state so local reconciliation can retain, retry, or remove an orphan without claiming external execution or filesystem writes were atomic with SQLite.
- R29. Each run must have an application state sufficient to distinguish at least `accepted`, `executing`, `ready-to-commit`, and terminal `completed`, `unsupported`, `unavailable`, `stale`, or `failed`. Exactly one terminal status is exposed for an established SSE stream.
- R30. A browser-executed mechanical operation must submit its artifact, expected input revision, operation provenance, typed parameters, and artifact metadata to the same operation service. The backend validates them and applies the same commit rules. The exact browser protocol remains a proposed interface pending agreement with the mechanical owner.
- R31. Original anatomy must remain separate from candidate revisions. Inspection-only actions do not create geometry revisions. Geometry-changing operations create child revisions.
- R32. The workspace adapter must expose backend-owned authoritative state and must not maintain an independent current-revision pointer.
- R33. SQLite application records hold authoritative cases, candidates, revisions, artifacts, operation runs, idempotency, annotations, and measurements. LangGraph checkpoints live in a separate database and must not determine current revisions or application idempotency.
- R34. Geometry stays in local artifact files referenced by application records. Mesh blobs must not be placed in LLM context or LangGraph checkpoints.
- R35. Before model invocation or operation execution, the backend must normalize the accepted client request, compute its client-request fingerprint, and atomically claim `(case_id, request_id)`. The fingerprint includes request-path kind and behavior-affecting client fields. For AI requests it includes `conversation_id`, the complete message, case/candidate/revision context, and normalized selection or region references. For direct requests it includes operation id, object and revision references, normalized selection or region references, and typed parameters. It excludes transport metadata and temporary presentation state that is not submitted as operation context.
- R36. After AI selection and application validation, the backend must persist the validated command and a separate command fingerprint before operation execution. The command fingerprint covers operation id, case and object ids, input revisions, normalized references, and typed parameters. It identifies execution input; it does not replace the client-request fingerprint.
- R37. An equivalent retry must reuse persisted state. If the original request is complete, return its original result without rechecking current-revision freshness. If its command or run exists, attach to that command/run rather than invoking the model or executing independently. Freshness checks apply only when starting or committing new work.
- R38. If an equivalent retry arrives before the original run has persisted a model-selected command, it attaches to the claimed request while the owner is active. If the owner is interrupted, one local recovery owner may reclaim the request after an explicit interrupted/expired state and resume from the persisted canonical client request. Recovery must not create concurrent model invocations. If execution may already have produced external effects, reconciliation must inspect persisted run/artifact state rather than blindly execute again.
- R39. A request record must distinguish at least claimed client input, command-selected, executing, ready-to-commit, and terminal state. Incomplete local runs may be resumed, failed, or reconciled from persisted state without claiming that model calls, external geometry execution, filesystem writes, or SSE delivery are transactional. No broker, distributed lease service, or resumable SSE infrastructure is required.
- R40. A public artifact reference must use `retrieval_url` with artifact id, content hash, and media type. It must reject undocumented retrieval aliases. Backend or fixture-local paths are separate internal metadata and must not appear in the public artifact model.
- R41. A canonical command that carries selection context must preserve a structured selection reference containing selection identity, kind, immutable geometry revision id, and coordinate frame, plus a persisted-region id when applicable. Normalization must not reduce that context to `selection_id`.
- R42. Application code must use focused storage and artifact interfaces whose records and domain errors do not expose raw SQLite exceptions or server-local paths as public contracts. SQLite rows, internal artifact locations, public artifact references, and fixture-only metadata remain distinct.
- R43. SQLite application storage must initialize an explicit schema version, enable referential integrity, preserve typed JSON fields without information loss, and remain readable after the connection closes and a later storage instance reopens the same database.
- R44. Application storage must enforce case, candidate, revision, source-anatomy, and artifact ownership. An atomic child commit must check the expected current revision, insert one immutable child, mark its artifact authoritative, and advance only that candidate's current pointer. A stale or failed commit must leave no authoritative child and must not change the pointer.
- R45. Initial candidate creation must reference immutable source anatomy in the same case, create an initial immutable revision without requiring an existing candidate revision, and establish its current pointer atomically.
- R46. Review records must retain case, candidate, revision, operation, method, structured output, provenance, and limitations. Reads for the current revision must not copy or return parent review data as current child data; historical parent records remain readable.
- R47. Storage must enforce uniqueness of `(case_id, request_id)` and bind it to an opaque canonical request identity supplied by future application code. Equivalent identity reuse returns the existing reservation; conflicting reuse returns `request-id-conflict`. Storage does not define fingerprints, claim owners, expiration, model invocation, recovery, or duplicate external-execution prevention.
- R48. Local artifact handling must ingest bytes or files under a configured root, compute and verify SHA-256 content hashes, ignore supplied filenames as storage paths, reject path escape, resolve internal content by authoritative artifact metadata, and produce the canonical `PublicArtifactReference`. The `retrieval_url` does not imply an implemented HTTP endpoint.
- R49. Filesystem writes and SQLite commits are separate. Artifacts recorded before a stale or failed commit remain explicitly non-authoritative and listable for reconciliation. Cleanup must be explicit and idempotent; it must not delete authoritative content or turn an uncommitted file into an authoritative revision.

### Authorized operation-service slice

The owner authorized R50–R57 and S35–S42 for the storage fixes, synchronous operation service, and reconstruction mock. R35–R39 remain proposed. This authorization does not extend to API, graph, model, or real geometry implementation.

- R50. Source and candidate commits must reject deleted, cleanup-claimed, or otherwise ineligible artifacts. Existing authoritative immutable artifacts may be reused. Cleanup requires a durable storage claim that prevents publication of the claimed artifact.
- R51. Application schema version 2 must migrate version-1 databases in place without discarding existing records.
- R52. A run may terminate stale directly from accepted before execution; terminal states remain immutable and require matching terminal statuses.
- R53. Reconstruction uses an injected pre-commit adapter returning bytes, media type, spatial metadata, provenance, and limitations. Application code assigns authoritative output ids and commits records.
- R54. The deterministic reconstruction mock must preserve source spatial context, disclose synthetic provenance, and make no geometry-quality or measurement claim. Invalid adapter output must be rejected before publication.
- R55. The synchronous operation service validates canonical inputs, resolves authoritative context, rejects cross-case or incompatible selection references, checks capabilities, and coordinates execution, artifact recording, commit, and structured outcomes through storage interfaces.
- R56. Canonical operation requests acquire one atomic run claim. Equivalent completed retries return the persisted outcome; competing active owners do not execute another adapter; conflicting input returns request-id-conflict. This does not implement the proposed pre-model retry/recovery lifecycle.
- R57. After a committed mutation, failed result bookkeeping must report reconciliation-required and must not replay execution or claim the mutation did not occur. Known failed or stale execution artifacts remain non-authoritative and inspectable; missing storage prevents a terminal guarantee and requires explicit reconciliation.

## Read-only chat transport scope (authorized 2026-11-14)

- R64. POST `/api/ai/chat` accepts a strict object with request_id, conversation_id, project_id, case_id, object_id, optional expected_revision_id and message. IDs are nonblank strings up to256 characters; message is nonblank up to4000 characters. Extra tool, provider, path or mutation fields are rejected. Existing13 route contracts remain unchanged.
- R65. Each call builds the existing LangGraph with FakeToolModel and only workspace.describe_selection registered. The message is recorded only in transient invocation state; it does not select an operation. No provider, sandbox binding, filesystem-selected root or mutation callable is exposed.
- R66. Context comes from an application-repository read-only SQLite snapshot, without schema initialization, INSERT, storage-directory creation, conversation persistence or artifact writes. Restored current pointers, ownership, spatial metadata, raw hashes and poses are preserved.
- R67. Valid requests return JSON with echoed request/conversation ids, mode fake-read-only, explicit limitations and the actual GraphOutcome. Domain failures (stale, cross-case, missing selection, unavailable context) remain typed graph outcomes; invalid payloads are422, wrong content type415, unexpected server errors500 with a generic error. Existing malformed JSON/parser-size errors keep compatibility behavior.
- R68. A typed TypeScript client posts same-origin /api/ai/chat, accepts AbortSignal, exposes domain outcomes and rejects HTTP/network/invalid-response errors. It has no hidden writes or automatic retries. The AI panel is a one-request-at-a-time view over this client: it submits the active workspace context, shows outcome and limitations, and does not simulate streaming. History persistence, SSE, Bedrock, generated geometry and AI live writes are out of scope.
- R69. Disposable HTTP and actual browser checks prove the client/backend path through Vite dev proxy and built FastAPI, including stale revisions and unchanged manifest/volume bytes. Browser verification does not claim an interactive chat widget exists.

## Accepted foreground-volume measurement contract (T1C) and live mechanical binding (T2)

The owner accepted the following for `measure.candidate` method `candidate.foreground-volume.label-voxel.v1` only, then authorized T2 live mechanical implementation. Details live in `docs/ai/contracts.md`. Sandbox OperationService and LangGraph tool binding remain unbound.

- R70. The first agreed real measurement is foreground-volume: `operation_id` `measure.candidate`, `method_id` `candidate.foreground-volume.label-voxel.v1`, `measure_kind` `foreground-volume`, unit `mm3`. It sums occupied labelmap voxels (`value > 0`) in NRRD physical space. It is not cavity, implant, cranial-cavity, or missing-bone volume.
- R71. Required direct inputs are `request_id`, `project_id`, `case_id`, `candidate_id`, `expected_revision_id`, and `parameters.measure_kind = "foreground-volume"`. The authoritative volume is the live revision's bytes and raw lowercase hex `volumeHash`. The owning sample must be `spatiallyVerified` with millimetre units. Supported NRRD v1 inputs are `dimension: 3`, `type: unsigned char` or `uchar`, and `encoding: raw` or `gzip`/`gz`, with decoded payload length exactly `∏sizes`.
- R72. When `space directions` are present, v1 accepts only finite nonzero mutually orthogonal vectors with a one-to-one cardinal-axis mapping and non-singular basis; voxel volume is `abs(det(B))`. Cardinal/orthogonal checks are a v1 scope restriction. Present-but-incomplete, malformed, or invalid directions must be rejected. Spacings-only `s0*s1*s2` is allowed only when `space directions` are entirely absent and verified mm spacings match application metadata. Patient orientation must not be inferred from spacings alone.
- R73. The metric is intrinsic foreground volume of the stored NRRD grid and is independent of candidate placement pose. Rigid placement that preserves volume identity/hash must not change the intrinsic value. Results must not be presented as post-display-transform volume without a separate contract.
- R74. Unique `(case_id, request_id)` reservations persist an opaque canonical identity covering path kind, project/case/candidate ids, expected revision, operation id, measure kind, and method id. A short `BEGIN IMMEDIATE` transaction claims or checks the reservation and commits before decode/count. SQLite write serialization is not a request-key lock. Matching completed requests return the original stored result before freshness checks, including when a later revision is current. Conflicting identities return `request-id-conflict`. Matching in-progress requests use bounded wait (≤2000 ms, ≤50 ms poll) then nonterminal `request-in-progress` (HTTP 409); waiters must not steal ownership, execute, or fail the owner. Incomplete crash reservations require explicit reconciliation (`reconciliation-required`); automatic takeover is out of scope. Completing a reservation and persisting a successful measurement occur atomically with a current-revision check.
- R75. Hash mismatch between live `volumeHash` and SHA-256 of read bytes is `artifact-integrity-failure` with domain status `failed` and HTTP 500, with no numeric output and no successful measurement row. Public errors must not expose filesystem paths. Unsupported datatype, dimension, encoding, grid, spacing, payload length, or metadata mismatch remains `operation-unsupported` (HTTP 422), distinct from integrity failure. A matching completed retry returns the historical result without claiming current integrity was reverified.
- R76. Live persistence uses ApplicationRepository authority (`candidate_measurement_results` / revision-scoped rows plus request reservations). Measurement must not create a geometry revision. Sandbox `SQLiteApplicationStorage` review rows must not be presented as live candidate measurements. Mechanical route/service: `POST /api/candidates/{id}/measurements` via `ForegroundVolumeService`; retrieval by revision. Sandbox `OperationService` must not auto-enable this method or point sandbox storage at live `app-model.sqlite`.
- R77. Advertising or executing foreground-volume requires all of: (1) this agreed contract, (2) the live service/adapter implemented and bound, (3) runtime capability checks passing. Contract acceptance alone does not make the tool available. Until those gates pass, the operation must not be advertised as available and must not store a calculated foreground-volume as a live success. AI/chat remains read-only metadata and must not gain a measurement mutation tool from this acceptance.
- R78. Operation-specific `output` carries `kind`, `method_id`, `measure_kind`, `value`, `unit`, `measured_revision_id`, raw-hex `volume_hash`, `foreground_voxel_count`, and `voxel_volume_mm3`. Envelope fields carry request/run identity, case/candidate references, status, provenance from actual execution (`real-operation` when live service runs), limitations, and errors. Provenance must not come from a model assertion.
- R79. Stated limitations must disclose labelmap foreground occupancy, v1 orthogonal/spacings-only restrictions, independence from placement pose, and the absence of clinical pass/fail or fit-score claims.

## Success criteria

- S1. Given a case with candidate C at revision R, and a filled measurement contract, when the user asks for that measurement of C, then the stored review result cites R and the operation's value and unit.
- S2. Given the same request, when the model response adds a number that is not in the tool result, then that response is rejected and the stored result is unchanged.
- S3. Given the expected revision is not current, when the request arrives, then no tool is called and the response names the revision mismatch.
- S4. Given the user repeats the same `request_id` with the same canonical validated payload, when the retry is processed, then it returns or attaches to the existing run and only one authoritative result or revision exists.
- S5. Given the revision changes after validation and before storage, when storage is attempted, then the run is stale and the new revision has no review result from that run.
- S6. Given no measurement contract is filled, when the user asks for a volume, then the result reason is `operation-contract-missing` and no numeric volume is stored.
- S7. Given a generate request that asks to follow a reference contour, when contour guidance is not marked available, then the response is unsupported and no revision is created.
- S8. Given a filled edit contract that does not support preserved regions, when the user asks to keep a region unchanged, then no revision is created and the response says the constraint is unsupported.
- S9. Given a generate request served by the mock adapter, when the run is stored, then `source` is `mock` or `test-double` and the explanation does not call the artifact a real reconstruction.
- S10. Given S9's result schema, when a second adapter returns that same schema, then the API event and the stored review row accept it without a mock-only branch. The second adapter is not described as real geometry unless its contract is marked agreed.
- S11. Given equivalent valid mechanical and AI requests, when each reaches the operation service, then both use the same argument validation, revision freshness checks, and commit rules.
- S12. Given a successful geometry change from revision R, when commit succeeds, then a new immutable child revision R2 becomes current and R and its artifact remain unchanged.
- S13. Given another commit advances the candidate after execution starts, when this run attempts commit with the older expected revision, then its terminal status is `stale`, no child from that run becomes authoritative, and current revision is unchanged by that run.
- S14. Given two concurrent requests with the same `request_id` and canonical validated payload, when they are received, then one operation execution owns the mutation and both callers resolve to the same run or result.
- S15. Given a used `request_id`, when a request reuses it in the same case with a different canonical validated payload, then the backend returns `request-id-conflict` and executes no second mutation.
- S16. Given a measurement on R and a geometry edit producing R2, when the candidate is read, then the measurement remains in R's history and is not shown as a current measurement of R2 until recomputed.
- S17. Given an operation result with spatial metadata, when a child revision is committed, then its units, coordinate frame, and transforms are preserved or an explicit validated transform is recorded.
- S18. Given generation through the reconstruction mock, when the result commits through the common operation path, then it creates an immutable revision with `mock` or `test-double` provenance and no measurement or geometric-quality claim.
- S19. Given an established SSE stream, when the run succeeds or fails, then the frontend receives zero or more `progress` events followed by exactly one `result` event whose terminal status identifies completion.
- S20. Given the checkpoint database is unavailable but application storage is readable, when candidate history is requested, then its revisions, current pointer, artifacts, and operation history remain readable.
- S21. Given an AI request completed a revision-changing commit, when the same case-scoped `request_id` and equivalent client input are retried after the candidate current revision advanced, then the original result is returned without another model call, execution, or stale rejection.
- S22. Given two concurrent identical AI requests, when neither has been processed, then one request claim owns model selection and execution while the other attaches to the same request/run/result.
- S23. Given an existing case-scoped `request_id`, when any behavior-affecting client field differs, including the AI message, then `request-id-conflict` is returned before another model call or mutation.
- S24. Given an equivalent retry arrives after request claim but before a command was persisted, when the original owner is active it attaches without another model call; when the owner is explicitly interrupted or expired, one recovery owner resumes from the persisted canonical client request.
- S25. Given a public artifact payload, when it contains `retrieval_url` it round-trips without loss; when it substitutes `retrieval_reference` or a local path, structural validation rejects it.
- S26. Given equivalent mechanical and AI mock-generation inputs with a revision-bound selection, when each is represented as a canonical command, then both preserve the same selection id, kind, geometry revision, coordinate frame, and typed mock parameters. A cross-case selection remains structurally valid for later application membership rejection.
- S27. Given the prepared synthetic fixtures, when they are seeded through public storage and artifact interfaces, then both cases, source anatomy, candidate history, spatial metadata, provenance, artifact hashes, and the nonnumeric review sentinel are readable after closing and reopening storage.
- S28. Given a candidate at R2 and a pending test-double artifact, when a child commit expects R2, then one immutable R3 becomes current, R2 and its artifact remain unchanged, and R3 preserves parameters, provenance, units, frame, and transforms.
- S29. Given two independent storage connections both observed R2, when one commits R3 before the other commits against R2, then the second commit returns stale, creates no authoritative child, leaves R3 current, and records its artifact as non-authoritative.
- S30. Given an initial candidate request referencing source anatomy in the same case, when storage commits it, then the candidate and initial revision become readable without a prior candidate revision. Cross-case source or artifact references create nothing authoritative.
- S31. Given a review sentinel on R1 while R2 is current, when history and current review results are read, then the sentinel remains in R1 history and is absent from R2 current results.
- S32. Given artifact bytes or a synthetic fixture file, when local artifact storage ingests and resolves it, then the returned hash matches the bytes, internal paths remain within the configured root, and public metadata contains no local path. A traversal path is rejected.
- S33. Given a stale or rolled-back revision commit after an artifact was recorded, when reconciliation is inspected, then the artifact is non-authoritative and can be explicitly retained or deleted without changing candidate history.
- S34. Given the same case-scoped request id and canonical identity, when storage reserves it twice, then the same reservation is returned; a different identity returns `request-id-conflict`. This does not assert one model call or one external operation execution.

- S35. Given a deleted artifact, when source or candidate publication is attempted, then no authoritative record is created from it.
- S36. Given competing cleanup and publication, when one acquires storage authority first, then the other cannot delete published content or publish cleanup-claimed content.
- S37. Given a version-1 database and an accepted run, migration preserves records and pre-execution stale termination succeeds without execution or mutation.
- S38. Given a valid fixture command, generation through the service and mock persists one candidate/revision with source metadata and explicit mock limitations.
- S39. Given invalid context, unavailable capability, invalid adapter output, or execution failure, the service returns a stable outcome without publishing a candidate.
- S40. Given concurrent equivalent canonical commands, one owner executes. Completed retries return the persisted result and conflicting reuse executes nothing.
- S41. Given failure after mutation commit but before outcome persistence, the service reports reconciliation-required, leaves the run inspectable, and an identical retry does not execute again.
- S42. Given a second compatible adapter test double, the same service, schemas, and storage accept its output without mock-specific branches.

- S43. Given a real app project manifest, Python resolves candidate/sample/source context with the same ids, spatial metadata and pose that the UI consumes.
- S44. Given restore points currentRevisionId to an older revision, context uses that revision and its pose rather than the highest order.
- S45. Given a cross-project/case/sample/candidate mismatch or stale expected revision, context fails explicitly without issuing a mutation.
- S46. Given the sandbox initializer is pointed at app metadata, it refuses without changing user_version, tables or data.
- S47. Given a requested app mutation, the read-only workspace adapter rejects it without a POST or local candidate write.

- S48. Given a restored candidate, a chat call returns that revision and metadata through all five graph steps while stored data remains unchanged.
- S49. Invalid fields, stale/cross-case selection or a request asking for writes cannot expose a mutation capability or initialize storage.
- S50. A same-origin browser call receives fake-read-only responses in development and built serving, with unchanged source bytes and revision pointer.
- S59. Given an active app selection, when the user submits a panel message, then the panel sends the typed same-origin FastAPI request and renders the returned read-only outcome and limitations. It never contacts an independently configured LangGraph server or shows locally generated clinical content.

- S51. Given a verified mm candidate revision with 12 foreground voxels and 1×1×1 mm spacing (or 2×3×4 mm spacing), when foreground-volume runs under an available live binding, then the stored result is 12 mm³ (or 288 mm³) with method id `candidate.foreground-volume.label-voxel.v1` and cites that revision.
- S52. Given equivalent raw and gzip encodings of the same grid, or an all-background volume, when the operation completes, then raw/gzip values match and all-background yields a valid completed zero.
- S53. Given truncated payload, extra decoded bytes, unsupported datatype/dimension/encoding, invalid/nonpositive spacing, present-but-invalid or incomplete `space directions`, duplicate cardinal axes, singular basis, or header/manifest mismatch, when the request is processed, then the outcome is `operation-unsupported` (or grid-orientation detail) with no successful measurement row.
- S54. Given a volume whose bytes do not match the live revision `volumeHash`, when measurement is attempted, then the outcome is `artifact-integrity-failure` / `failed` / HTTP 500 with no numeric success row.
- S55. Given a matching completed foreground-volume result for R1, when the same `request_id` and canonical identity are retried after R2 is current, then the original R1 result is returned without freshness rejection and without creating another success row. Conflicting identity reuse returns `request-id-conflict`.
- S56. Given a matching in-progress reservation, when a waiter retries, then after bounded wait it receives nonterminal `request-in-progress` if still incomplete, does not execute, and does not fail the owner. An incomplete crash reservation yields `reconciliation-required` without automatic takeover.
- S57. Given current revision changes between claim and completion transaction, when persistence is attempted, then the run is `stale` and no successful measurement row is stored. Rigid placement that preserves volume/hash leaves intrinsic foreground-volume unchanged across the placement revision.
- S58. Given a foreground-volume result stored on R1, when an authorized non-`edit.local` transition makes R2 current (test fixture or rigid placement), then the R1 result remains historical on R1 only and is not treated as a current measurement of R2 even if numeric values would match.

## Design

The target AI subproject is `backend/ai`. It proposes a local FastAPI service. LangGraph proposes a registered tool for AI requests; direct mechanical requests name an operation and typed parameters. Both become the same validated operation command. LangChain's Bedrock chat integration calls a configurable Claude Sonnet model. SQLite application storage owns authoritative state only inside the isolated AI sandbox; the live UI repository remains separate. A separate SQLite file stores LangGraph checkpoints. Geometry files stay local and are addressed through artifact records, not raw paths in frontend contracts or blobs in checkpoints.

A run moves through accepted, executing, ready-to-commit, and one terminal state. Commit rechecks revision freshness and atomically inserts the child revision and advances the current pointer. External geometry execution and filesystem writes are not part of that SQLite transaction; failed commits leave non-authoritative artifacts for local reconciliation. SSE carries progress and exactly one terminal result after the stream starts.

Original anatomy, intended repair, proposed design, and review results stay separate. A proposed design is a candidate and immutable parented revisions. A review result holds measurements and observations for one revision and method. Checkpoints can resume workflow state. They are not the revision log, idempotency store, or current-revision authority.

Tools are thin modules under `tools/`. Shared checks and the call into an adapter live under `operations/`. Bedrock, workspace, and geometry each have an integration module. The reconstruction mock is one geometry adapter. The agent, API, and storage do not import that mock's private types.

The first real integration milestone is S1 / S51–S58 after the agreed foreground-volume contract (R70–R79). Runtime availability still requires a separate implemented live binding (R77). A mock may be used for S9 and S10 before that. S9 does not satisfy S1. This spec is still draft overall. Contract acceptance does not, by itself, approve implementation. The workflow for that step is `docs/ai/workflow.md`.

## Where it lives

- Live app integration contract: `docs/ai/app-integration.md`
- Live workspace adapter: `backend/ai/src/skullfix_ai/integrations/workspace/`
- App manifest schemas: `backend/ai/src/skullfix_ai/schemas/workspace.py`
- FastAPI HTTP and workspace proof: `backend/ai/tests/integration/api/test_app.py`, `backend/ai/tests/integration/workspace/test_app_workspace.py`
- Live foreground-volume measurement: `backend/ai/src/skullfix_ai/application/foreground_volume.py`, additive tables/methods on `backend/ai/src/skullfix_ai/application/sqlite.py`, routes `backend/ai/src/skullfix_ai/api/routes/measurements.py` (`POST /api/candidates/{id}/measurements`, `GET …/revisions/{revision_id}/measurements`). Proof: `backend/ai/tests/integration/api/test_measurements.py`. Scoped plan: `features/ai-workspace-assistant/plans/t2-foreground-volume.md`.

- Backend: `backend/ai/src/skullfix_ai/`
- AI docs: `docs/ai/`
- Feature docs: `features/ai-workspace-assistant/`
- Tests: `backend/ai/tests/unit/`, `backend/ai/tests/integration/`, `backend/ai/tests/live/`. Ownership of the subpaths is in `.agents/assignments/ai/README.md`. Agents 01–03 own their component tests. Agent 04 owns cross-component workflows, live checks, and evaluation. The main agent owns shared fixtures and root test configuration.
- Evaluation: `backend/ai/evaluation/`
- Frontend: the read-only chat client seam under `app/src/api/` and `app/src/ui/AiChatPanel.tsx` are scoped here; canvas/manual construction remains owned by its canvas feature spec.

## Decisions

- D1. The AI subproject proposes Python, FastAPI, Pydantic, LangGraph, LangChain AWS, Amazon Bedrock, optional LangSmith, HTTP/SSE, SQLite, and local artifacts. Why: that is the AI owner's proposed local stack. Alternatives: another Python web framework, or calling Bedrock without LangGraph. `docs/project.md` still says the product-wide stack is undecided, so this decision binds only this subproject after acceptance.
- D2. One AI feature folder covers the assistant, with measurement as the first milestone. Why: the owner asked for a single AI intent and spec. Alternatives: separate feature folders per operation. Those can still be split later if a spec grows past one working session.
- D3. Capabilities, revision checks, and idempotency live in application code, not only in the prompt. Why: a prompt cannot enforce a stale revision.
- D4. `features/measure-candidate/` remains an earlier draft of the measurement milestone. Why: it was already written. It is not a second spec. Implementation follows this spec.
- D5. A reconstruction mock is allowed behind the shared adapter before a real generator exists. Why: the workflow can be exercised without waiting for mechanical tools. The mock is labeled and is not the real measurement milestone. Real geometry ownership is undecided. Alternatives: block all generation until an agreed contract exists. That alternative still applies to advertising a real capability.
- D6. The backend owns persistent application state and immutable revision history. The frontend owns temporary presentation state. Why: one current-revision authority is required for stale-write protection and history.
- D7. Mechanical and AI requests share one operation service and common envelope. Why: model-selected actions must receive the same validation and commit rules as direct controls.
- D8. `request_id` replaces `idempotency_key`. It is unique within a case and binds to the canonical validated command fingerprint. Why: retries and conflicting reuse need one explicit identifier.
- D9. SSE has `progress` and one terminal `result` event. Why: one terminal shape removes completion ambiguity.
- D10. **Proposed, pending review:** persist a client-request fingerprint before model invocation and a separate validated-command fingerprint before execution. Why: an AI retry must not ask the model to reinterpret equivalent input, and a completed retry must return its original result even after a successful revision change.
- D11. Application persistence uses standard-library SQLite schema version 1 and a separate contained local artifact root. Request reservation stores an opaque caller-supplied canonical identity rather than implementing the proposed retry fingerprints. Why: this provides the accepted authority, atomic commit, and conflict primitives without adopting pending model/recovery behavior or adding an ORM.

## Flagged concerns

- The product draft in `hackprinceton_intent.md` leaves the first edit and prepared-versus-raw-CT input open. This spec assumes prepared cases. The first measurement **contract** is resolved as foreground-volume (R70–R79); the live mechanical binding is implemented under separate T2 authorization.
- Resolved: AI/backend work uses `docs/ai/workflow.md`, also referenced from `AGENTS.md`. Intent and spec may be updated in one round. Both remain draft overall. Scoped acceptances do not accept the whole documents. After a scoped contract acceptance, implementation still needs separate authorization. Other features keep a gate between each document.
- Live mechanical foreground-volume calculation is implemented in `ForegroundVolumeService`. Edit, inspect, compare, and real reconstruction contracts remain unresolved. LangGraph/`measure.candidate` tool binding and AI mutation remain out of this slice.
- A reconstruction mock can exercise S9. It must not be described as S1 or as real reconstruction.
- Sandbox `OperationService` still returns `unavailable` / `operation-contract-missing` for unbound real operations. Live HTTP measurement must not present sandbox review rows as candidate measurements.
- R35–R39 and S21–S24 are proposed retry behavior, not part of the previously accepted foundation scope and not implemented. T1C mechanical idempotency (R74) does not adopt that pre-model recovery framework.
- Resolved: R40, R41, S25, and S26 make `retrieval_url` and full revision-bound selection references canonical. The owner authorized their schema implementation.
- Resolved: R42–R49 and S27–S34 define the authorized local storage slice without adopting the proposed R35–R39 retry lifecycle.
- Resolved: R70–R79 and S51–S58 define the accepted foreground-volume contract; T2 implements the live mechanical binding (R76–R77 gates for that path). Sandbox/AI tool enablement remains separate.

## Open questions

1. ~~Which measurement operation is first, and where is its method, unit, inputs, and limitation written?~~ **Resolved:** `docs/ai/contracts.md` + R70–R79 / S51–S58; live mechanical runtime bound via T2 (`ForegroundVolumeService` + measurement routes). LangGraph/AI tool bind remains open.
2. Which local edit is first, and which preserved-region constraints can it honor?
3. Which artifact format, units, coordinate frame, and transforms are required for each real geometry operation?
4. Does the authoritative workspace adapter run in-process or over HTTP?
5. What exact browser-execution submission protocol can the mechanical owner support?
6. Which Bedrock model id is enabled for the demo account?

## Out of scope

- The 3D scene. Real geometry algorithm design. This spec does not assign that work.
- Raw CT ingestion, segmentation, and model training.
- Reference-contour-guided regeneration, until a contract says it is available.
- Cited evidence retrieval.
- Clinical certification, manufacture, and outcome prediction.
- A universal fit score or pass threshold.

## Queue implementation evidence (not whole-document acceptance)

The owner authorized the nine-task queue. Current-baseline Python application repository and FastAPI transport, disposable cross-runtime/S13/browser verification and genuine fake-model LangGraph are implemented. Live cutover and active-app Express removal are complete after approved1800second observation. D1–D5 hardening and proposed recovery are not inferred accepted. Live authority is FastAPI/ApplicationRepository on the recorded application root. See features/express-to-fastapi/task-board.md and docs/ai/work-summary.md.

Implemented locations: backend/ai/src/skullfix_ai/application/, backend/ai/src/skullfix_ai/api/, backend/ai/src/skullfix_ai/agent/, backend/ai/src/skullfix_ai/tools/, backend/ai/tests/integration/application/, backend/ai/tests/integration/api/, backend/ai/tests/integration/agent/, app/tests/backendContract/ and app/e2e/migration.e2e.ts. No geometry/model/live-mutation capability is implied.

Read-only chat implementation locations: `backend/ai/src/skullfix_ai/api/routes/chat.py`, `app/src/api/chat.ts`, `backend/ai/tests/integration/api/test_chat.py`, `app/tests/chatClient.test.ts`, `app/e2e/chat.e2e.ts`. Chat widget remains deferred.

## Authorized recovery chat slice (2026-11-14)

- R90. The existing Assistant panel sends JSON to same-origin `/api/ai/chat` with project/case/canonical object/current revision identity. Source document IDs must resolve to source object IDs; invalid or absent context disables sends. No frontend canned clinical replies.
- R91. Backend loads authoritative context on every turn and binds only the metadata tool. Bounded prior human turns may disambiguate follow-ups but never supply facts, ownership or tool permissions. Unsupported measurements, constraints and reconstruction disclose their unavailability. No greeting fallback after user input.
- R92. Each conversation is scoped to the full context identity including revision. Scope changes, reset and unmount abort in-flight requests and suppress late responses. A fresh conversation cannot inherit another context's turns; only successful, bounded messages enter subsequent history. No automatic retry on error/stale context.
- R93. Development adds an exact-path AI-only forwarding middleware before the unchanged SQLite apiPlugin. CRUD stays with that plugin. FastAPI and Vite must use the same explicitly selected storage root; proxy errors surface as errors, never canned success. Built serving uses FastAPI's same-origin route. No CORS wildcard or provider credentials.
- R94. Keep the recovery markup/classes, CSS, studio, grid and slice behavior. Only thin context wiring, truthful read-only copy and client state may change. No Bedrock, AI writes, cutover, commit or push.
- R95. Prove the screenshot's two prompts no longer return a greeting, canonical context routing, stale/foreign selection, reset/late response guards, failed transport, no-write manifest invariance, and real browser chat through Vite plus FastAPI with disposable storage.

## Gemini LangGraph chat (2026-11-14, pending user acceptance)

- R96 (added). FastAPI can bind a native LangGraph agent to `POST /api/ai/chat`: `StateGraph(MessagesState)` → `agent` → `tools_condition` → `ToolNode` → `agent`, checkpointed with `InMemorySaver` keyed by conversation id plus full selection identity. Model: `ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)`. Lives in `backend/ai/src/skullfix_ai/agent/gemini_graph.py`. Supersedes R93's "no provider credentials" only when the operator opts in.
- R97 (added). Tools (`skullfix_ai/tools/langchain_read_tools.py`) are read-only and request-bound: `describe_selection`, `list_case_objects`, `list_candidate_revisions`. They close over the server-loaded context/manifest; the model cannot pick ids. Unregistered tool calls return ToolNode errors. Stale/foreign context fails before the model runs. Provider errors return `unavailable`/`model-unavailable` without details.
- R98 (added). `create_app` defaults to the fake model (tests stay offline). The CLI selects Gemini via `--chat-provider gemini`, `SKULLFIX_CHAT_PROVIDER`, or automatically when `GOOGLE_API_KEY`/`GEMINI_API_KEY` is set. Response `mode` is `gemini-read-only` or `fake-read-only`.
- R99 (added). CORS allows only `http://{127.0.0.1,localhost}:{5173,5174}` (override: `--cors-origins` / `HACK_CORS_ORIGINS`), never a wildcard. The client calls `${VITE_LANGGRAPH_API_URL}/api/ai/chat` when set, else same-origin through the Vite forwarder. The badge shows Live only when a reply reports `gemini-read-only`.
- Proof: `backend/ai/tests/integration/api/test_gemini_chat.py` (scripted chat model, no network), `app/tests/aiChatClient.test.ts`, `app/tests/ui/aiChatPanel.test.tsx`. Not proven: a real Gemini round trip (needs a key).
