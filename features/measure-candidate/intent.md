# Intent: Measure a candidate from the workspace

Author: Minh Triet Nguyen · Date: 2026-11-14 · Status: draft

## Problem

A person can select a candidate on a SkullFix case and still cannot ask for a measurement they can trust. A chat answer can sound exact even when no geometry operation ran. The mechanical tools and the AI panel have to measure the same object. The number has to belong to the revision on screen.

Example: a candidate is already selected. The person asks, "What is the volume of this candidate?" They should see that operation's result for this revision, with its units, or a specific reason it did not run.

## Desired outcome

A person opens a prepared case that already contains a candidate, selects it, and asks for one supported measurement. The backend reads the current workspace revision, runs the same measurement operation the mechanical tools use, and returns that operation's result. The canvas can show the number. The explanation describes what the tool returned. The result stays attached to that revision.

If the candidate is missing, belongs to another case, or the requested measurement is not supported, nothing is filled in. The person is told what is missing or unsupported.

If the revision changes before the measurement finishes, the result is not saved as a measurement of the newer revision.

## Affected users and systems

Biomedical engineers and surgeons use the same request. This touches the AI panel, the case and revision records, the geometry measurement operation, and the review result stored for that revision. It does not replace the 3D canvas or the geometry implementation.

## Constraints

- Prepared demo cases only. The candidate already exists. This request does not create geometry.
- The geometry operation calculates the measurement. The agent does not estimate it from a screenshot or from the wording of the request.
- The saved revision is the design record. A conversation transcript does not replace it.
- The result names its units, the revision it measured, and the limitation of that one measurement. No fit score and no clinical pass or fail.
- The demo runs locally. Model choice and credentials stay configurable. Secrets stay out of the repo.
- Engineers and surgeons get the same capability. No separate mode.

## Out of scope

- Generating a missing-bone candidate, including regeneration from a reference contour.
- Editing geometry, comparing two revisions, or recalculating a measurement after an edit.
- Raw CT upload and segmentation.
- Cited literature search.
- Clinical suitability, surgical outcome, manufacture, or certification.
- Choosing the service stack here. `docs/project.md` still says the stack is undecided. The proposed Python API, agent graph, Bedrock model, and local database are input for a later spec, not a decision in this file.

## Open questions

1. Which single measurement is the first real operation, and who defines its method, units, required inputs, and limitation?
2. Which measurement method, unit, input geometry revision, and limitation will the agreed operation contract define?
3. Should the proposed local Python API and Bedrock agent become the architecture, or does a teammate decision override that proposal?

## Amendments

2026-11-14 — Folded into `features/ai-workspace-assistant/` as the first real measurement milestone of the AI workstream. This file stays as the earlier draft. Do not implement a second measurement behavior from it, and do not add a spec here. Status remains draft.

2026-11-14 — Backend application storage assigns persistent case, candidate, revision, and artifact ids. The shared contract remains proposed and operation-specific measurement details remain unresolved. Status remains draft.
