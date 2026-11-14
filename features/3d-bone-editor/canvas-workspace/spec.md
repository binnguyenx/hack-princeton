# Spec: Canvas workspace (viewport + tools + sample wiring)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14 (Save/Open Package follow-up)

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

## Manual rigid construction (authorized 2026-11-14)

- R63. Transform on a candidate exposes translation X/Y/Z in millimetres and rotation X/Y/Z in degrees in the existing inspector. Deltas start at zero relative to a captured current revision; no fixed nudge. The axes are editor-world axes, not certified patient RAS axes. Rotation applies X then Y then Z about the candidate origin, preserving existing translation before adding translation deltas. Only finite inputs are valid.
- R64. Preview applies the complete rigid matrix to rendered geometry without changing source scale or stored records. It uses a clone separate from the committed display object. Invalid drafts disable Apply. Cancel, tool exit or object/revision changes remove the preview. No-change Apply is disabled.
- R65. Apply sends project_id, case_id, expected_revision_id and pose to new POST /api/candidates/{id}/placement. A shared application PlacementService validates finite4×4 right-handed orthonormal rigid transforms; unsupported metadata/units, ownership mismatch, missing candidate, stale revision or unchanged pose are rejected. The original13 migration routes keep their baseline behavior.
- R66. Commit rechecks candidate membership/current pointer in one write transaction, appends a revision and atomically advances current. It preserves source NRRD bytes, volume identity/hash, spatial metadata and all prior revisions. Failure rolls back. Concurrent callers against one expected revision permit one commit; stale callers receive409.
- R67. Successful Apply reloads authoritative state and reopens the candidate. Failure leaves the draft available with an explicit error and no success claim. The UI blocks duplicate submissions while pending; keyboard/menu Apply share the same handler. Restore renders full persisted rotation/translation.
- R68. Manual placement is a real geometric rigid operation, not reconstruction. The UI labels editor axes and pivot. Samples remain protected. No geometry-generation, voxel editing, real measurement, AI mutation, model, schema migration or new dependency is introduced.

## Object Select and rendered Visibility (authorized 2026-11-14)

- R69. Select mode (V/menu) supports object-level raycast picking of the currently loaded active mesh. An unmodified primary click hit selects the canonical sourceAnatomy.objectId for a sample or candidate.objectId for a candidate. A bounding outline provides selection feedback without recoloring cached mesh materials. Background click or Escape clears selection. Active document context remains explicit; no face/region selection is claimed.
- R70. Pointer drags beyond4 CSS pixels, modifier/navigation gestures, cancellation, hidden/unloaded geometry and a changed mesh/document during the gesture cannot select an object. Navigation gestures remain available. Picking uses the actual active perspective/orthographic camera and canvas bounds, never a stale scene/model identity.
- R71. Shared view ops validate object identities. Hiding a selected object clears selection; selecting an unknown/hidden object fails without changing view/domain state. Changing the active document clears stale selection. These are transient view-state operations: no candidate revision, source-byte/pose change, dirty edit flag or backend write.
- R72. Visibility toolbar, H and menu operate on the active canonical object. View visibility reaches the actual rendered root and selection outline. Hidden geometry cannot be picked, and readCanvas.visibleObjectIds reflects rendered visibility while object matrices remain readable and unchanged. Toggling visibility does not reload geometry or reset the camera.
- R73. A hidden-object message includes an operable Show object action. Toolbar/menu can show the object without requiring selection. Show All restores known objects' visibility in the current session, including objects hidden on other tabs. Returning to another tab respects its visibility; full reload/backend hydration may reset transient view settings.
- R74. Renderer selection/visibility survives same-object display replacements and explicit renderer rebuild. Highlight resources are isolated and disposed; no source/cached material/geometry mutation. Current-state refs and mesh ownership prevent stale callbacks from selecting an old mesh as a new object. readCanvas includes selected/highlighted object ids for observable proof.
- R75. UI/shortcut and debug callers use shared view selection/visibility ops. Existing domain mutation/debug parity gaps remain separate. No reconstruction, shape edit, physical measurement, geometry service, schema/dependency change or AI live mutation is added.

## Portable Save/Open Package (authorized 2026-11-14)

- R76. Save exports an authoritative backend project snapshot and all uniquely referenced NRRD volumes as ZIP, verifying hashes before delivering a complete download. POST /api/projects/{id}/package accepts optional validated presentation only, never client-supplied project/candidate metadata. Missing/deleted/corrupt volume or concurrent source deletion fails without a partial successful archive or database write.
- R77. ZIP v1 contains package.json ({format: project-package, version:1}), manifest.json (app formatVersion1), and exactly volumes/{safeVolumeId}.nrrd for referenced volumes. Enforce64MiB compressed,256MiB expanded,512 entries and4MiB JSON bounds. Reject unsafe/duplicate/symlink/encrypted/unsupported entries, invalid JSON/version/identity/ownership/order/pointer/hash/bytes. Do not extract client filenames to disk. Unverified samples may retain raw JSON spatial metadata; verified samples require valid app spatial metadata. Preserve valid finite16-value poses; do not silently repair malformed legacy records.
- R78. POST /api/packages/import creates a new project copy named original name + ' (imported)' under local-dev. Remap project/case/sample/source/candidate/revision/volume ids, ownership references, current pointer and presentation ids consistently. Preserve source bytes, license/display names, spatial metadata, raw hashes, poses, contiguous revision order and shared volume references. Original projects remain unchanged, even when importing a package from the same workspace repeatedly.
- R79. PackageService validates before repository writes. New files are staged under server-assigned ids and published without overwriting files. Metadata creation/current pointers share one transaction; caught failures roll back and remove new non-authoritative files. No new schema, deletion/replace API or automatic crash-recovery protocol is added. An abrupt process crash may leave unreferenced staging/files for explicit reconciliation, not a published partial project.
- R80. Header/menu/Ctrl-Cmd+S share the real download handler. Block Save/Open while a draft or existing write/package request is pending. Show bounded pending/success/error feedback; report download started rather than claiming a browser file was saved. Open Package uses a native file chooser in a Radix dialog, explicit import-as-copy action, cancellation and visible error feedback. A synchronous guard prevents duplicate submissions; no automatic import retry.
- R81. Open hydrates committed backend truth before switching UI context, then applies validated remapped package presentation. Invalid/read/upload/import failure keeps the current project/state. If server import commits but subsequent hydration fails, report that the new copy exists; do not claim rollback or automatically import again. Imported records/files survive backend restart and can be exported again.
- R82. Presentation includes the stored viewState camera/selection/visibility/inspection-plane, openDocuments and activeDocumentId; validate finite camera/ownership and remap ids. These settings restore on Open but are not new persistent API view preferences. Projection, Window/Level, layout, chat, pending operations and draft geometry are excluded. Unknown file paths/assets/source directories are never fetched or persisted from archive metadata. Legacy folder packages are not the new versioned ZIP contract.
- R83. GET /api/candidates/{id}/revisions/{revision_id}/volume reads only a revision belonging to that candidate. Client uses it for candidate volumes distinct from source; current/recovered pose and hash remain authoritative. Source-reference slices remain source views. No geometry generation is performed.
- R84. Verify real browser download→file upload→new project→reload/restart and failure/cancel/busy flows, using disposable storage; compare old/new ownership graph, hashes/bytes and restored pointers. Existing routes and view/manual/chat contracts remain intact. Package import is explicit manual user action; the AI registry remains read-only.
- R85. Display meshes are optional derived assets. A sample name/path from an imported archive cannot select an unrelated GLB: reuse a bundled trusted catalog mesh only when its primary-volume SHA matches the actual sample. Otherwise use the existing NRRD display fallback; candidate-only volumes cannot reuse the source GLB. Source data and spatial metadata are not rewritten.

## Mechanical follow-up (authorized 2026-11-14)

- R86. Shortcut resolution is shared and testable: Restore is Mod+Backspace, Shift+Mod+Z never falls through to Undo, source standard-view key/keypad bindings agree with labels. Suppress tool/navigation shortcuts in text/contenteditable, composing/default-prevented events, dialogs and inactive views. Undo/Redo navigate adjacent immutable committed revisions; cancelled drafts have no redo history. No revision is appended by history navigation.
- R87. Debug command dispatch uses the same registered UI command validation for supported view actions. Reject unknown, disabled and domain-writing commands explicitly. Remove misleading legacy in-memory mutation exposure. This is a manual development view facade; the AI registry stays read-only. Dispatch acceptance is distinct from completed render/result evidence.
- R88. Center preserves camera distance/orthographic zoom; projection changes preserve target and target-plane framing. A numeric orthographic ruler derives CSS pixels per world millimetre from frustum, zoom and live viewport height; it updates on zoom/resize and is disabled for unverified/non-mm data. Perspective never claims physical calibration.
- R89. Debug state exposes real active-view ownership, camera quaternion/frustum/zoom, ruler calibration and pending manual/package writes. A render publish must not steal active-view ownership from a slice. Existing object matrices and source/revision data remain unchanged by view actions.
- R90. Slice inspection requires successfully decoded matching volume dimensions. Each slice provides reset/automatic window, interpolation, bounded view-only zoom/pan, and actual active-view/keyboard ownership. Only supported shortcuts appear. Ctrl-drag region sampling computes range from selected source voxels. Crosshair/point conversion accounts for pan/zoom and physical aspect ratio; invalid transforms reject visibly.
- R91. Manual source landmarks persist in SQLite with sample/source-volume hash ownership, validated finite in-bounds IJK and derived RAS millimetres from verified invertible affine metadata. Place supports one-shot and persistent modes, explicit pending/error feedback, cancellation and deletion; failed writes keep earlier records. Never write source bytes or candidate revisions.
- R92. Basic measurement selects two distinct saved source landmarks from the same sample and displays their Euclidean RAS distance in mm. It is straight-line point measurement, not surface/geodesic/implant thickness/deviation or a clinical judgment. Invalid/missing/cross-sample data rejects without fabricated values.
- R93. Landmark annotations survive reopen, backup and portable package copy with all identities remapped and source hash validated. Old ZIP v1 still opens; packages containing annotations use an explicit newer marker so older implementations cannot silently lose annotations. Existing13 compatibility route behavior stays intact. The manual annotation endpoints are never registered as AI tools.
- R94. Test each follow-up with deterministic fixtures and actual browser actions, including inputs/disabled/error/recovery, immutable source/history, restart and package round-trip. Preserve earlier dirty work, dependencies and live user data. Reconcile the mechanical gap report and task board with evidence; unresolved geometry/layer/device contracts stay explicit.

## Bounded real voxel prototype (automatic follow-up)

- R95. Manual candidate voxel operations accept only verified-mm, invertible orthogonal source grids with binary uint8 NRRD raw/gzip payload, matching dimensions and valid hashes. Bound decoded data to256 MiB and edited ROI to4194304 voxels. Candidate pose must be identity; source, spatial metadata and earlier revisions remain immutable. Unsupported types/encoding/grid/pose are unavailable, never coerced.
- R96. Box fill/erase changes only inclusive user-selected IJK bounds on the current candidate. Mirror ROI copies protected source occupancy at reflected index 2*planeI-I only into empty target voxels. Require a half-grid-aligned explicit I-plane, one-sided ROI, reflected source indices inside the volume and outside target ROI. Do not estimate anatomy, shape or a midsagittal plane. Reject unchanged or empty output instead of fabricating successful reconstruction.
- R97. POST /api/candidates/{id}/voxel-operation validates project/case/expected revision, runs an injected registered voxel adapter and commits fresh immutable NRRD bytes/hash/revision/current pointer under one SQL transaction with exclusive file publication and caught-failure cleanup. A stale concurrent commit fails409. No automatic retry, provider or AI binding is added.
- R98. Persist operation name, exact parameters, input revision, immutable source hash and changed-voxel count as revision provenance in an additive optional table. Backup and ZIP v2 preserve/remap provenance; old ZIP v1 remains accepted for unannotated/unprovenanced records. History labels must not call voxel changes pose transforms.
- R99. UI exposes numeric IJK bounds, fill/erase/mirror operation choice and explicit I-plane parameter in the existing inspector. State precisely that operations modify a candidate volume and append a revision; source remains protected. Pending/error/recovery and no-change states are visible, duplicate submissions are guarded, and Restore/Redo render the actual selected revision volume. Mirror is an experimental grid-symmetry completion baseline, not a validated cranial implant, freeform sculpt, automatic defect detection or clinical result.
- R100. Verify known asymmetric synthetic binary grids against literal output voxels, ROI/source protection, actual changed bytes/hash, pose/type/geometry rejection, adapter substitution/failure, rollback and stale/concurrent commits. Real browser proof verifies manual input → FastAPI → new volume → rendered candidate → Restore; a fake/model response cannot substitute for geometry.

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

Source reconciliation: 2026-11-14, updated after the manual-placement and Select/Visibility follow-ups in the current working tree. This is implementation evidence, not acceptance of every requirement. Requirements above remain targets where incomplete. The control catalog and Slicer-specific gaps are in [Canvas mechanics reference](../canvas-workspace-improve/README.md).

### Implemented in the current UI path

- **Navigate**: OrbitControls supplies orbit, pan and zoom; custom Ctrl/Cmd+LMB supplies roll. Camera controls, six view presets, Center/Reset and projection are wired in `Viewport.tsx`, `ViewController.tsx` and `App.tsx`. These do not create candidate revisions. Full Slicer input parity remains incomplete.
- **Transform**: Object → Transform Tool / T opens numeric translation X/Y/Z (mm) and rotation X/Y/Z (degrees) for a candidate with verified mm metadata and a valid rigid pose. `RigidPlacementControls.tsx` and `geometry/rigidPlacement.ts` build a transient pose relative to the captured revision. A cloned display object renders the full rotation/translation while preserving derived scale and camera. This is editor-world placement, not patient-RAS-certified implant construction. No mouse gizmo, sculpting or voxel editing is implemented.
- **Apply**: the UI calls `apiClient.placeCandidate` → POST `/api/candidates/{id}/placement` → `PlacementService` → `ApplicationRepository.commit_placement`. Membership and expected revision are checked inside the write transaction; one immutable pose revision is appended and current pointer advanced. Source NRRD bytes/hash are unchanged. Unchanged/invalid drafts cannot Apply; stale requests return409; the pending guard prevents repeated UI Apply. Successful writes reload backend truth; HTTP failure keeps the draft and reports the failure. The old `/transform` route retains its compatibility baseline.
- **Cancel / Escape**: removes the displayed draft and leaves committed records unchanged. Leaving the tool, navigating away, or switching/closing documents removes the active preview. This is cancellation before commit; it is not cancellation of an already accepted backend write.
- **Restore**: menu action and inspector revision buttons call the backend, reload the manifest and render the restored full pose. Restore moves the pointer to an existing revision rather than appending/deleting history. An active draft must be cancelled/applied first. Edit → Undo and Ctrl/Cmd+Z currently use this pointer-restore behavior; Redo is a message-only placeholder.
- **Focus**: F / menu Focus and the Center button trigger the viewport framing path; Reset is a separate orientation/framing action. This is available for the active rendered document, not a picked face or arbitrary region.
- **Inspection/display**: linked axis-aligned Axial/Sagittal/Coronal slices, crosshair/offsets, basic Window/Level, one-shot slice Place, screen crosshair, lighting, Spin/Rock, layout collapse/maximize and explicit WebGL Rebuild are wired. One-shot Place only moves the crosshair and shows a message; it does not create a landmark or candidate. See the linked catalog for remaining display gaps.

- **Select**: V/menu enables raycast selection of the loaded active source/candidate. Plain hit selects the canonical sourceAnatomy.objectId or candidate.objectId and draws a separate blue bounding outline; background click/Escape clears it. Navigation drags/modifiers/cancelled gestures, hidden/unloaded objects and scene changes cannot select. Current mesh ownership prevents stale tab geometry inheriting a new id. Object-level selection does not change geometry/history or camera.
- **Visibility**: toolbar Hide/Show, H and menu Toggle Visibility reach validated shared view ops and the actual renderer. Hiding clears selection and removes its outline. A visible Show object action and Show All recover without selection; hidden objects cannot be picked. Object matrices remain unchanged/readable while visibleObjectIds reflects the hidden root. Selection/visibility no longer trigger geometry rebuild. Renderer rebuild reapplies current view state.

### Partial wiring or missing behavior

- **Remaining selection scope**: whole active-object picking/highlight is implemented, but face/region selection and multi-object scene assembly are not. Candidate inspector fallback still shows active-document context after selection is cleared; that is not a selected-object highlight.
- **Visibility persistence**: per-object presentation state is retained across document tabs in this session, not saved through the application API or guaranteed across reload/backend hydration. Source and candidate use separate canonical ids; hiding3D geometry does not hide the linked2D source slices.
- **Save / Open Package implemented**: header/menu/Ctrl-Cmd+S export an authoritative ZIP v1; header/home Open Package imports a validated new copy. All IDs and portable view references remap; history, restored pointer and hashed volumes persist. Drafts/pending actions block packaging. Limits and crash/orphan boundaries are R76–R85; overwrite/merge and automatic view persistence remain out of scope. Legacy Node directory helpers are separate.
- **Shortcut parity**: menu/command search and actual keyboard handlers share `runCommand` for the supported subset. Registry shortcut labels alone are not execution proof: Restore advertises Ctrl/Cmd+Backspace but that key is not handled; Ctrl/Cmd+Shift+Z enters the existing Ctrl/Cmd+Z restore branch rather than performing Redo. Plain Enter applies outside text controls; input handling suppresses it in numeric fields. Full repeat/disabled/failure parity is not proven for every command.
- **Shared ops / debug parity**: UI placement/restore use the authoritative FastAPI services. Selection/visibility/Show All share validated view ops with debug callers, with an explicit view-change callback refreshing the UI. `window.__hackPrincetonDebug.ops` still exposes legacy in-memory session transform/restore functions. They are not equivalent durable writes and are not a supported AI mutation interface. A unified control API and complete parity remain gaps. AI chat stays metadata-only.
- **WorkspaceNavigator / chrome**: management navigation and `DocumentTaskbar` are mounted; a dedicated `WorkspaceNavigator` is not mounted in the current canvas. `CanvasWorkspace`, `ViewController` and its mode rail replace the old floating `ToolRail`/`OptionsBar` as primary chrome. Component file existence does not mean it is mounted.
- **Advanced inspection and construction**: calibrated mm ruler, camera-reactive orientation marker, oblique reformat, slice layers/blending, show-slices-in3D, persistent landmarks and broader Slicer parity are not delivered. A static ruler/axis label is not a measurement. The legacy `setInspectionPlane` updates view state but is not a wired3D clipping-plane tool; working axis-aligned slices are a separate path. There is no real reconstruction, voxel/mesh shape editing, physical measurement, reference-surface/mirror comparison, defect-boundary/rim tooling or deviation overlay. Those design terms below describe targets, not available tools. Sandbox reconstruction remains explicitly mock and is not published to the live viewport.
- **Automation evidence**: `readCanvas()` now reports frame-current camera, selected/highlighted ids, visibility and object matrices. Active-view ownership, pending operation counts and a complete per-command result facade are unfinished. Existing tests do not establish every accepted stress/failure requirement. The README records the exact observability limitations.

### Evidence and review limits

- Source paths reviewed: `app/src/App.tsx`, `commands/registry.ts`, `viewport/Viewport.tsx`, `viewport/navigationPolicy.ts`, `ui/CanvasWorkspace.tsx`, `ui/Inspector.tsx`, `ui/DocumentTaskbar.tsx`, `ui/RigidPlacementControls.tsx`, `geometry/pose.ts`, `geometry/rigidPlacement.ts`, `ops/session.ts`, `debug/bridge.ts`, and the Python placement route/service/repository.
- Existing proof inspected: `app/e2e/canvas-workflow.spec.ts`, `app/e2e/placement.e2e.ts`, `app/e2e/migration.e2e.ts`, rigid-placement math/control tests and `backend/ai/tests/integration/api/test_placement.py`. They cover representative canvas effects, real numeric preview/cancel/commit/restore, immutable source bytes, stale/concurrent commit and rollback. The added `app/e2e/selectVisibility.e2e.ts` and focused `selectionVisibility.test.ts`, `objectInteraction.test.ts`, `ui/objectVisibilityControls.test.tsx` prove whole-object picking/outline, hit/miss/drag/modifier rejection, hide/show/recovery, tab state and selected renderer rebuild with unchanged HTTP data/source bytes. They do not prove face/region picking, every shortcut or complete Slicer parity. Package proof is separately recorded in `plans/save-open-package.md`, HTTP `test_packages.py` and real dev/built `packages.e2e.ts`.
- The earlier documentation-only reconciliation is recorded in [the review preflight](preflights/mechanics-gap-review.md). The subsequent scoped implementation/proof lives in [Select/Visibility plan](plans/select-visibility.md) and its preflight; it does not accept other deferred requirements or enable reconstruction/AI writes.

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
- Portable package: `backend/ai/src/skullfix_ai/application/packages.py`, `backend/ai/src/skullfix_ai/api/routes/packages.py`, `app/src/api/packages.ts`, `app/src/ui/dialogs/OpenPackageDialog.tsx`, `app/e2e/packages.e2e.ts`
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

Manual placement lives in `app/src/ui/RigidPlacementControls.tsx`, `app/src/geometry/rigidPlacement.ts`, `app/src/geometry/pose.ts`, `backend/ai/src/skullfix_ai/application/placement.py`, `backend/ai/src/skullfix_ai/api/routes/placement.py` and the application repository. Proof: `app/tests/rigidPlacement.test.ts`, `backend/ai/tests/integration/api/test_placement.py`, `app/e2e/placement.e2e.ts`.

## Derived display follow-up

- R101. Newly edited voxel revisions cannot use an unrelated source GLB. Derived fallback vertices retain the source raw physical grid frame (origin/directions/spacing), while root candidate pose remains independent. Preserve existing stored pose conventions; a universal patient-RAS registration of every GLB is still unverified and must not be claimed. Source landmarks/measurement use the independently validated source affine, never rendered display vertices.

- R102. With a decoded identity-pose binary candidate on the source grid, slices can show that actual current candidate as a foreground mask, control opacity, and choose normal accent overlay, maximum or absolute-difference blending. Reload the foreground on revision changes, never substitute source bytes for distinct candidate content, and disable with a named missing/pose/grid/type reason. Source-only slices remain the default. These are view preferences only.
- R103. A rendering-diagnostics toggle reports measured animation-loop FPS and actual renderer draw/triangle counters. Diagnostics do not claim GPU throughput or supported stereo/depth peeling. They preserve model/data state and stop updating when the viewport is disposed.
