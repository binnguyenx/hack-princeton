# Publication scope

This branch implements schemas and fixtures, SQLite storage/artifacts, operation service and reconstruction mock. Any scenario below requiring later components remains planned. Original scope/status details are consolidated in the final integration PR.

# Publication scope

This branch implements schemas and fixtures, SQLite storage/artifacts. Any scenario below requiring later components remains planned. Original scope/status details are consolidated in the final integration PR.

# Publication scope

This branch implements schemas and fixtures. Any scenario below requiring later components remains planned. Original scope/status details are consolidated in the final integration PR.

# AI/backend acceptance scenarios

Requirements remain in [the feature spec](../../../features/ai-workspace-assistant/spec.md). This index links fixture inputs to expected observable behavior without copying the requirements. The fixture data is documented in [fixtures/README.md](fixtures/README.md).

Fixture and storage-foundation validation are runnable now. Full operation/API scenarios below await implementation unless explicitly stated otherwise. A `mock` exercises provisional reconstruction only. A `test-double` isolates contract behavior and is not a real operation.

## VF-01 — Fixture integrity

- **Related:** R2, R14, R16, R22–R27, R31–R34, R40, R41; S17, S18, S20, S25, S26.
- **Inputs and initial state:** `fixtures/demo-state.json`, request and result samples, and every file under `fixtures/artifacts/`.
- **Action:** Run `backend/ai/tests/integration/workflows/test_demo_fixtures.py`.
- **Expected result:** Production-shaped payloads pass the shared schemas; IDs and cross-file references are consistent; artifact paths and hashes resolve; revision parentage, current pointers, spatial metadata, transforms, provenance, mock labels, and sample request/result references validate. The validator rejects the obsolete public artifact field and reduced command-selection shape.
- **State change:** None.
- **Kind:** Fixture validation using synthetic mock and test-double data.
- **Status:** Runnable now.

## SF-01 — Authoritative storage and local artifacts

- **Related:** R10–R12, R23, R24, R27–R29, R31, R33, R34, R42–R49; S12, S13, S16, S17, S20, S27–S34.
- **Inputs and initial state:** The synthetic demo state, copied artifact bytes, temporary application database, and temporary artifact root.
- **Action:** Run `backend/ai/tests/unit/storage/test_local_artifacts.py` and `backend/ai/tests/integration/storage/test_sqlite_storage.py`.
- **Expected result:** Schema version 2 reopens and version 1 migrates; fixture history and review association persist; initial and child revisions commit atomically; stale, cross-owner, and failed commits create no authoritative child; artifact paths/hashes remain contained; request conflicts and run transitions use storage-domain results; non-authoritative artifacts remain reconcilable.
- **State change:** Temporary files and database rows only; fixture sources remain read-only.
- **Kind:** SQLite and filesystem integration using synthetic mock/test-double metadata, not geometry execution.
- **Status:** Runnable now. It proves storage behavior only, not an operation service, API/SSE, adapter, external-execution deduplication, or retry recovery.

## AF-01 — Valid reconstruction mock

- **Related:** R1–R6, R13, R14, R20–R22, R25–R29, R32; S9–S11, S17–S19.
- **Inputs and initial state:** `request-mock-generate-ai`, primary prepared case, source revision `anatomy-revision-primary-v1`, and `selection-source-primary`.
- **Action:** Submit the AI request; the model proposes `generate.candidate`; the common operation path invokes the provisional mock.
- **Expected result:** Progress may stream, followed by exactly one terminal `result` with `completed`, a backend artifact reference, a candidate and immutable revision reference, `source: mock`, fixture-local spatial metadata, and the stated non-reconstruction limitation. No measurement or quality claim appears.
- **State change:** One candidate and initial immutable revision commit atomically. The result shape is represented by `result-mock-generate-completed`.
- **Kind:** Reconstruction mock.
- **Status:** Planned; mock generation through the synchronous operation service and storage is runnable; AI interpretation, explanation, and SSE remain planned.

## AF-02 — Cross-case selection rejection

- **Related:** R2, R3, R6; S3, S11.
- **Inputs and initial state:** `request-cross-case-selection`; its case is primary while its selection belongs to secondary.
- **Action:** Submit the AI request.
- **Expected result:** Application validation rejects the reference before geometry execution. No candidate, revision, artifact authority, or current pointer changes. The exact stable cross-case error code must be added to the agreed error catalog before implementation.
- **State change:** None.
- **Kind:** No operation; validation scenario.
- **Status:** Planned; canonical source membership uses cross-case-reference; AI request interpretation remains planned.

## AF-03 — Stale expected revision

- **Related:** R3, R11, R29; S3, S5, S13.
- **Inputs and initial state:** `request-stale-measurement`; candidate current revision is R2 and the request expects R1.
- **Action:** Submit the direct request.
- **Expected result:** No geometry or measurement executes. If streaming is established, exactly one terminal `result` has status `stale`. R2 stays current.
- **State change:** None.
- **Kind:** No real operation executes.
- **Status:** Planned. The stale storage-commit invariant is runnable in SF-01; request validation, execution suppression, and terminal transport remain unimplemented.

## AF-04 — Identical idempotent retry

- **Related:** R12, R24, R29; S4, S14.
- **Inputs and initial state:** `request-duplicate-original` and `request-duplicate-identical-retry`, which have the same `request_id` and validated payload.
- **Action:** Submit them concurrently.
- **Expected result:** One request owns execution. Both callers attach to the same run or result. No duplicate authoritative candidate revision is created.
- **State change:** At most one authoritative mutation.
- **Kind:** Reconstruction mock when execution is enabled.
- **Status:** Planned. Storage reservation proves same-identity reuse only; it does not prove one operation execution or caller attachment.

## AF-05 — Conflicting request-id reuse

- **Related:** R12, R24; S15.
- **Inputs and initial state:** `request-duplicate-original` followed by `request-duplicate-conflict`; the case and `request_id` match but typed parameters differ.
- **Action:** Submit the conflicting request.
- **Expected result:** Reject with `request-id-conflict`; no second operation executes and no authoritative record advances.
- **State change:** None from the conflicting request.
- **Kind:** No second operation.
- **Status:** Planned. Storage conflict detection is runnable in SF-01; canonical operation-service duplicate/conflict tests are runnable; full AI request handling is planned.

## AF-06 — Unsupported contour-guided request

- **Related:** R4, R15, R29; S7, S19.
- **Inputs and initial state:** `request-unsupported-contour` and current candidate revision R2.
- **Action:** Submit the AI request.
- **Expected result:** Exactly one terminal `result` has status `unsupported`. No revision or artifact is created. The reconstruction mock is not extended to contour guidance.
- **State change:** None.
- **Kind:** Unsupported operation; no mock execution.
- **Status:** Planned.

## AF-07 — Real measurement contract unavailable

- **Related:** R7–R9, R13; S1, S2, S6, S19.
- **Inputs and initial state:** `request-unavailable-real-measurement` and candidate revision R2.
- **Action:** Submit the direct measurement request.
- **Expected result:** Exactly one terminal `result` has status `unavailable`, error `operation-contract-missing`, and no numeric output. `result-real-measurement-unavailable` shows the expected properties.
- **State change:** No review result, candidate revision, or artifact is created.
- **Kind:** Real operation requested but unavailable.
- **Status:** The current small unit slice checks only status, reason, and null value. The full application scenario is planned. Numeric expectations are deferred until a real method, units, and verified geometry are agreed.

## AF-08 — Immutable child commit and spatial metadata

- **Related:** R11, R16, R27–R31; S5, S12, S13, S17.
- **Inputs and initial state:** Primary candidate at R2 and a test-double geometry result carrying fixture-local spatial metadata and a resolvable artifact.
- **Action:** Exercise the storage/operation commit seam with expected revision R2.
- **Expected result:** A new child references R2; R2 and its artifact remain unchanged; metadata and transforms are preserved or an explicit validated transform is stored. Freshness check, child insertion, and current-pointer update are atomic.
- **State change:** One child becomes current only after successful commit. A stale competing commit creates no authoritative child.
- **Kind:** Test double for commit behavior, not an advertised edit or reconstruction capability.
- **Status:** Storage portion runnable in SF-01; canonical generation integration is tested; public edit execution remains unavailable. No public edit operation is implied.

## AF-09 — Historical measurement scoping

- **Related:** R10, R31, R33; S16.
- **Inputs and initial state:** `review-test-double-r1` belongs to R1 while R2 is current.
- **Action:** Read candidate history and current-revision review results.
- **Expected result:** The nonnumeric sentinel remains in R1 history and is not returned as a current measurement of R2. R2 has no dependent measurement until recomputed.
- **State change:** None.
- **Kind:** Test-double persistence sentinel; not a real measurement.
- **Status:** Runnable in SF-01 as revision-scoped storage using the nonnumeric sentinel. It is not a real measurement.

## AF-10 — Candidate history without checkpoints

- **Related:** R10, R33, R34; S20.
- **Inputs and initial state:** Primary candidate history in application fixtures; checkpoint storage absent.
- **Action:** Read the candidate, revisions, current pointer, artifacts, and operation history.
- **Expected result:** History remains readable without a checkpoint database or mesh data in workflow state.
- **State change:** None.
- **Kind:** Application-storage test double.
- **Status:** Runnable in SF-01. No checkpoint database is created or required.

## AF-11 — One terminal result after runtime failure

- **Related:** R13, R28, R29; S19.
- **Inputs and initial state:** `request-mock-generate-ai` with an injected adapter failure after the stream is established.
- **Action:** Execute the request through the future operation runner.
- **Expected result:** Zero or more `progress` events and exactly one terminal `result` with status `failed`, stable error details, and no authoritative revision. Any produced file remains non-authoritative and is recorded for reconciliation.
- **State change:** No current-revision advance.
- **Kind:** Test double that fails; not geometry.
- **Status:** Planned. SF-01 verifies non-authoritative artifact reconciliation after storage failure; runtime failure handling and terminal SSE remain unimplemented.

## AF-12 — Mechanical and AI paths converge

- **Related:** R1, R5, R6, R20, R26, R41; S11, S26.
- **Inputs and initial state:** `request-mock-generate-ai` and `request-mock-generate-mechanical`.
- **Action:** Resolve the AI proposal and validate the mechanical request.
- **Expected result:** Apart from request identity and AI conversation context, both produce equivalent typed command fields and use the same capability, validation, execution, commit, and result rules.
- **State change:** None during command comparison; execution is covered by AF-01.
- **Kind:** Mock-compatible command validation.
- **Status:** Planned.

## AF-13 — Identical AI retry after revision-changing success

- **Related:** R35, R36, R37; S21.
- **Inputs and initial state:** An AI generate request equivalent to `request-mock-generate-ai` has completed and advanced authoritative candidate state. Its client request, selected command, run, and result are persisted.
- **Action:** Retry the same `case_id`, `request_id`, message, conversation context, and submitted geometry context after current revision has advanced.
- **Expected result:** Return the original result and references. Do not invoke the model, execute the adapter, create another revision, or reject retrieval as stale.
- **State change:** None.
- **Kind:** Proposed retry behavior around a reconstruction mock.
- **Status:** Proposed pending review; not covered by fixture validation.

## AF-14 — Concurrent identical AI requests

- **Related:** R35, R37, R38; S22.
- **Inputs and initial state:** Two identical AI requests arrive before either has a persisted command.
- **Action:** Process both requests concurrently.
- **Expected result:** One atomic request claim owns model selection. The other attaches to that request and eventual run/result. At most one model invocation and one operation execution occur.
- **State change:** One request record and at most one authoritative mutation.
- **Kind:** Proposed retry behavior using model and operation test doubles.
- **Status:** Proposed pending review.

## AF-15 — Conflicting AI request-id reuse

- **Related:** R35, R37; S23.
- **Inputs and initial state:** A case-scoped `request_id` is already claimed for an AI message and context.
- **Action:** Reuse that id with a changed message or any other behavior-affecting client field.
- **Expected result:** Return `request-id-conflict` before model invocation or operation execution. Do not alter the original request/run/result.
- **State change:** None.
- **Kind:** Proposed validation behavior; no operation.
- **Status:** Proposed pending review.

## AF-16 — Retry before model-selected command persistence

- **Related:** R35, R38, R39; S24.
- **Inputs and initial state:** An AI request claim and canonical client input exist, but no validated command has been persisted.
- **Action:** Retry while the owner is active, then exercise the separate interrupted-owner recovery case.
- **Expected result:** While active, the retry attaches and does not invoke the model. After an explicit interrupted/expired state, exactly one local recovery owner resumes from persisted client input. No concurrent model calls occur.
- **State change:** The same request progresses to one command/run or one terminal failure; no duplicate request or mutation is created.
- **Kind:** Proposed retry/recovery behavior using model and storage test doubles.
- **Status:** Proposed pending review.

## AF-17 — Reconstruction adapter substitution

- **Related:** R20, R21, R26; S10.
- **Inputs and initial state:** One operation-service test contract and two reconstruction adapter test doubles that accept the same canonical command and return the same typed result contract.
- **Action:** Configure each adapter in turn without changing request, API, persistence, or result schemas.
- **Expected result:** Both adapters cross the same operation boundary and produce the same common result shape. No mock-specific API route, storage record, or public response branch is introduced.
- **State change:** None in contract comparison; adapter execution and persistence remain separate future tests.
- **Kind:** Test-double substitution; it is not evidence of reconstruction quality or a real adapter.
- **Status:** Service/adapter/storage substitution is runnable in test_second_adapter_uses_same_service_and_result_contract. API integration remains planned.

## Known blockers

- Real measurement method, units, required geometry, and limitations.
- Stable error-code names beyond `operation-contract-missing` and `request-id-conflict`.
- Real geometry media type, coordinate conventions, and artifact format.
- Browser execution and artifact-upload protocol.
- Real inspection, editing, comparison, and contour-guided contracts.
- Review of the two-fingerprint retry lifecycle and interrupted-request recovery rules.

These blockers do not prevent fixture validation or implementation of the accepted common boundaries.
