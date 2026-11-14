# Spec: Canvas workspace (viewport + tools + sample wiring)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14 (Close pass)

## Summary

Define one canvas contract that combines viewport rendering, tool behavior, and persistence wiring. The canvas must support deterministic inspection/edit flows for sample and candidate documents, while replacing blocky voxel-face rendering with smooth display geometry suitable for realistic review.

## Requirements

### Interaction semantics

- R1. **Orbit** rotates camera around the current focus target and never mutates candidate/sample domain records.
- R2. **Pan** translates camera position and target together in view space and never mutates candidate/sample domain records.
- R3. **Zoom** changes viewing distance (or FOV equivalent) only and never mutates candidate/sample domain records.
- R4. **Visibility toggle** is per-object view state (`objectId -> visible`) and never deletes or alters underlying records.
- R5. **Focus** centers camera target on active object bounds and adjusts framing so the active object is fully visible in viewport.

### Active document and selection state

- R6. Canvas state explicitly tracks `activeDocumentId`, `activeDocumentKind` (`sample` or `candidate`), and `selectionObjectId`.
- R7. `selectionObjectId` must reference a known renderable object (source anatomy object or candidate object) or be `null`; unknown IDs are rejected with explicit failure.
- R8. When `activeDocumentKind=sample`, edit actions (`transform`, `apply`, `restore`) are disabled in UI and blocked in ops with explicit failure.
- R9. When `activeDocumentKind=candidate`, edit actions are enabled if the candidate and its current revision resolve successfully.
- R10. Switching active document updates taskbar selection, inspector context, viewport focus target, and tool enablement in one consistent state transition.

### Edit transaction behavior

- R11. Transform interaction has a draft phase and a commit phase.
- R12. Draft transform updates viewport presentation only (transient state) and does not append revision history.
- R13. Apply on a valid candidate appends one new candidate revision, updates candidate `currentRevisionId`, persists mutation, and reloads backend truth before final render.
- R14. Cancel/Escape during draft transform clears transient edit state and leaves revision history unchanged.
- R15. Restore sets candidate `currentRevisionId` to an existing revision for that same candidate, persists mutation, reloads backend truth, and re-renders restored pose.
- R15a. Restore rejects revision IDs that belong to a different candidate; no pointer mutation occurs.
- R15b. Restore during an active draft transform is never silent: UI must force explicit cancel/apply-first behavior or reject restore with a clear message.
- R15c. Restore to the already-current revision is idempotent (no new revision row, no unintended pointer churn).
- R15d. Restore uses backend truth under concurrency: if client state is stale, backend validation decides and client re-hydrates authoritative state.
- R15e. Restore shortcut spam (repeat key presses) resolves deterministically to a valid final revision pointer.

### Sample and candidate data wiring

- R16. Source sample anatomy is immutable in this feature: no operation overwrites source volume bytes in place.
- R17. Candidate revisions are append-only records linked to candidate and sample ownership.
- R18. Durable mutations (Apply/Restore and other canvas writes in scope) must round-trip through backend API and then hydrate frontend state from backend response.
- R19. Failed backend writes never report local success and never leave UI claiming committed changes that backend rejected.

### Rendering quality and pipeline

- R20. Blocky voxel-face rendering is not acceptable as final display path for canvas workspace.
- R21. Viewport display path uses smooth mesh representation for source/candidate rendering (for example committed display-mesh assets) while keeping NRRD as authoritative anatomical source.
- R22. Candidate pose applied by canvas tools is reflected in rendered mesh transform for the active revision.
- R23. If smooth display asset is missing or invalid, UI shows explicit degraded-state message and keeps tool state consistent (no silent visual mismatch).

### UI component contracts

- R24. Canvas workspace includes and wires these components: `Viewport`, `ToolRail`, `DocumentTaskbar`, `WorkspaceNavigator`, `Inspector`.
- R25. `ToolRail` drives shared ops only; no component-local mutation path bypassing ops contract.
- R26. `DocumentTaskbar` controls active document context and reflects open-document list deterministically.
- R27. `Inspector` shows active document details; for candidates it includes revision list and restore action entry points.
- R28. Status messaging reports operation outcomes (success/failure/pending) for persistence-bound actions.

### Shared ops and parity

- R29. Keyboard shortcuts, toolbar actions, and debug/agent bridge invoke the same operation semantics for navigate/select/transform/apply/cancel/restore.
- R30. View operations never append candidate revisions; edit operations never mutate camera state implicitly except focus actions.

### Proof and tests

- R31. Tests cover interaction invariants: view ops mutate only view state, edit ops mutate revision state only on Apply/Restore.
- R32. Tests cover selection invariants for sample vs candidate active contexts, including rejected invalid actions.
- R33. Tests cover one end-to-end canvas workflow: open sample -> create/open candidate -> draft transform -> apply -> restore prior revision -> render state reflects restored revision.
- R34. Tests cover failure path where backend mutation rejects and UI remains consistent (no phantom committed revision).
- R35. Tests cover rendering fallback messaging for missing/invalid smooth display asset.
- R35a. Tests cover cross-candidate restore rejection (candidate A cannot restore candidate B revision).
- R35b. Tests cover restore behavior when a draft transform is active and verify no silent draft loss.
- R35c. Tests cover idempotent restore to current revision (no extra writes, stable pointer).
- R35d. Tests cover stale-client restore attempts where backend state changed between fetch and restore.
- R35e. Tests cover repeated shortcut-triggered restore calls and verify deterministic final revision state.
- R35f. Tests cover restore after revision deletion/cascade and verify safe failure messaging.
- R35g. Tests cover bounded pending-state lifecycle (pending always resolves, never stuck).
- R35h. Tests cover duplicate-click/duplicate-key prevention for Apply and Restore while pending.
- R35i. Tests cover selection consistency across viewport/taskbar/inspector after document switches.
- R35j. Tests cover error lifecycle: failure message appears, retry succeeds, stale error clears.
- R35k. Tests cover empty-state UX guards and disabled controls for missing context.
- R35l. Tests cover rapid interaction sequences (switch doc + restore + switch back) and verify final state consistency.

### Live model criteria (reference-derived)

- R36. Canvas quality checks must include these geometry categories used in cranial planning/manufacturing literature: thickness plausibility, rim/edge transition continuity, boundary fit, and surface deviation map.
- R37. Candidate render must expose separate visual understanding of:
  - outer contour surface continuity,
  - inner contour continuity,
  - defect rim transition zone.
- R38. When a contralateral reference (or approved baseline reference surface) exists, the system must support computing and showing thickness deviation summary for the candidate against that reference.
- R39. Boundary fit review must support edge-focused comparison (not volume overlap only), because border quality correlates better with expert feasibility review than global overlap alone.
- R40. Surface deviation visualization must include signed distance coloring (positive/negative) so users can identify overbuild vs underbuild zones around the defect.
- R41. For accepted demo samples, the spec’s visual quality gate is:
  - smooth non-voxelized contour,
  - continuous rim transition without staircase artifacts at the defect edge,
  - no obvious aliasing block steps at normal review zoom levels.
- R42. Numeric criteria in this feature are planning aids only; they must be labeled non-clinical and must not be presented as surgical safety approval.
- R43. Canvas shading style target follows the supplied clinical-CAD reference look: matte off-white bone material, soft cool-gray background, and neutral studio lighting with no stylized colors.
- R44. Default material behavior for skull surfaces must prioritize readable form over gloss: low metalness, medium-high roughness, smooth shading normals (no flat-shaded faceting as default).
- R45. Lighting rig must include at least key + fill + hemisphere/ambient contribution so orbital cavity, temporal region, and mandibular contours remain readable without hard clipped shadows.
- R46. Default camera framing must present the active model with enough margin to inspect silhouette continuity, with stable orbit target around model centroid/focus point.
- R47. UI chrome around viewport must remain subdued (low-contrast gray controls) so geometry is the visual focal point, matching engineering/CAD review behavior.
- R48. Default render material profile is pinned for reproducibility: neutral off-white base color, near-zero metalness, medium-high roughness, smooth shading enabled.
- R49. Default lighting profile is pinned for reproducibility: one key directional, one softer opposing fill, plus hemispheric/ambient contribution.
- R50. Render fallback policy is explicit: smooth display mesh preferred; derived mesh allowed only as labeled degraded preview.

### UI functional integrity (clean-state contract)

- R51. UI must keep a single authoritative active context at all times (`activeProjectId`, `activeDocumentId`, `activeDocumentKind`) with no contradictory visible state.
- R52. Tool enablement/disablement must always match current context and capability (for example, Apply disabled unless candidate + valid draft).
- R53. Any failed operation must roll UI back to the last consistent state and clear optimistic pending visuals that imply success.
- R54. Pending operation indicators must be bounded: every pending state ends in success or failure messaging; no infinite spinner/stuck pending.
- R55. Re-entrant action guard: actions that mutate backend state (Apply, Restore, Delete in related surfaces) must prevent duplicate submissions while pending.
- R56. Selection consistency invariant: viewport highlight, taskbar active tab, and inspector target must reference the same object after each interaction.
- R57. Navigation consistency invariant: route/shell mode and visible action set must remain aligned (no hidden active tool from another mode).
- R58. Escape/cancel invariants: pressing Escape during draft edit cancels draft only; pressing Escape outside draft edit does not mutate domain state.
- R59. Error message lifecycle is deterministic: user-facing error appears once per failure, is dismissible, and does not persist after successful retry.
- R60. Empty-state behavior is explicit and actionable for no project/no document/no candidate cases (no dead controls without explanation).
- R61. Rapid interaction safety: quick tab-switching, tool-switching, or repeated shortcut input must not desynchronize UI from store/backend truth.
- R62. Sample import status messaging must disclose source limitations when known (for example SkullBreak cranial-segment masks are not full-head anatomy) so users do not misinterpret partial geometry as render corruption.

## Success criteria

- S1. User can inspect a sample with orbit/pan/zoom/focus/visibility and no candidate revision count changes.
- S2. User cannot apply transform when a sample document is active; UI and ops both report read-only source context.
- S3. User can apply a transform on candidate and observe exactly one new revision appended and persisted.
- S4. User can cancel a draft transform and observe no new revision appended.
- S5. User can restore an older revision and observe candidate pointer + viewport pose updated to that revision after backend hydration.
- S6. Realistic display path renders smooth anatomy/candidate geometry for curated samples; missing asset path is explicit and non-destructive.
- S7. Shortcut and toolbar paths produce equivalent outcomes for core operations.
- S8. For curated reference samples, users can inspect a signed deviation map and identify under/over regions at the boundary zone.
- S9. For samples with reference baseline available, users can view a thickness deviation summary and rim transition continuity check in the inspector.
- S10. Visual review of curated samples shows no minecraft/block staircase artifacts at the defect boundary under default camera controls.
- S11. Default render style visually matches the provided reference class: neutral bone-like surface, soft shadowing, and clear contour readability in side and oblique views.
- S12. At default zoom and one close-in zoom step, no flat-shaded polygon faceting dominates major cranial surfaces (parietal, frontal, occipital) in curated samples.
- S13. In A/B screenshot comparison (current vs target style), reviewers can consistently identify improved boundary smoothness and anatomical contour readability.
- S14. Restore backward/forward across at least two revisions keeps candidate pointer, inspector selection, and viewport pose in sync after each step.
- S15. Invalid restore attempts (wrong candidate, stale revision, deleted revision) fail without state corruption or false-success UI.
- S16. No user interaction leaves UI in contradictory state (disabled action appearing active, mismatched selection, stale pending indicator).
- S17. In stress interaction tests (rapid switches/retries), final rendered model, inspector revision, and active tab always converge to one consistent backend-hydrated state.
- S18. Failure/retry paths are clean: no duplicate toasts, no stale errors after success, and no hidden optimistic mutation artifacts.
- S19. Importing SkullBreak-derived samples always surfaces a user-visible note that geometry may be partial cranial segment data.

## Mechanical tooling contract (explicit)

These are the canvas tools expected for first accepted mechanics:

- **Navigate**: orbit/pan/zoom camera inspection only; no candidate revision mutation.
- **Select**: set `selectionObjectId` to a known sample/candidate object and synchronize viewport/taskbar/inspector context.
- **Transform**: candidate-only edit mode with transient draft pose.
- **Apply**: candidate-only commit action; append exactly one revision and set `currentRevisionId` to that revision.
- **Cancel (Esc)**: clear transform draft without mutating committed revisions.
- **Restore**: candidate-only non-destructive pointer restore to an existing revision of the same candidate.
- **Save**: persist current project package/session state through the configured persistence path.
- **Visibility**: object-level view toggle via `view.visibility` mapping.
- **Focus**: frame camera to active object bounds.

## Current implementation status (gap report)

This section records current state vs required behavior so implementation can be closed deterministically.

- **Navigate**: partial implementation present (OrbitControls interaction in viewport).
- **Select**: not implemented end-to-end (no viewport picking/raycast pipeline wired to `selectionObjectId` updates).
- **Transform**: mode exists in UI, but interactive draft manipulation is not implemented.
- **Apply**: persistence path exists, but current behavior is not driven by user-manipulated draft transform.
- **Cancel (Esc)**: mode exit exists, but no draft transform state machine to clear yet.
- **Restore**: implemented through backend restore mutation + hydration path.
- **Save**: currently stubbed in canvas shell messaging; durable save action not wired from this toolbar path.
- **Visibility**: operation exists in shared ops but no canvas UI control path currently invokes it.
- **Focus**: camera auto-frame on mesh load exists; explicit user-triggered focus action is not yet surfaced.
- **WorkspaceNavigator in canvas context**: spec-required component contract exists, but active canvas composition does not currently mount a dedicated navigator panel.

## Design

### Approach

- Keep one operation contract for all control surfaces (UI, shortcuts, debug bridge).
- Separate view state from edit state at the operation boundary.
- Treat backend responses as authoritative for durable canvas state.
- Use smooth display mesh for visual fidelity while preserving NRRD authority for domain data.

### Canvas glossary (implementation terms)

- **Source Volume (NRRD)**: authoritative anatomical volume bytes and spatial metadata.
- **Display Mesh**: smooth render geometry used by viewport.
- **Active Document**: current sample/candidate context for tool enablement and inspector content.
- **Selection Object**: currently highlighted object ID in scene.
- **Draft Transform**: transient candidate pose during interaction before Apply.
- **Committed Revision**: persisted candidate revision created by Apply.
- **Hydration**: reloading frontend state from backend after mutation.
- **Overlay Layer**: non-destructive visual aids such as selection highlight and inspection guides.

### 3D model description (for this feature)

- **Source anatomy model**: patient skull-derived anatomical reference represented by authoritative NRRD volume + spatial metadata.
- **Candidate model**: editable reconstruction geometry tied to candidate revision records; each Apply creates a new candidate state.
- **Reference surface model**: optional comparison surface (contralateral mirror or approved baseline) used for deviation/thickness checks.
- **Defect boundary loop**: edge region where candidate transitions into surrounding skull; this is reviewed as a first-class quality region.
- **Transition rim zone**: finite-width band around defect boundary used to judge continuity and fit smoothness.
- **Review overlays**: signed deviation map, boundary emphasis, and selection/inspection layers; overlays never mutate geometry.

### Render style profile (derived from provided reference)

- **Palette**: bone surface near neutral off-white/light gray; background cool light gray-blue; minimal saturation.
- **Surface**: smooth continuous normals; no voxel stepping; subtle roughness to avoid mirror reflections.
- **Shadows**: soft contact shadows for depth cues; avoid harsh black shadows that hide sutures/edges.
- **Contrast**: preserve readable depth in orbit, zygomatic arch, temporal fossa, and mandible.
- **Viewport emphasis**: geometry occupies primary visual area; controls do not compete with model.

### Restore/backspace logic model

- **Backspace-like meaning**: revert current candidate pointer to an older committed revision; this is not history deletion by default.
- **Non-destructive restore**: restoring changes `currentRevisionId` only; the revision list remains intact.
- **Draft separation**: cancel affects draft state only; restore affects committed revisions only.
- **Failure atomicity**: if target revision is invalid at request time, operation fails and prior UI/domain state remains unchanged.
- **Deterministic shortcut flow**: repeated restore shortcuts step through valid revision history without skipping into invalid state.

## Where it lives

- Docs: `features/3d-bone-editor/canvas-workspace/`
- Canvas orchestration: `app/src/App.tsx`
- Viewport rendering: `app/src/viewport/Viewport.tsx`
- Mesh derivation / display path: `app/src/geometry/derivedMesh.ts`, `app/src/geometry/displayMesh.ts`, `app/src/geometry/volumeIsoMesh.ts`
- Shared ops contract: `app/src/ops/session.ts`, `app/src/ops/index.ts`
- Debug bridge parity: `app/src/debug/bridge.ts`
- UI components: `app/src/ui/ToolRail.tsx`, `app/src/ui/DocumentTaskbar.tsx`, `app/src/ui/WorkspaceNavigator.tsx`, `app/src/ui/Inspector.tsx`
- Tests: `app/tests/` (ui + ops seam coverage for requirements above)

## Decisions

- D1. Canvas workspace merges former `canvas-tools` and `canvas-viewport` concerns into one feature contract.
- D2. Rendering fidelity requirement is mandatory for this feature, not deferred behind management UI completion.
- D3. Backend round-trip + hydration is required for durable canvas edits; local optimistic success without reconciliation is not acceptable.

## Flagged concerns

- Smooth mesh asset generation/loading path is still an implementation decision (asset format, pipeline command, cache strategy) and must be fixed in `plan.md`.
- Existing blocky volume-to-mesh path may still be needed as fallback/debug mode, but it cannot remain default for accepted canvas behavior.
- If backend transform/restore latency is high, UX may need explicit pending states to prevent duplicate Apply actions.

## Open questions

1. What exact smooth mesh format is v1 canonical (`glb`, `gltf`, or equivalent) for curated sample assets?
2. Is generation-entry UI (AI/manual seed candidate) included in this feature scope or split to a subsequent feature?
3. Should inspection plane/measurement overlays be part of first acceptance or the next canvas increment?
4. What visual acceptance protocol confirms "realistic enough" (reference screenshots, checklist, or tolerance thresholds)?
5. Which exact fallback is required when contralateral/reference surface is missing (disable numeric checks vs alternative baseline)?
6. Should "undo/backspace" stay pointer-restore-only in this feature, or include destructive history prune?
7. Should restore shortcuts be debounced or processed sequentially under key repeat?

## Reference basis for live model criteria

The added criteria above are derived from published cranial planning and implant studies that report practical review dimensions used by clinicians/engineers:

- Thickness and rim characteristics in clinically used implants (mean thickness and rim transition context): [pubmed 38430381](https://pubmed.ncbi.nlm.nih.gov/38430381/)
- Fit/deviation tolerance mapping between planned and achieved implant position: [PMC9000016](https://pmc.ncbi.nlm.nih.gov/articles/PMC9000016/)
- Edge-focused feasibility signals (boundary-focused metrics over overlap-only metrics): [Li seminar summary of AutoImplant challenge evaluation](https://jianningli.me/pdfs/PhD%20Seminar%202.pdf)
- Practical workflow emphasis on surgeon+engineer review of contour, thickness, and boundary fit before production: [PMC11305828](https://pmc.ncbi.nlm.nih.gov/articles/PMC11305828/) and [MDPI consensus workflow](https://www.mdpi.com/1943-3883/18/1/15)

## Out of scope

Project/case management CRUD UI, raw CT segmentation workflows, clinical certification claims, and ML model training/evaluation.
