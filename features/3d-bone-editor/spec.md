# Spec: Initial 3D bone editor

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-14

Pre-lock wording is recoverable from git (`HEAD` / last committed `features/3d-bone-editor/spec.md` before this working-tree edit), not a side file.

## Summary

The editor opens one local project at a time. A project has a seed owner user and many cases. Each case holds prepared NRRD bone samples with protected source anatomy and independently editable candidates whose revisions survive reopening. Display meshes are derived for the viewport only. Users and developers share the same operations. This phase ships import, inspect, create candidate, rigid transform, revision restore, and portable save/open—not voxel sculpt, annotate, measure, or compare.

## Requirements

Prior wording: `git show HEAD:features/3d-bone-editor/spec.md`.

- R1. A case can contain at least two samples, and each sample can contain at least two candidates. Every candidate identifies its owning sample.
- R2. Import of prepared NRRD source anatomy preserves units, orientation, and spatial placement. Missing metadata that prevents interpretation must be reported before the sample is treated as spatially verified.
- R3. Each sample's rendered geometry must agree with independently checked reference dimensions and orientation for NRRD: compare spacing/bbox (and documented orientation) to values in that sample's `metadata.json` within the tolerance recorded there (or the project default once samples are curated).
- R4. `createCandidate`, `transformCandidate` Apply, and `restoreRevision` on one candidate must leave its source anatomy and sibling candidates unchanged.
- R5. Camera navigation, visibility changes, and inspection-plane view clips must leave source and candidate geometry unchanged.
- R6. Every supported control operation must have a documented name, inputs, target, result, and failure behavior. Inspection/view operations and project-data changes must be distinguishable in this interface.
- R7. UI controls and direct developer calls must invoke the same operations with the same validation, source protection, and edit recovery behavior. Included ops: `navigateCamera`, `setVisibility`, `setInspectionPlane`, `selectObject`, `importSample`, `createCandidate`, `transformCandidate`, `restoreRevision`, `saveProject`, `openProject`, `readState`.
- R8. Callers can read object identifiers, ownership, active candidate revision, selection, and relevant view state without changing them.
- R9. A rejected, cancelled (including Esc before Apply), or failed edit must leave the last completed candidate state and recorded history unchanged and report its outcome to the caller.
- R10. Each candidate has its own recorded revisions. A completed Apply of a geometry/pose op creates a revision; in-progress drag does not. Users can identify revision order, inspect earlier geometry, and restore an earlier version without changing another candidate.
- R11. Local portable save and reopen must preserve user/project/case/sample/candidate ownership, source NRRD data and spatial metadata, recorded revisions, each candidate's current revision, and workspace view state for selection, camera, visibility, and inspection plane.
- R12. A failed save must not be reported as successful. The editor must retain the unsaved work in the running session and expose the failure.
- R13. (removed) Annotation and measurement tools are out of scope this phase.
- R14. The editor must follow `DESIGN.md` and `docs/design-conventions.md` for layout, visual styles, selection/tool/error states, mouse/trackpad interactions, and shortcuts. It must expose included operations through visible controls and distinguish navigation from editing.
- R15. Acquire the SkullFix/SkullBreak training archive into `data/raw/` (gitignored), curate at least two distinct samples into `data/samples/` with source, license, and local path records, and verify both import and render. Download links alone do not satisfy this requirement.
- R16. The development setup must let a coding agent open the running frontend, exercise controls, capture the 3D viewport, and inspect console errors through browser automation/MCP access.
- R17. The coding agent can inspect locally stored sample files and their metadata, saved project records, and candidate revision records. It can trace a rendered object's ID back to its source sample or candidate revision.
- R18. The coding agent can inspect live scene objects by ID via `window.__hackPrincetonDebug`, including ownership, geometry representation and dimensions, units, spatial transforms, visibility, selection, and current revision. It can invoke supported operations through the shared interface and read the resulting state without bypassing validation or history handling.
- R19. The implementation plan must explicitly configure the required development MCP connections and app debug interface, document setup and launch steps, and verify browser, data, and live-object access. Reuse available tools where sufficient; add missing access rather than assuming browser access exposes application data automatically.
- R20. `(added)` `createCandidate` must reject a sample that is not spatially verified. No candidate or revision is created.
- R21. `(added)` `openProject` is atomic: if any required volume blob is missing or unreadable, open fails, the error is reported, and any previously open project remains loaded unchanged.
- R22. `(added)` When the UI opens another project while the current session is dirty, it must offer Save / Discard / Cancel and must not replace in-memory state on Cancel.

## Success criteria

- S1. Open the two stored samples in one case and create two candidates for one sample. After a transform Apply on one candidate, source and sibling geometries match their prior states. Verifies R1, R4, R15.
- S2. For each stored sample, check spacing/bbox/orientation against `metadata.json` within tolerance. Repeat with missing required metadata and confirm the sample is not presented as verified; `createCandidate` on it fails (R20). Verifies R2–R3, R20.
- S3. From equivalent starting states, invoke `transformCandidate` Apply through the UI and through the operation interface. Both yield equivalent geometry and history. Invalid targets, Esc cancel before Apply, and an induced operation failure leave the prior completed state intact. Verifies R6–R9.
- S4. Navigate the camera, change visibility, and move the inspection plane, then compare geometry before and after. Read state through `readState` / `__hackPrincetonDebug` and confirm identifiers and view state match. Verifies R5, R8.
- S5. Record multiple revisions on one candidate (Applies only), restore an earlier version, save, close, and reopen; verify relationships, geometry, history, current revision, and view fields in R11. An induced save failure is shown and leaves in-session work available. Verifies R10–R12.
- S6. (removed) Measurements are out of scope; R13 removed.
- S7. Review every included control against `DESIGN.md` and `docs/design-conventions.md`. Verifies R14.
- S8. Follow `docs/dev-mcp-setup.md` from a fresh session. Load a stored sample, capture the viewport, inspect the console, read metadata, resolve a rendered object via `__hackPrincetonDebug`, run `createCandidate` + `transformCandidate` through the bridge, save, and inspect the saved record. Retain tool outputs. Verifies R16–R19.
- S9. `(added)` Attempt `openProject` with a missing blob while another project is open: open fails; prior project still loaded. Verifies R21.
- S10. `(added)` With dirty unsaved edits, start UI open of another project: Cancel leaves the first project loaded; Discard then open replaces; Save success then open replaces. Verifies R22.

## Design

Prepared **binary NRRD volumes** are the authoritative geometry (SkullFix/SkullBreak-style). The app derives display meshes for Three.js; meshes are not independently saved as source of truth. Raw CT → segmentation is out of this feature (offline acquisition only).

Logical records (IDs stable across save/reopen):

| Record | Relationships and required information |
| --- | --- |
| User `(added)` | ID, displayName. Seed `local-dev` for fixtures; no auth UI this phase. |
| Project | ID, ownerUserId, case ownership, saved workspace state. One project open at a time. |
| Case | ID, projectId, associated samples. A project may have many cases. |
| Sample | ID, caseId, source anatomy, source/license, spatiallyVerified flag. |
| Source anatomy | Object ID, sampleId, protected NRRD geometry, units and spatial metadata. |
| Candidate | Object ID, sampleId, current revision reference. |
| Candidate revision | Revision ID, candidateId, order, recoverable volume and/or pose state. Created on each completed Apply of a geometry/pose op (Q7-A). |
| Annotation / Measurement | Deferred this phase; not required records. |

Samples in the same case are **not** assumed spatially aligned. Co-display does not imply registration.

Shared `ops/` validate targets, protect source anatomy, and report failures. View ops (camera, visibility, inspection plane) never write candidate history. Edit ops (create candidate, transform Apply, restore revision) do. UI, shortcuts, and `window.__hackPrincetonDebug` call the same ops.

Edge rules (locked):

1. `createCandidate` rejects unverified samples.
2. `openProject` is atomic: missing/unreadable blob → fail; prior open project unchanged.
3. UI open while dirty → Save / Discard / Cancel before replacing memory.

Visual / interaction system of record: `DESIGN.md` (hack-princeton) + `docs/design-conventions.md` + `.impeccable/design.json`.

## Where it lives

- Feature documents: `features/3d-bone-editor/`
- Product / design: `PRODUCT.md`, `DESIGN.md`, `docs/design-conventions.md`, `docs/project.md`, `hackprinceton_intent.md`
- App (planned): `app/` (Vite + React + TypeScript + Three.js)
- Samples / fixtures (planned): `data/raw/` (full archive, gitignored), `data/samples/` (curated committed NRRDs), `data/fixtures/demo-project/`
- Ops catalog / MCP setup (planned): `docs/ops-catalog.md`, `docs/dev-mcp-setup.md`
- Debug bridge (planned): `app/src/debug/bridge.ts` → `window.__hackPrincetonDebug`

## Decisions

- D1. Multiple samples per case and multiple candidates per sample. Why: separate source examples from alternative designs.
- D2. Revisions live on each candidate; a new version is not automatically a new candidate.
- D3. Protect source anatomy; view state ≠ geometry.
- D4. Shared operations for UI and programmatic callers.
- D5. Curated sample files committed under the repo (`data/samples/`). Download links alone do not satisfy checks.
- D6. `(added)` Canonical geometry is prepared NRRD; display meshes are derived only. Why: matches SkullFix data and keeps edits/measurements-capable truth on volumes later.
- D7. `(added)` Project → many Cases; seed User `local-dev` without auth. Why: multi-case product model + multi-dev fixture consistency.
- D8. `(added)` Portable local project package; manual save/open. Why: simplest R11/R12 story. Autosave/export deferred.
- D9. `(added)` Included ops this phase: navigateCamera, setVisibility, setInspectionPlane, selectObject, importSample, createCandidate, transformCandidate (Apply), restoreRevision, saveProject, openProject, readState. Deferred: trim, brush, mask, annotate, constrain, measure, compare.
- D10. `(added)` Revision on each completed Apply; drag is transient until Apply; restore sets current pointer; no branching. Cmd/Ctrl+Z maps to restoreRevision via ops.
- D11. `(added)` UI system is hack-princeton (`DESIGN.md` + conventions). Product display name undecided—do not hard-code SkullFix in chrome.
- D12. `(added)` Acquire full SkullFix/SkullBreak training archive into `data/raw/` (gitignored), then curate two project samples into `data/samples/`. Why: reproducible subset without committing the whole dataset.
- D13. `(added)` Edge rules: reject createCandidate on unverified; atomic open keeps prior project; dirty UI switch uses Save/Discard/Cancel.

## Flagged concerns

- Resolved: Format, tool list, runtime, design conventions—see D6–D13 and `PRODUCT.md` / `DESIGN.md`.
- Resolved: Checkpoint timing—Apply creates revision (D10). Branching/merging remain out of scope.
- Resolved: Requirement wording choices applied (R1–R22, S1–S10).
- Candidate history can retain large volumes; prefer pose deltas for transform revisions where safe; design against acquired samples.
- No application code or acquired sample NRRDs in-repo yet. R15–R16 remain delivery work.

## Open questions

1. Concrete R3 numeric tolerance (and per-sample `metadata.json` reference values) once the two curated samples are chosen from the raw archive.

## Out of scope

Clinical approval, manufacturing readiness, universal bone reconstruction. This phase also excludes: planar trim, brush, preservation mask, annotate, constrain, measure, compare, in-app raw CT/DICOM segmentation, AI generation, model training, in-app chat, evidence retrieval, cloud collaboration, auth/OAuth, branching/merging, autosave, geometry export, production-facing external API/MCP adapters. Development MCP + `__hackPrincetonDebug` are in scope.
