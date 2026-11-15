# Intent: AI workspace assistant

Author: Minh Triet Nguyen · Date: 2026-11-14 · Status: draft

## Scoped acceptance record

The owner has accepted the foundation scope for planning and later implementation: backend authority and identifier ownership; one mechanical/AI operation service; immutable revisions and atomic freshness checks; revision-scoped measurements and spatial metadata; distinct request, run, conversation, and geometry identities; the common result envelope and single terminal SSE behavior; and a replaceable reconstruction mock.

This acceptance does not include real artifact formats, browser execution details, editing, inspection, comparison, contour-guided regeneration, or teammate approval of those interfaces. The retry lifecycle added after this acceptance is a proposed clarification pending review.

Separately, the owner accepted the T1C foreground-volume measurement **contract** (method, units, inputs, limitations, idempotency, integrity, and live/sandbox boundary as recorded in `docs/ai/contracts.md` and R70–R79 / S51–S58), then separately authorized T2 live mechanical implementation of that contract. That authorization does **not** bind sandbox `OperationService` measurement, enable AI/chat mutation or LangGraph `measure.candidate`, or accept unrelated draft requirements. The file remains `draft` while other proposals and operation-specific questions are open.

## Problem

On a SkullFix case, a person can select anatomy or a candidate and still cannot hand that selection to an assistant that uses the same operations as the mechanical tools. A chat reply can sound exact when no geometry operation ran. Measurements, edits, and comparisons then have nowhere authoritative to live except the conversation.

Example: a candidate is selected and the person asks, "What is the volume of this candidate?" The assistant should run the agreed measurement for this revision and show that result, or say specifically why it cannot. That agreed measurement is the first real integration. A labeled reconstruction mock may exercise the generate path before that measurement exists. The mock is not the measurement, and it is not a real repair.

## Desired outcome

The person selects an object or region and submits a request. The assistant loads the current case, calls only supported operations, streams progress, and explains the tool result. The first real integration is one measurement of the current candidate revision after that measurement's contract is agreed. Before then, a reconstruction mock may run behind the same generation adapter so the workflow can be tried. The stored result says it is a mock. It does not count as the real measurement, and it does not count as a real reconstruction. After agreed contracts exist, the same assistant can generate one real candidate, inspect it, perform one supported local edit, and compare the new revision with its parent.

Mechanical controls and the assistant use the same operation service and change the same backend-owned records. The frontend may show optimistic presentation state, but only a successful backend commit establishes a new current revision. Geometry revisions are immutable: a successful geometry change creates a child revision rather than overwriting an artifact.

Three records stay distinct: the intended repair, the proposed design and its immutable revisions, and the review result for one revision. Measurements remain attached to the revision and method that produced them. They stay in history after an edit but are not current measurements of the child revision until recomputed.

If an input is missing, an object is outside the case, the revision is stale, or the instruction is unsupported, the assistant says so. It does not fill in a number or a shape.

## Affected users and systems

Biomedical engineers and surgeons use the same assistant. The backend owns persistent cases, candidates, revisions, artifact records, current-revision pointers, and persisted annotations or regions. It assigns their stable identifiers. The frontend owns temporary camera, hover, and selection state. A submitted region identifies the immutable geometry revision and coordinate frame it refers to.

This work owns the AI request path, the common operation service, progress and terminal events, explanations, and application persistence. The 3D canvas and real geometry algorithms are separate. This intent does not assign who implements real geometry or claim that a mechanical interface is teammate-approved.

## Constraints

- Prepared demo cases only. Raw CT ingestion and segmentation are out of the first implementation.
- The assistant coordinates operations. It does not calculate measurements or invent mesh coordinates.
- Mechanical and AI requests converge on the same validated operation command. Neither a graph step nor an API route mutates candidate records outside the operation service.
- Request ids identify idempotent client requests. Run ids identify execution attempts or the existing execution attached to a retry. Conversation ids group AI interaction state. None of these ids is a geometry revision id.
- Proposed retry clarification: claim a case-scoped request before model invocation, fingerprint accepted client input separately from the model-selected command, and reuse persisted command/run/result state for equivalent retries. This behavior was not part of the recorded foundation acceptance.
- Generation goes through one reconstruction adapter. A mock may be that adapter until a real one exists. The mock is labeled and is not evidence of geometric quality. Reference-contour-guided regeneration is a stretch goal, not part of the mock.
- A conversation checkpoint is not the candidate revision history and does not determine the current revision.
- The result of a measurement or edit names the revision it applies to. No fit score and no clinical pass or fail.
- Original anatomy remains separate from candidate edits. Inspection-only actions do not create geometry revisions.
- Local artifact files are referenced by backend-resolvable artifact ids. Server-local paths are not frontend contracts.
- The demo runs locally. Model id and credentials stay outside git.
- Engineers and surgeons get the same capability. No separate mode.
- Unsupported constraints are reported. They are not silently dropped.

## Out of scope

- The 3D scene and camera. Real geometry algorithms stay out of this intent until an owner and an agreed contract exist. This file does not name that owner.
- Clinical suitability, surgical outcome, manufacture, or certification.
- Predicting healing or postoperative appearance.
- Cited literature search.
- Real-time multiuser editing.
- Training a new reconstruction model.
- Cloud hosting and rented GPUs as a prerequisite.

## Open questions

1. ~~Which measurement operation is first, and which teammate document defines its method, units, inputs, and limitation?~~ **Resolved:** first method is `candidate.foreground-volume.label-voxel.v1` (`measure_kind: foreground-volume`), defined in `docs/ai/contracts.md` and R70–R79. Live mechanical T2 binding is authorized and implemented; sandbox/LangGraph measurement remains unbound.
2. Which single local edit is first, and which region constraints can that operation actually honor?
3. What artifact format, units, coordinate frame, and transforms does each real geometry operation require?
4. Is the authoritative workspace adapter in-process or HTTP?
5. What exact protocol validates and commits geometry executed in the browser?

## Amendments

2026-11-14 — A labeled reconstruction mock may exercise generation before the real measurement contract exists. The mock is not that milestone and is not a real reconstruction. Real geometry ownership is undecided. Status remains draft.

2026-11-14 — The backend owns persistent application state and immutable revision history. Mechanical and AI actions share one operation service. Request, run, conversation, and geometry revision ids have separate purposes. These architecture decisions update the draft; they do not accept it.

2026-11-14 — The owner accepted the foundation scope listed in the scoped acceptance record. Real mechanical contracts remain unresolved. The retry lifecycle is a new proposal pending review, so the overall document remains draft.

2026-11-14 — The owner authorized shared structural schemas and two contract corrections: public artifact references use `retrieval_url`, and canonical commands preserve full selection identity, geometry revision, and coordinate frame. This does not accept unresolved mechanical operations or the proposed retry lifecycle.

2026-11-14 — The owner authorized authoritative SQLite application storage and local artifact handling within the accepted foundation. This includes immutable revision commits, revision-scoped review history, run records, case-scoped request conflict primitives, and explicit non-authoritative artifact reconciliation. It does not authorize operation orchestration, model calls, API transport, geometry execution, or the proposed AI retry/recovery lifecycle.

2026-11-14 — Align integration with the shipped UI/backend: app/server/storageSqlite.ts and /api own live project/case/sample/candidate/revision state. Python mock storage remains an isolated demo. Read live context through an adapter; do not duplicate app state or advertise synthetic artifacts as NRRD reconstruction. This alignment is explicitly requested by the owner.

2026-11-14 — Owner authorized the nine-task queue through fake-model LangGraph: authoritative repository context, typed/capability-gated tools, deterministic explanations and isolated sandbox mock execution. This is scoped implementation authorization, not acceptance of pending recovery, providers, geometry contracts or live AI writes.

2026-11-14 — The owner authorized a stateless read-only chat transport: typed browser client → the existing FastAPI application → fake-model LangGraph → authoritative metadata response. The chat widget is deferred because its UI is not ready. No provider, sandbox generation binding or live mutation is exposed. This scoped authorization does not accept the whole draft.

2026-11-14 — The owner accepted the seven T1C decision-sheet items for the foreground-volume measurement **contract** only. Canonical wording is in `docs/ai/contracts.md` and R70–R79 / S51–S58. The plan file `plans/t1c-measurement-contract.md` is the decision record, not a competing spec. This does not authorize T2 implementation, bind sandbox `measure.candidate`, or change read-only AI/chat. Overall status remains draft.

2026-11-14 — After T1C fold-in, the owner separately authorized T2 live mechanical implementation within that measurement scope: `ForegroundVolumeService` over ApplicationRepository, measurement POST/GET routes, additive live persistence, and accepted NRRD/idempotency/error semantics. Does not bind LangGraph `measure.candidate`, change Chat UI, enable AI mutations, call AWS/Bedrock, or implement unrelated geometry. Overall status remains draft.

## Recovery chat integration (2026-11-14)

Owner authorizes connecting the restored Assistant panel to the existing FastAPI metadata-only graph, with scoped conversation context and regressions. Preserve shell styles, studio, slices and the Vite SQLite CRUD plugin. No Bedrock, geometry execution, AI live writes, commit or push.

## Final review repair authorization — 2026-11-14

Owner authorizes repairing PR #31 test isolation, document/chat context alignment and repeated follow-up intent. Keep recovery styles/viewport/global selection and the Vite SQLite apiPlugin intact. Use only disposable storage for verification. The initial build excluded publication; the owner subsequently authorizes reviewed commit/push to PR #31. No merge, provider, AI writes or live runtime changes.
