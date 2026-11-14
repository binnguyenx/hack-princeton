# Intent: AI workspace assistant

Author: Minh Triet Nguyen · Date: 2026-11-14 · Status: draft

## Problem

On a SkullFix case, a person can select anatomy or a candidate and still cannot hand that selection to an assistant that uses the same operations as the mechanical tools. A chat reply can sound exact when no geometry operation ran. Measurements, edits, and comparisons then have nowhere authoritative to live except the conversation.

Example: a candidate is selected and the person asks, "What is the volume of this candidate?" The assistant should run the agreed measurement for this revision and show that result, or say specifically why it cannot. That agreed measurement is the first real integration. A labeled reconstruction mock may exercise the generate path before that measurement exists. The mock is not the measurement, and it is not a real repair.

## Desired outcome

The person selects an object or region and submits a request. The assistant loads the current case, calls only supported operations, streams progress, and explains the tool result. The first real integration is one measurement of the current candidate revision after that measurement's contract is agreed. Before then, a reconstruction mock may run behind the same generation adapter so the workflow can be tried. The stored result says it is a mock. It does not count as the real measurement, and it does not count as a real reconstruction. After agreed contracts exist, the same assistant can generate one real candidate, inspect it, perform one supported local edit, and compare the new revision with its parent.

Mechanical controls and the assistant change the same objects. Three records stay distinct: the intended repair, the proposed design and its revisions, and the review result for one revision.

If an input is missing, an object is outside the case, the revision is stale, or the instruction is unsupported, the assistant says so. It does not fill in a number or a shape.

## Affected users and systems

Biomedical engineers and surgeons use the same assistant. This work owns the AI request path, operation checks, progress events, explanations, and the saved review and revision records that the assistant writes. The 3D canvas is separate. This intent does not assign who implements the real geometry or reconstruction, and it does not redefine the canvas.

## Constraints

- Prepared demo cases only. Raw CT ingestion and segmentation are out of the first implementation.
- The assistant coordinates operations. It does not calculate measurements or invent mesh coordinates.
- Generation goes through one reconstruction adapter. A mock may be that adapter until a real one exists. The mock is labeled and is not evidence of geometric quality. Reference-contour-guided regeneration is a stretch goal, not part of the mock.
- A conversation checkpoint is not the candidate revision history.
- The result of a measurement or edit names the revision it applies to. No fit score and no clinical pass or fail.
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

1. Which measurement operation is first, and which teammate document defines its method, units, inputs, and limitation?
2. Which single local edit is first, and which region constraints can that operation actually honor?
3. Who assigns stable ids for the case, selection, candidate, and revision?
4. What artifact format and coordinate metadata does a candidate revision use?
5. Is the workspace read through a local interface or an HTTP boundary owned by the frontend teammate?

## Amendments

2026-11-14 — A labeled reconstruction mock may exercise generation before the real measurement contract exists. The mock is not that milestone and is not a real reconstruction. Real geometry ownership is undecided. Status remains draft.
