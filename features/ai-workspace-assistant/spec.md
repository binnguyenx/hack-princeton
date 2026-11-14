# Spec: AI workspace assistant

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-14

## Summary

The AI backend turns a selection and a natural-language request into a supported workspace operation, streams the progress, and explains the tool result. The first real integration is one measurement of the current candidate revision, and only after an agreed measurement contract exists. A labeled reconstruction mock may exercise generation before that. The mock is not a real measurement and not a real reconstruction. The model does not calculate either one.

## Requirements

- R1. A request must include a conversation id, a case id, and a selection. It may include a candidate id and the revision id the user expects.
- R2. Before any tool call, the backend must load the case from the workspace integration. Selection ids resolve objects in that case. The model must not infer coordinates from the message text or from an image.
- R3. The backend must stop before a tool call when a required id is missing, a referenced object is not in the case, or the expected revision is not the current revision. The response must name which check failed.
- R4. The agent may call only operations present in the tool registry for that case. An instruction that matches no registered operation must be returned as unsupported. It must not be dropped.
- R5. Each registered tool must declare a typed input schema and a structured result. Adding a tool must require a registry entry and a new tool module, not a change to every API route or graph node.
- R6. A tool must call a shared operation. The mechanical path and the AI path must use that same operation boundary. The AI package must not reimplement the measurement or edit formula.
- R7. A real measurement, edit, or compare is advertised as available only when `docs/ai/contracts.md` marks an agreed contract for it. Until then that real operation returns `operation-contract-missing` and stores no calculated number. A provisional mock contract is not that agreed contract.
- R8. When a measurement contract is filled, a measurement request must execute that operation for the validated revision and return its value, unit, method id, and stated limitation. The assistant must not replace those fields with an estimate.
- R9. Explanation text must mention a number, unit, or geometry claim only when that claim is present in the tool result for the same run.
- R10. A review result must be stored against the revision id that passed R3. The LangGraph checkpoint must not be treated as that record.
- R11. If the current revision changes after R3 and before the result is stored, the run must end as stale. It must not attach the result to the newer revision and must not create a revision.
- R12. Repeating a request with the same idempotency key and the same validated inputs must not create a second review result or a second revision.
- R13. The API must stream progress events and one terminal result event over SSE. Each event must include the run id and the case id.
- R14. A generate request must call the reconstruction adapter and store the returned artifact reference as a candidate revision. The model must not emit mesh coordinates. When the adapter is the mock, the stored source is `mock` or `test-double`, and the run must not be reported as a real reconstruction or as the real measurement milestone.
- R15. A generate request that asks for reference-contour-guided regeneration must be returned as unsupported until a separate contract marks that capability available.
- R16. When one local-edit contract is filled, an edit request must run only if that contract states support for the requested editable region and any preserved region. The stored revision must record its parent revision, the operation id, and the parameters that were validated.
- R17. When a compare contract is filled, a compare request must return only the fields that operation produced for two revisions of the same candidate. It must not invent a fit score or a clinical threshold.
- R18. Model id, region, and credentials must come from environment or a local untracked config. The repository must not contain secrets.
- R19. An existing candidate supplied with the request must be checked for case membership and spatial metadata required by the operation. If those checks pass, the run must enter inspection or editing without requiring generation.
- R20. The agent, API, and storage must depend on the shared operation result schema. They must not branch on fields that exist only on the mock.
- R21. Replacing the mock with another adapter that returns the same result schema must not require a change to the API event shape or the review-result table. The new adapter is a real integration only when its contract is marked agreed.
- R22. The mock must not state a clinical measurement, a fit score, or a claim of geometric quality. Its limitation text must say the artifact is not a real reconstruction.

## Success criteria

- S1. Given a case with candidate C at revision R, and a filled measurement contract, when the user asks for that measurement of C, then the stored review result cites R and the operation's value and unit.
- S2. Given the same request, when the model response adds a number that is not in the tool result, then that response is rejected and the stored result is unchanged.
- S3. Given the expected revision is not current, when the request arrives, then no tool is called and the response names the revision mismatch.
- S4. Given the user repeats the same idempotency key after a successful measurement, when the second request is processed, then one review result exists for that key.
- S5. Given the revision changes after validation and before storage, when storage is attempted, then the run is stale and the new revision has no review result from that run.
- S6. Given no measurement contract is filled, when the user asks for a volume, then the result reason is `operation-contract-missing` and no numeric volume is stored.
- S7. Given a generate request that asks to follow a reference contour, when contour guidance is not marked available, then the response is unsupported and no revision is created.
- S8. Given a filled edit contract that does not support preserved regions, when the user asks to keep a region unchanged, then no revision is created and the response says the constraint is unsupported.
- S9. Given a generate request served by the mock adapter, when the run is stored, then `source` is `mock` or `test-double` and the explanation does not call the artifact a real reconstruction.
- S10. Given S9's result schema, when a second adapter returns that same schema, then the API event and the stored review row accept it without a mock-only branch. The second adapter is not described as real geometry unless its contract is marked agreed.

## Design

The AI subproject is `backend/ai`. It is a local FastAPI service. LangGraph chooses the next registered tool. LangChain's Bedrock chat integration calls a configurable Claude Sonnet model. SQLite stores application rows. A separate SQLite file stores LangGraph checkpoints. Geometry files live on the local filesystem as artifact paths, not as checkpoint blobs.

A run moves through load context, validate, execute a registered tool, check the result against the operation contract, persist, and explain. SSE carries progress and the terminal payload. The frontend teammate consumes that stream. This spec does not define their scene graph.

Three records stay separate. The intended repair holds objectives and constraints. The proposed design is a candidate and its parented revisions. The review result holds measurements and observations for one revision. Checkpoints can resume a paused graph. They are not the revision log.

Tools are thin modules under `tools/`. Shared checks and the call into an adapter live under `operations/`. Bedrock, workspace, and geometry each have an integration module. The reconstruction mock is one geometry adapter. The agent, API, and storage do not import that mock's private types.

The first real integration milestone is S1, after an agreed measurement contract. A mock may be used for S9 and S10 before that. S9 does not satisfy S1. This spec is still draft. Accepting it later would not, by itself, approve a plan or start coding. The workflow for that step is `docs/ai/workflow.md`.

## Where it lives

- Backend: `backend/ai/src/skullfix_ai/`
- AI docs: `docs/ai/`
- Feature docs: `features/ai-workspace-assistant/`
- Tests: `backend/ai/tests/unit/`, `backend/ai/tests/integration/`, `backend/ai/tests/live/`. Ownership of the subpaths is in `.agents/assignments/ai/README.md`. Agents 01–03 own their component tests. Agent 04 owns cross-component workflows, live checks, and evaluation. The main agent owns shared fixtures and root test configuration.
- Evaluation: `backend/ai/evaluation/`
- Frontend: owned outside this spec. No frontend path is claimed here.

## Decisions

- D1. The AI subproject proposes Python, FastAPI, Pydantic, LangGraph, LangChain AWS, Amazon Bedrock, optional LangSmith, HTTP/SSE, SQLite, and local artifacts. Why: that is the AI owner's proposed local stack. Alternatives: another Python web framework, or calling Bedrock without LangGraph. `docs/project.md` still says the product-wide stack is undecided, so this decision binds only this subproject after acceptance.
- D2. One AI feature folder covers the assistant, with measurement as the first milestone. Why: the owner asked for a single AI intent and spec. Alternatives: separate feature folders per operation. Those can still be split later if a spec grows past one working session.
- D3. Capabilities, revision checks, and idempotency live in application code, not only in the prompt. Why: a prompt cannot enforce a stale revision.
- D4. `features/measure-candidate/` remains an earlier draft of the measurement milestone. Why: it was already written. It is not a second spec. Implementation follows this spec.
- D5. A reconstruction mock is allowed behind the shared adapter before a real generator exists. Why: the workflow can be exercised without waiting for mechanical tools. The mock is labeled and is not the real measurement milestone. Real geometry ownership is undecided. Alternatives: block all generation until an agreed contract exists. That alternative still applies to advertising a real capability.

## Flagged concerns

- The product draft in `hackprinceton_intent.md` leaves the first measurement, the first edit, and prepared-versus-raw-CT input open. This spec assumes prepared cases. It does not define a real measurement. An agreed contract still has to do that.
- Resolved: AI/backend work uses `docs/ai/workflow.md`, also referenced from `AGENTS.md`. Intent and spec may be updated in one round. Both remain draft. This document does not accept them. After acceptance, a separate plan approval is not required unless the owner asks. Other features keep a gate between each document.
- No geometry or frontend implementation exists in this repo yet. Shared ids, units, and artifact formats are unresolved in `docs/ai/contracts.md`. Those unresolved rows are not teammate-approved contracts.
- A test double can appear in tests for S1's shape. It must not be described as a successful live measurement. A reconstruction mock can exercise S9. It must not be described as S1 or as real reconstruction.

## Open questions

1. Which measurement operation is first, and where is its method, unit, inputs, and limitation written?
2. Which local edit is first, and which preserved-region constraints can it honor?
3. Who mints case, selection, candidate, and revision ids?
4. Which artifact format and coordinate metadata are required on a revision?
5. Does the AI service call the workspace in-process or over HTTP?
6. Which Bedrock model id is enabled for the demo account?

## Out of scope

- The 3D scene. Real geometry algorithm design. This spec does not assign that work.
- Raw CT ingestion, segmentation, and model training.
- Reference-contour-guided regeneration, until a contract says it is available.
- Cited evidence retrieval.
- Clinical certification, manufacture, and outcome prediction.
- A universal fit score or pass threshold.
