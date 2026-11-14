# Intent: Canvas workspace (viewport + tools + sample wiring)

Author: Vien Nguyen · Date: 2026-11-14 · Status: draft  
Parent: [3d-bone-editor README](../README.md)

## Problem

The canvas is the core working surface for reconstruction, but today it is split across two unfinished tracks (tool behavior vs viewport rendering). This makes it hard to define one reliable user flow from "open sample" to "edit candidate" to "persist revision."

The current anatomy display is also visibly blocky ("minecraft-like") rather than paper-like smooth cranial surfaces. The immediate cause in the current implementation is that display geometry is reconstructed from binary NRRD voxels using aggressive downsampling plus cube-face extraction with flat shading, instead of loading an authoritative smooth display mesh representation. This is fast for prototyping but not visually faithful.

## Desired outcome

One merged canvas feature that defines a shared contract for:

- realistic viewport rendering quality,
- deterministic tool behavior,
- and durable sample/candidate update wiring through the app model.

Success means a user can load a case, inspect anatomy, create/select a candidate, transform it with Apply/Cancel semantics, restore revisions, and see the viewport reflect persisted state without ambiguity about what changed and what was saved.

## Mechanical capabilities to support on the canvas model

Derived from the global project intent, the first canvas mechanics should support:

1. Navigate and inspect 3D anatomy (orbit, pan, zoom, visibility, focus).
2. Select active document/object (sample vs candidate) and keep selection state explicit.
3. Candidate-first editing model:
   - source anatomy remains immutable reference,
   - edits apply to candidate revisions only.
4. Transform workflow with explicit transaction semantics:
   - draft transform while manipulating,
   - Apply commits revision,
   - Cancel/Escape discards draft.
5. Restore workflow:
   - select prior revision,
   - set as current candidate revision,
   - re-render that revision state.
6. Tool parity across control surfaces:
   - toolbar, keyboard shortcuts, debug/agent bridge all call the same ops contract.
7. Save/persistence boundary:
   - committed candidate changes are persisted via the software app model,
   - post-write state is reloaded from backend truth.

### Interaction definitions (specific behavior)

- **Orbit**: rotate camera around the current focus point; does not change object transforms or history.
- **Pan**: translate camera target and camera position together in screen plane; keeps viewing distance stable.
- **Zoom**: change camera distance/FOV to inspect local geometry; no mutation to sample/candidate state.
- **Visibility**: toggle per-object display state (source anatomy, candidate mesh, overlays) without deleting data.
- **Focus**: fit and center camera target on the active object bounding box so user can resume editing quickly.

View operations update only `viewState` (camera, visibility, inspection flags). They never create candidate revisions.

### Active selection model (sample vs candidate)

Selection must be explicit and visible in chrome at all times:

- `activeDocumentId`: currently opened document in taskbar context.
- `selectionObjectId`: currently selected object in scene for inspect/highlight.
- `activeDocumentKind`: `sample` or `candidate` (derived from active document record).

Expected UX:

- If `sample` is active, editing controls are disabled and UI explains "source anatomy is read-only."
- If `candidate` is active, transform/apply/cancel controls are enabled.
- Switching active document updates viewport focus, inspector content, and tool enablement state in one transaction.
- Selection highlight in viewport and selected row/tab in UI must always match the same object ID.

## User workflow (first complete canvas loop)

1. User opens case and lands on canvas with source sample visible.
2. User navigates with orbit/pan/zoom and uses focus to inspect defect area.
3. User opens or creates candidate from the selected sample.
4. UI switches active context to candidate; edit tools become enabled.
5. User performs transform; viewport shows draft pose while interaction is in progress.
6. User chooses:
   - **Apply**: commit new candidate revision, persist through backend, reload authoritative state, refresh viewport.
   - **Cancel/Escape**: discard draft transform, keep current revision unchanged.
7. User opens revision list in inspector and chooses an older revision.
8. Restore sets selected revision as current, persists pointer change, and re-renders candidate in restored pose.
9. User saves/session exits with consistent project state and revision traceability.

## Canvas UI components and rendering glossary

- **Viewport Frame**: main 3D render surface and camera interaction host.
- **Tool Rail**: primary mode controls (navigate/select/transform/apply/cancel).
- **Document Taskbar**: open sample/candidate tabs; controls active document context.
- **Workspace Navigator**: case/sample/candidate structure browser and open actions.
- **Inspector Panel**: contextual details for active document; candidate revision list and restore actions.
- **Status Banner/Toast**: explicit success/failure of ops and persistence outcomes.

Rendering terms used by this feature:

- **Source Volume (NRRD)**: authoritative anatomical data for reference/measurement.
- **Display Mesh**: smooth viewport geometry derived offline or loaded as committed asset for visual fidelity.
- **Candidate Pose**: transform matrix applied to candidate revision for rendered placement.
- **Draft Transform State**: transient in-memory edit state before Apply.
- **Committed Revision**: append-only persisted candidate revision entry after successful Apply.
- **Hydration**: reload of backend truth into frontend store after mutation.
- **Overlay Layer**: non-destructive visual guides (selection, inspection plane, markers).

## Rendering diagnosis and direction

Current issue location:

- Geometry is derived from voxel occupancy with coarse step sampling and face extraction, which preserves volume presence but creates staircase surfaces.
- Flat-shaded face normals emphasize block boundaries.
- There is no active pipeline that consumes committed smooth display mesh assets for viewport rendering.

Direction for this feature:

- Keep NRRD/source volume as authoritative measurement/reference data.
- Introduce or wire a smooth display-mesh path for viewport rendering quality comparable to paper visuals.
- Ensure pose/revision application updates both viewport state and persisted candidate revision records consistently.

## Tool logic and data-model wiring intent

Tool logic should be specified as operation-level rules (not per-component ad hoc logic):

- **View ops** mutate view state only (camera, visibility, inspection aids) and never write candidate history.
- **Edit ops** must target an active candidate document and produce either:
  - transient draft state (while editing), or
  - committed revision state (on Apply).
- **Commit rule**: only successful Apply creates a new candidate revision entry.
- **Cancel rule**: Cancel/Escape clears draft edit state and leaves revision history unchanged.
- **Restore rule**: restore changes current revision pointer to an existing revision and refreshes display from that revision.

Sample-related update wiring:

- Sample/source anatomy records are immutable after import except explicit metadata updates.
- Candidate revisions are append-only history records linked to sample and candidate IDs.
- Any mutation that changes durable state must round-trip through the app-model backend API and then hydrate frontend state from backend response to avoid drift.
- Failure paths must be explicit (no silent fallback to local-only success).

## Affected users and systems

- Biomedical engineers and surgeons working directly in 3D.
- Canvas UI surfaces: viewport, tool rail, inspector, document/task tabs.
- Shared ops layer and debug/agent bridge contract.
- Software app model persistence for candidate/revision durability.

## Constraints

- Follow `DESIGN.md` canvas register: compact studio chrome, viewport-first focus.
- Do not merge management CRUD/table concerns into this feature.
- Do not claim unsupported constraints or edits succeeded.
- Preserve object identity and revision traceability across save/reopen.

## Out of scope

- Project/case management tables and dialogs.
- Raw CT ingestion and segmentation tooling.
- Clinical validation/certification claims.
- New reconstruction ML model training scope.
- Full metric/measurement suite beyond mechanics needed for the first canvas loop.

## Open questions

1. Which smooth mesh representation is the first supported display path (committed GLB, marching-cubes with smoothing, or both)?
2. Which subset of canvas tools is mandatory for first acceptance beyond Navigate, Select, Transform, Apply/Cancel, Restore?
3. Should inspection plane and measurement overlays ship in this feature or in a follow-up canvas unit?
4. What are the exact acceptance checks for "paper-like realistic" display quality (reference images, thresholds, or human-reviewed checklist)?
5. Should candidate generation entry points (AI/manual seed) be included in this same feature or split as a subsequent canvas feature?

## Amendments

_(empty until accepted)_

## Manual construction amendment (2026-11-14)

The owner authorized defining and implementing real mechanical construction on the existing UI after read-only chat transport. The first bounded tool is manual rigid placement of an existing candidate: numeric editor-axis translation and rotation, transient preview, explicit commit, cancellation and revision restore. This replaces the fixed8mm demonstration action. It does not generate an implant, remove/add voxels, infer a defect, calculate clinical quality or enable AI writes. Subsequent shape construction/reconstruction needs its own operation contract.

## Select and Visibility amendment (2026-11-14)

The owner authorized implementing object-level Select and rendered Visibility before reconstruction. In Select mode, clicking the currently loaded mesh selects its canonical source/candidate object with a visible outline; background click/Escape clears selection and navigation drags do not select. Hidden geometry is not pickable. Visibility changes only presentation, preserves geometry/pose/history and can be recovered through a visible Show action and Show All. Scope is the one active rendered document, with per-object state retained across tab switches in the current session; no face/region selection, multi-object assembly, backend view persistence, reconstruction or AI mutation is introduced. Existing dirty work is preserved.

## Save/Open Package amendment (2026-11-14)

The owner authorized portable Save/Open Package in the existing UI. Save downloads a ZIP of committed backend project records and every referenced NRRD, plus validated presentation state. Unapplied drafts must be applied or cancelled first. Open Package imports a new project copy with fresh ids and local ownership; it never overwrites an existing project. Preserve ownership links, spatial metadata, raw hashes, volume aliasing, poses, revision order and restored current pointers. Invalid/incomplete packages fail visibly and do not replace the open project. SQLite/files remain primary storage. Legacy Node folder helpers are not browser APIs. No reconstruction, AI live mutation or new database schema is introduced.

- 2026-11-14: Continue the missing mechanical tools automatically in dependency order after portable packages. First make shortcuts/debug controls truthful, calibrate physical inspection, persist source landmarks and provide basic point-to-point measurements. Keep source bytes immutable and AI tools read-only. Advanced slice/display support depends on actual available volumes and browser capabilities. Shape editing and real reconstruction require explicit operation/reference/validation contracts; do not claim those are supplied by navigation or mock reconstruction.
- 2026-11-14 continuation: Within the automatic mechanical-tools request, implement a bounded manual binary-voxel prototype: candidate-only box fill/erase and explicit ROI/I-plane mirrored source completion. These generate real changed NRRD revisions, not reconstruction mock artifacts. They do not infer anatomical midline/defect or establish implant quality. Preserve provenance, source integrity, expected-revision commits and deterministic fixture oracles; unsupported grids/poses fail explicitly. General reconstruction, sculpting and quality metrics remain separate unsatisfied scope.
- 2026-11-14 continuation: The current candidate binary grid supplies a concrete foreground layer after voxel operations. Add view-only candidate-mask blending/opacity and renderer diagnostics using actual loaded data; keep unavailable segmentation, arbitrary layers, oblique reformat and unsupported rendering capabilities explicit.
