# Spec: Mechanical last parts — annotation, measurement, and spatial markup

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14

## Summary

This feature adds the full spatial markup and measurement layer the canvas is missing. It ships in two phases. Phase 1 covers landmark points, distance lines, closed curves, and text notes — the minimum needed for a reviewable reconstruction proposal. Phase 2 covers angles, planes, open curves, bounding-box ROIs, and surface highlight overlays. Both phases share one data model, one ops layer, and one annotation panel; Phase 2 extends all three.

Annotations are attached to candidate revisions. Source anatomy is immutable; annotating it is not permitted. The coordinate authority for all annotation RAS points is `sourceAnatomy.spatial` of the sample that owns the active candidate — the same affine the crosshair uses today.

UI hierarchy, component ownership, visual tokens, and all journey-level behavior are defined in [ui-journeys.md](ui-journeys.md). Requirements here state *what must be true*; `ui-journeys.md` states *how it behaves and looks*.

---

## Requirements

### Shared invariants (both phases)

- R1. Every annotation record is owned by a candidate revision. No annotation can be created when the active document is source anatomy or when no candidate is open.
- R2. An annotation record stores: a unique ID, a type discriminant, a name editable by the user, the owning revision ID, an ordered list of RAS control points (each `[x, y, z]` in mm), a locked flag, a visible flag, and an ISO-8601 created-at timestamp.
- R3. All annotation RAS coordinates are computed through the same `IJK → patient (RAS)` affine used by the crosshair: `sourceAnatomy.spatial` of the sample whose candidate revision owns the annotation. This is the single coordinate authority; no annotation may store coordinates derived from a different volume's affine. A coordinate computed from a voxel pick and stored in an annotation must round-trip back to the same voxel within one voxel width under that affine.
- R4. Annotation records persist in app-model SQLite in a new `annotations` table keyed by `revision_id`. They are included in the project manifest returned by `GET /api/projects/:id` and loaded into `EditorState.annotations` when a project is opened — the same single-fetch load path all other records use. No separate per-revision fetch is required at open time.
- R5. The `ProjectManifest` type in `app/src/io/projectPackage.ts` gains an `annotations?: Annotation[]` field. `saveProjectPackage` writes annotations to `manifest.json`; `loadProjectPackage` reads them back. Projects written before this feature are opened with `annotations: []`.
- R6. Every place that constructs an `EditorState` from scratch initialises `annotations: []`: `createProject` in `session.ts`, `seedEmptyProject` in `session.ts`, `setStoreFromManifest` in `App.tsx`, and `loadProjectPackage` in `projectPackage.ts`.
- R7. Annotation ops are exposed through `publicOps` in `app/src/ops/index.ts`. They update `EditorState` in memory. The API calls that persist changes to SQLite are made by `App.tsx` (the same two-step pattern used by `transformCandidate`: ops layer updates in-memory state → `App.tsx` calls `apiClient` → `App.tsx` reloads the project manifest). The ops layer does not make fetch calls directly.
- R8. `app/src/api/client.ts` gains typed methods for every annotation API endpoint. `App.tsx` calls these methods when annotation ops indicate a change, then calls `loadProject` to sync.
- R9. Annotations are exposed through `publicOps` so the AI agent can call the same operations the UI uses.
- R10. An annotation is either visible or hidden. Hiding does not delete it. A hidden annotation continues to be listed in the annotation panel with its measurements intact.
- R11. A locked annotation cannot have its control points moved in the viewport. Lock state is toggled from the annotation panel only.
- R12. Deleting an annotation removes it from the database, the viewport, and the panel immediately. Deletion is not undoable. The user must confirm deletion for any annotation that has an attached measurement result (i.e. enough control points to produce a value).
- R13. Measurement values displayed in the viewport and panel are always derived from the current control-point positions in RAS space. They are computed at render time, never stored in the database. They update live as a point is dragged during placement.
- R14. Each measurement reports its value and unit explicitly: mm for distances and lengths, degrees (°) for angles (Phase 2), mm² for plane area (Phase 2), mm³ for ROI volume (Phase 2). A value is shown as `—` and labelled "Insufficient points" rather than zero when the annotation does not yet have enough control points to produce a result.
- R15. Annotation placement reuses the existing Place mode infrastructure. Selecting an annotation type activates Place mode with that type as the active target. Escape cancels an in-progress placement without deleting already-placed points on a multi-point type.
- R16. The annotation panel is a named section inside `InspectorDrawer` titled "Annotations". It does not reserve permanent viewport width when empty (canvas-workspace-improve R78).
- R17. In the 3D view, each annotation renders its control-point glyphs and connecting geometry (line segment, curve polyline, etc.) as a Three.js overlay above the existing scene. `AnnotationOverlay` receives the annotations array as a prop from `App.tsx`, which passes it to `CanvasWorkspace`, which passes it to `Viewport`. `Viewport` mounts `AnnotationOverlay` as a child component that accesses the same Three.js scene via a shared ref or context. This overlay does not alter source or candidate volume bytes.
- R18. In slice views, each annotation projects its control points onto the displayed slice plane. Points more than one slice-spacing away from the displayed plane are shown as projected outlines at reduced opacity (matching 3D Slicer's projection visibility behavior).
- R19. Each annotation type has exactly one persistent placement entry point in `ContextStrip` when Place mode is active. No duplicate persistent controls elsewhere in the UI.
- R20. The cascade deletion chain through `candidates → candidate_revisions → annotations` relies on `ON DELETE CASCADE` FKs. `deleteCandidate`, `removeSample`, `removeCase`, and `deleteProject` in `storageSqlite.ts` do not need annotation-specific delete code because the cascade handles it, provided the `annotations` table is created with the FK before any of those operations run. The `initDb` function must create the `annotations` table before the cascade-dependent tables are referenced, or add it to the existing `CREATE TABLE IF NOT EXISTS` block.

---

### Phase 1 — Landmark, distance line, closed curve, text note

#### Landmark (fiducial point)

- R21. A landmark is a named RAS point. Placing one requires exactly one click in a 3D or slice view.
- R22. After placement the landmark glyph renders as a sphere in the 3D view and a crosshair glyph in slice views. Its name label is visible in both views by default and can be toggled in the panel.
- R23. Clicking a landmark row in the annotation panel jumps all linked slice views to that RAS position (same behavior as clicking a control point in 3D Slicer's Markups control-points table).
- R24. The panel row for a landmark shows: name, RAS coordinates to two decimal places (mm), lock icon, visibility icon, delete button.

#### Distance line

- R25. A distance line requires exactly two RAS control points. The first click places point A; the second completes the line. While only one point is placed, the line segment previews from A to the current cursor position.
- R26. The distance value is `|B − A|` in RAS millimetres computed as the Euclidean norm. It renders as a label at the midpoint of the line segment in both 3D and slice views.
- R27. Either endpoint can be repositioned by click-and-drag after placement. The distance label updates live during drag.
- R28. The panel row shows: name, distance in mm to two decimal places, lock, visibility, delete.

#### Closed curve

- R29. A closed curve requires three or more RAS control points. Each click adds a point. Double-click or Enter closes the curve (connects last to first). Right-click cancels an in-progress placement and removes all points placed in that session.
- R30. Interpolation is linear (straight segments between adjacent control points) in Phase 1.
- R31. The displayed length is the sum of the Euclidean distances between consecutive RAS control points, including the closing segment, in millimetres.
- R32. After closure, any control point can be repositioned by click-and-drag. Length updates live.
- R33. The panel row shows: name, closed-curve length in mm to two decimal places, lock, visibility, delete.

#### Text note

- R34. A text note is a named RAS anchor point with an editable free-text body. Placing one requires one click. After placement an inline text entry immediately activates so the user types the note body without a second click.
- R35. The note renders in the 3D view as a sphere glyph with a callout label showing the first 40 characters of the body, truncated with an ellipsis if longer. Full text is shown in the annotation panel row.
- R36. The note body can be edited from the annotation panel row at any time by clicking the text. The edit is committed on blur or Enter and cancelled on Escape.
- R37. The panel row shows: name, truncated body preview (40 chars), RAS anchor position, lock, visibility, delete.
- R38. A text note with an empty body is allowed; it renders with the name as the label.

#### Phase 1 placement UX

- R39. When Place mode is active, `ContextStrip` shows four buttons: **Landmark**, **Distance Line**, **Closed Curve**, **Text Note**. The active annotation type is highlighted. Only one type is active at a time.
- R40. Switching annotation type while a multi-point placement is in progress discards the in-progress placement after a confirmation prompt. Already-committed annotations are unaffected.
- R41. Place mode returns to View mode after a landmark or text note is committed (one-shot). Distance line and closed curve keep Place mode active until the user explicitly exits or presses Escape with no in-progress placement (persistent).

---

### Phase 2 — Angle, plane, open curve, ROI, surface highlight

#### Angle

- R42. An angle markup requires exactly three RAS control points: vertex B and two arm points A and C. Click order: A, B, C. The angle is `acos(( (A−B)·(C−B) ) / ( |A−B| × |C−B| ))` in degrees.
- R43. The two arm segments and the arc indicator render in the 3D and slice views. The degree value renders at vertex B.
- R44. Any of the three points can be repositioned by drag; the degree value updates live.
- R45. The panel row shows: name, angle in degrees to one decimal place, lock, visibility, delete.

#### Plane

- R46. A plane markup can be placed by two methods selectable in `ContextStrip`: **Point-normal** (one click on a surface places the plane origin; normal aligns to the view direction at time of placement) or **Three-point** (three clicks define origin and axes).
- R47. The plane renders as a semi-transparent rectangle centered on the origin, sized to the bounding box of visible anatomy padded by 10 mm.
- R48. The area measurement is the area of the intersection of the plane with the bounding box of all loaded geometry in mm².
- R49. A placed plane can optionally drive a cross-section slice: clicking **Show in slice dock** in the panel row adds the plane's orientation and offset as a new linked slice in `SliceDock`. Closing that slice removes only the slice entry, not the plane annotation.
- R50. Plane control points can be repositioned by drag; the rectangle and any driven slice update live.
- R51. The panel row shows: name, plane normal vector, area in mm², Show-in-slice-dock toggle, lock, visibility, delete.

#### Open curve

- R52. An open curve requires two or more control points. First click places A; subsequent clicks add points; Enter or double-click commits without closing.
- R53. The displayed length is the sum of Euclidean distances between consecutive points, excluding any closing segment.
- R54. The panel row shows: name, open-curve length in mm to two decimal places, lock, visibility, delete.

#### Bounding-box ROI

- R55. A bounding-box ROI is placed by clicking two diagonally opposite corners, defining an axis-aligned box in RAS space.
- R56. After placement the ROI is resizable by drag on face and corner handles.
- R57. The displayed volume is the product of the three box edge lengths in mm³.
- R58. The ROI box is serialized as `{ min: [x,y,z], max: [x,y,z] }` in `meta_json` and can be passed as an input constraint to a future generation operation through the shared ops layer.
- R59. The panel row shows: name, bounding box extents (L-R × P-A × I-S in mm), volume in mm³, lock, visibility, delete.

#### Surface highlight

- R60. Surface highlight is a painted region on a candidate mesh surface. The user enters Paint mode (a submode of Place mode available only when a candidate geometry is active) and left-click-drags a brush over the mesh.
- R61. The brush is a sphere of configurable radius (slider in `ContextStrip`, range 2–30 mm, default 10 mm). Each painted stroke accumulates triangles whose centroids fall within the brush sphere at the click position, using the display mesh's triangle index array.
- R62. Each highlight overlay has a name and a user-selectable accent color chosen from four options in `ContextStrip`: accent blue (default), amber, rose, emerald. Colors map to `DESIGN.md` token equivalents.
- R63. A highlight overlay renders as a colored semi-transparent overlay (opacity 0.4) on the selected triangles. It is built as a `THREE.Mesh` with a filtered copy of the display mesh's index buffer and a `MeshBasicMaterial` with `transparent: true`. It does not modify the source `BufferGeometry`.
- R64. Triangle indices are stored against the candidate's current display mesh. If the display mesh is later regenerated (e.g. a future re-mesh op), stored indices may become invalid; the overlay renderer must detect out-of-range indices and show a named warning ("Highlight overlay references stale mesh — repaint required") rather than crashing or mispainting.
- R65. Clicking **Clear** in the panel row removes all strokes from that highlight overlay. The overlay object remains and can be repainted.
- R66. The panel row shows: name, triangle count, brush-radius control, color selector, clear strokes, lock, visibility, delete.
- R67. Surface highlight is disabled with the reason "Requires candidate mesh" when no display mesh is loaded for the active document.

#### Phase 2 placement UX

- R68. When Place mode is active with Phase 2 types available, `ContextStrip` shows all nine annotation type buttons grouped with a visual separator between Phase 1 and Phase 2 types.
- R69. Surface Highlight exposes a brush-radius slider in `ContextStrip` only when Surface Highlight is the active type.
- R70. Plane type exposes the Point-normal / Three-point sub-selector in `ContextStrip` only when Plane is the active type.

---

### Annotation panel behavior (both phases)

- R71. The annotation panel renders as a named section inside `InspectorDrawer` titled "Annotations". When no annotations exist on the active revision, it shows an empty state ("No annotations yet") and does not reserve height.
- R72. The panel lists annotations in creation order. Each row is collapsed by default, showing name, type icon, primary measurement, lock icon, visibility icon, and delete button. Clicking a row expands it to show all fields for that type.
- R73. The panel provides a **Place annotation** button that activates Place mode. It is disabled with "Requires active candidate" when source anatomy is active or no candidate is open.
- R74. Renaming is done by clicking the name in the expanded row. The rename is committed on blur or Enter.
- R75. The annotation panel scrolls independently of the rest of `InspectorDrawer`. Adding a new annotation scrolls the panel to bring the new row into view.
- R76. Measurement values in the panel and viewport are always consistent. If a control point is moved in the viewport, the panel value updates before the next animation frame.
- R77. When `restoreRevision` is called (from either the Inspector revision history or keyboard shortcut), the annotation panel immediately reflects the annotations owned by the newly active revision ID. Because annotations are part of the project manifest and `App.tsx` calls `loadProject` after every restore, this happens automatically — no separate annotation fetch is needed.

---

## Success criteria

### Phase 1

- S1. Given a candidate revision is active, when the user enters Place mode and selects Landmark, clicking in the 3D view places a named landmark, the glyph appears in both the 3D view and all slice views, the annotation panel shows the row, and the stored RAS coordinate matches the crosshair position to within 0.1 mm.
- S2. Given a landmark is placed, when the user clicks its panel row, all linked slice views scroll to the landmark's RAS position.
- S3. Given a distance line placed between two points, when either endpoint is dragged, the displayed distance label in the viewport and the panel value both update live and agree to two decimal places.
- S4. Given a closed curve with four or more control points, when the user closes it, the displayed length equals the sum of the Euclidean distances between consecutive RAS control points (including the closing segment) to within 0.01 mm.
- S5. Given a text note is placed, when the user edits its body in the panel, the viewport label updates to the first 40 characters on blur.
- S6. Given any Phase 1 annotation, when the user hides it via the visibility icon, the glyph disappears from all views and the measurement value remains in the panel row.
- S7. Given any Phase 1 annotation, when the user locks it, clicking and dragging its control point in the viewport produces no movement.
- S8. Given a revision with two annotations, closing and reopening the project loads both annotations with their control points, names, and measurement values intact. This is verified by calling `GET /api/projects/:id` and asserting the returned manifest includes both annotation records.
- S9. Given source anatomy is the active document, the Place annotation button in the panel is disabled and annotation type buttons in `ContextStrip` are absent.
- S10. Given an in-progress closed-curve placement (two points placed), pressing Escape removes the in-progress state without affecting any other existing annotations.
- S11. Given a candidate is deleted via `DELETE /api/candidates/:id`, querying the annotations table for any revision that belonged to that candidate returns zero rows (cascade verified).
- S12. Given a sample is deleted via `DELETE /api/samples/:id`, any annotations belonging to revisions of candidates of that sample are also gone (cascade verified).
- S13. Given a project manifest is serialized to `manifest.json` via `saveProjectPackage`, the file contains an `annotations` array; loading it via `loadProjectPackage` restores the same array into `EditorState.annotations`.

### Phase 2

- S14. Given an angle markup placed at three points A, B, C, the displayed degree value matches `acos(dot(norm(A−B), norm(C−B))) × (180/π)` to within 0.1°.
- S15. Given a plane placed by Point-normal, clicking Show in slice dock adds a slice to `SliceDock` displaying the cross-section; closing the slice removes only the slice, leaving the plane annotation in the panel.
- S16. Given an open curve with five points, the displayed length equals the sum of four consecutive Euclidean distances (no closing segment) to within 0.01 mm.
- S17. Given an ROI box placed and then resized via face handles, the volume displayed equals the product of the three edge lengths to within 0.1 mm³.
- S18. Given a highlight overlay painted with ten brush strokes, clicking Clear removes the visual overlay from the mesh; the annotation row remains in the panel and can be repainted.
- S19. Given a candidate document with no display mesh loaded, the Surface Highlight button in `ContextStrip` is disabled with a visible reason label.
- S20. Given all nine annotation types each placed once on the same revision, the annotation panel lists all nine rows; each shows the correct type icon, measurement, and primary action.
- S21. Given a highlight overlay stored with valid triangle indices, if `AnnotationOverlay` detects any index is out of range for the current mesh, it renders a warning label in the panel row and skips rendering that overlay silently.

---

## Design

### Database

A new `annotations` table added inside the existing `initDb` block in `storageSqlite.ts`, after `candidate_revisions`:

```sql
CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  points_json TEXT NOT NULL,   -- JSON: [[x,y,z], ...]  RAS mm
  meta_json   TEXT NOT NULL,   -- type-specific extras
  locked      INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (revision_id) REFERENCES candidate_revisions(id) ON DELETE CASCADE
);
```

`meta_json` per type:
- `text_note`: `{ body: string }`
- `highlight`: `{ color: 'accent'|'amber'|'rose'|'emerald', triangleIndices: number[] }`
- `roi`: `{ min: [x,y,z], max: [x,y,z] }`
- `plane`: `{ method: 'point-normal'|'three-point', sliceDockActive: boolean }`
- all others: `{}`

Measurement values are **not stored** — always computed from `points_json` at render time.

### Domain types — `app/src/domain/types.ts`

```ts
export type AnnotationType =
  | 'landmark' | 'line' | 'closed_curve' | 'text_note'
  | 'angle' | 'plane' | 'open_curve' | 'roi' | 'highlight'

export type RasPoint = [number, number, number]

export type Annotation = {
  id: string
  revisionId: string
  type: AnnotationType
  name: string
  points: RasPoint[]
  meta: Record<string, unknown>
  locked: boolean
  visible: boolean
  createdAt: string
}
```

`EditorState` gains `annotations: Annotation[]`. Initialised as `[]` in every construction site: `createProject`, `seedEmptyProject`, `setStoreFromManifest` (App.tsx), and `loadProjectPackage`.

### Persistence — `ProjectManifest` and file package

`ProjectManifest` gains `annotations?: Annotation[]`. `saveProjectPackage` writes them into `manifest.json` alongside cases/samples/candidates/revisions. `loadProjectPackage` reads them back; a missing field defaults to `[]` (backward compatibility with pre-feature projects).

### Express API — `app/server/api.ts` and `app/server/storageSqlite.ts`

New storage functions in `storageSqlite.ts`:
- `listAnnotations(revisionId)` — `SELECT` by `revision_id`.
- `createAnnotation(fields)` — `INSERT`.
- `updateAnnotation(id, partial)` — `UPDATE` name, points, meta, locked, visible.
- `deleteAnnotation(id)` — `DELETE`.

`getProjectManifest` / `projectManifest` joins annotations into the response so the single project-open fetch includes them.

New routes in `api.ts`:
- `GET  /api/revisions/:revisionId/annotations` → `listAnnotations`
- `POST /api/revisions/:revisionId/annotations` → `createAnnotation`
- `PATCH  /api/annotations/:id` → `updateAnnotation`
- `DELETE /api/annotations/:id` → `deleteAnnotation`

### API client — `app/src/api/client.ts`

New typed methods added for all four annotation routes above, following the existing `request<T>()` pattern.

### Ops layer — `app/src/ops/session.ts` and `app/src/ops/index.ts`

New in-memory ops:

| Op | Args | Returns | Write boundary |
|---|---|---|---|
| `addAnnotation` | `{ type, name, points, meta, revisionId }` | `OpResult<Annotation>` | EditorState only |
| `updateAnnotationPoints` | `{ id, points }` | `OpResult<Annotation>` | EditorState only |
| `updateAnnotationMeta` | `{ id, meta }` | `OpResult<Annotation>` | EditorState only |
| `renameAnnotation` | `{ id, name }` | `OpResult<Annotation>` | EditorState only |
| `setAnnotationLocked` | `{ id, locked }` | `OpResult<Annotation>` | EditorState only |
| `setAnnotationVisible` | `{ id, visible }` | `OpResult<Annotation>` | EditorState only |
| `deleteAnnotation` | `{ id }` | `OpResult` | EditorState only |

Each validates: revision exists in state, annotation belongs to a candidate (not source anatomy), coordinate finiteness, type-specific point-count constraints. The `App.tsx` caller is responsible for the subsequent `apiClient` call and `loadProject` reload — identical to how `transformCandidate` and `restoreRevision` work today.

### App.tsx integration

`App.tsx` gains annotation-specific handlers following the same `try/setPendingAction/apiClient/loadProject/refresh` pattern used for transform and restore today:

- `handleAddAnnotation` — calls `addAnnotation` op → `apiClient.createAnnotation` → `loadProject`.
- `handleUpdateAnnotation` — calls update op → `apiClient.updateAnnotation` → `loadProject`.
- `handleDeleteAnnotation` — calls `deleteAnnotation` op → `apiClient.deleteAnnotation` → `loadProject`.

`state.annotations` (from EditorState, filtered to the active revision ID) is passed into `CanvasWorkspace` and from there to `Inspector` (annotation panel) and `Viewport` (`AnnotationOverlay`).

### Viewport overlay — `app/src/viewport/AnnotationOverlay.tsx`

`Viewport.tsx` already accepts a `children` prop or similar extension point (or gains one). `AnnotationOverlay` is a React component that:
- Receives `annotations: Annotation[]` and a ref to the Three.js `scene` (or uses a React context already established by `Viewport`).
- On mount and on annotation array change, adds/updates/removes Three.js objects: `Mesh` for glyphs (sphere `SphereGeometry`), `Line2` for line segments and curve polylines, `Sprite` for labels.
- Cleans up all added objects on unmount.
- For surface highlights: creates a `THREE.Mesh` from a filtered copy of the display mesh's index buffer with `MeshBasicMaterial({ transparent: true, opacity: 0.4 })`. Requires the display mesh to be passed as a prop or accessed via context.

### Measurement math — `app/src/geometry/annotationMeasure.ts`

Pure functions, no side effects, fully testable without a DOM:
- `landmarkCoord(p: RasPoint): string` — formats to 2 dp.
- `lineDistance(a: RasPoint, b: RasPoint): number` — Euclidean norm.
- `closedCurveLength(pts: RasPoint[]): number` — sum including closing edge.
- `openCurveLength(pts: RasPoint[]): number` — sum excluding closing edge.
- `angleDegrees(a: RasPoint, b: RasPoint, c: RasPoint): number` — ∠ABC.
- `planeArea(pts: RasPoint[], boundingBoxMm: number[]): number` — intersection area.
- `roiVolume(min: RasPoint, max: RasPoint): number` — product of edge lengths.

---

## Where it lives

| Concern | File(s) |
|---|---|
| Domain types | `app/src/domain/types.ts` — Annotation, AnnotationType, RasPoint; EditorState.annotations |
| State construction | `app/src/state/store.ts`, `app/src/ops/session.ts` (createProject, seedEmptyProject), `app/src/App.tsx` (setStoreFromManifest), `app/src/io/projectPackage.ts` (loadProjectPackage) |
| File-based persistence | `app/src/io/projectPackage.ts` — ProjectManifest.annotations, saveProjectPackage, loadProjectPackage |
| Ops | `app/src/ops/session.ts`, `app/src/ops/index.ts` |
| Storage | `app/server/storageSqlite.ts` — annotations table, listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation; projectManifest joined query |
| API routes | `app/server/api.ts` |
| API client | `app/src/api/client.ts` |
| App orchestration | `app/src/App.tsx` — annotation handlers, state passing |
| Placement UX | `app/src/ui/CanvasWorkspace.tsx` — activeAnnotationType prop, ContextStrip type selector, in-progress placement local state |
| Annotation panel | `app/src/ui/Inspector.tsx`, `app/src/ui/AnnotationList.tsx`, `app/src/ui/annotationActions.ts` |
| Viewport overlay | `app/src/viewport/AnnotationOverlay.ts` (builders + `syncAnnotationObjects`) |
| Measurement math | `app/src/geometry/annotationMeasure.ts` |
| Unit tests | `app/tests/annotationMeasure.test.ts`, `app/tests/annotationOps.test.ts`, `app/tests/annotationStorage.test.ts`, `app/tests/annotationOverlay.test.ts`, `app/tests/ui/inspector.annotation.test.tsx`, `app/tests/ui/canvasWorkspace.test.tsx` |
| E2E tests | `app/e2e/annotation-phase1.spec.ts`, `app/e2e/annotation-phase2.spec.ts` |

---

## Decisions

- D1. Annotations belong to candidate revisions, not to cases or samples. When a new revision is created, its annotations start empty. This keeps each revision's review record independent. A carry-forward operation can be added later without changing the data model.

- D2. Measurement values are computed at render time, never stored. This eliminates the possibility of stale cached values after a control point is moved.

- D3. Annotations are included in the project manifest (single fetch on project open), not fetched separately per revision. This matches how every other domain record is loaded today and avoids a secondary fetch on every revision switch or restore.

- D4. The ops layer updates only in-memory EditorState; `App.tsx` calls the API and reloads. This is the existing pattern for `transformCandidate` and `restoreRevision`. Keeping annotation ops consistent with that pattern avoids introducing a second persistence architecture.

- D5. `sourceAnatomy.spatial` of the owning sample is the single coordinate authority for all annotation RAS points on that revision. This matches the crosshair. When multiple NRRD volumes exist for a sample (defective, complete, implant), only the volume whose affine is stored in `sourceAnatomy.spatial` is authoritative; the app currently stores the defective skull's spatial metadata there.

- D6. Linear interpolation for curves in both phases. Length measurements are unambiguous under linear interpolation. Smooth splines can be added later without changing the stored point representation.

- D7. `meta_json` absorbs all type-specific extras rather than separate columns per annotation type. The types are fixed and few; the JSON is validated in the ops layer.

- D8. Four fixed highlight colors from `DESIGN.md`-compatible equivalents. Arbitrary color input would violate the design system's constraint of Base → Ink → Accent; Signal for danger only.

- D9. In-progress multi-point placement state lives in local component state inside `CanvasWorkspace`, not in `EditorState`. It is discarded on Escape or mode change with no API calls or database writes.

- D10. `AnnotationOverlay` is mounted inside `Viewport` with the Three.js scene ref passed through. This keeps all Three.js object lifecycle in one place and avoids a second canvas or scene.

---

## Flagged concerns

- **Carry-forward on revision create:** annotations do not automatically carry to a new revision. This is correct for review integrity but may feel awkward in an iterative workflow. Recorded in D1; deferred.

- **Highlight triangle index stability:** indices are stable only as long as the display mesh for a revision does not change. R64 and S21 define the graceful degradation behavior.

- **Coordinate authority with multi-volume samples:** the SkullBreak samples ship three NRRD files. Only `defective_skull.nrrd`'s spatial metadata is currently stored in `sourceAnatomy.spatial`. Annotations placed while that volume is active will have correct coordinates relative to it. If the app ever allows switching the base volume (e.g. showing `complete_skull.nrrd` as the anatomy), annotations placed under a different affine would be spatially inconsistent. R3 defines the authority; a future multi-volume feature must resolve this explicitly.

- **`projectManifest` query cost:** joining annotations into the manifest response adds a query per project open. For the demo scale (tens of annotations) this is negligible. At scale, pagination or lazy loading would be warranted.

- **`AnnotationOverlay` and display mesh prop threading:** `AnnotationOverlay` needs both the annotations array and the loaded display mesh (for highlight overlay). `App.tsx` currently holds the mesh in a `useState<Object3D | null>`. The mesh must be passed through `CanvasWorkspace` → `Viewport` → `AnnotationOverlay`. The plan step must trace this prop path explicitly.

---

## Out of scope

- Voxel-level segmentation (Segment Editor semantics). Surface highlight here is display-only.
- Raw CT windowing, bone extraction from unsegmented scans.
- Review result records as formal clinical documents or sign-off workflows.
- Real-time collaborative annotation.
- DICOM SR or AIM XML export.
- Implant generation using annotations as constraints (the ROI serialization enables this later but does not build the generation pipeline).
- Richer geometry editing (planar trim, boolean, sculpt).
- Undo/redo stack for annotation operations.
- Smooth spline interpolation for curves.
- Carry-annotations-forward when creating a new revision.
- Switching the coordinate authority between multiple volumes within a single sample.
