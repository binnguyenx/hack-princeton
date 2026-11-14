# Canvas mechanics reference

Manual-test and future **canvas control API** catalog for the Cross-reference Workbench.

Audience: engineers and testers without radiology training. Each row uses the product/medical term, then a plain explanation of what the computer is doing.

**Scope of this doc:** current UI behavior, partial wiring and missing capabilities, reconciled with source on 2026-11-14 and updated after Select/Visibility and Save/Open Package implementation. [Implementation status](#implementation-status-source-reconciled-2026-11-14) distinguishes working actions from handlers/placeholders. The spec remains the target contract; the historical plan is not proof that every target shipped. See [Not implemented yet](#not-implemented-yet) for gaps.

Related docs: [intent](intent.md) · [spec](spec.md) · [ui-journeys](ui-journeys.md) · [plan](plan.md)

---

## Hover help (`FeatureHint`)

Many Cross-reference Workbench view controls use the reusable `FeatureHint` component (`app/src/ui/FeatureHint.tsx`). Hover (or focus) a control to see:

- **Label** — feature name
- **Description** — what it does in plain language
- **Shortcut chip** — when a gesture exists
- **Amber reason** — when the control is unavailable

View-control hint copy lives in `app/src/ui/canvasFeatureHints.ts`. Numeric rigid-placement fields have direct labels rather than this hint wrapper. A visible hint or shortcut is not proof that the described capability is implemented; the gaps below take precedence for status.

## How to open the workbench

1. Install the backend into the repository `.venv`, start FastAPI with an explicit storage root, then run `cd app && npm run dev`; see [setup](../../../docs/ai/setup.md). Vite proxies `/api` to FastAPI (default8000). Preview is frontend-only.
2. Open a project → open a case with sample data, or use **Open 3D** / navigate to **3D Studio Canvas**.
3. You should see: large **3D** panel on top, **Cross-reference slices** dock (Axial / Sagittal / Coronal) below, mode buttons on the left, RAS numbers in the footer.

Without a volume identity, slice panels are omitted and Window/Level is disabled. The current enablement check uses the source volume ID, not successful voxel decoding; a failed/pending volume load can still leave the mode enabled with unavailable slices. Mesh-only documents still get the3D view.

---

## Implementation status (source-reconciled 2026-11-14)

- **Wired UI actions:** orbit/pan/zoom/roll, Center/Reset, six view directions, projection, display lighting/crosshair, Spin/Rock, linked axis-aligned slices and offsets, basic Window/Level, one-shot slice Place, collapse/maximize and WebGL Rebuild. Some controls remain simplified compared with Slicer: see the caveats below.
- **Real candidate edit:** numeric rigid placement with preview → Apply/new revision → backend hydration, Cancel/Escape and revision Restore. It keeps source bytes unchanged. This is positioning an existing candidate, not generating repair geometry; see [candidate construction](#candidate-construction-numeric-rigid-placement).
- **Select/Visibility implemented:** object-level raycast picking and a bounding outline; actual hide/show via toolbar/H/menu, hidden-object recovery and Show All. Face/region selection, multi-object assembly and persisted view settings remain outside this slice.
- **Portable package implemented:** Save/menu/Ctrl-Cmd+S download a versioned ZIP; Open Package validates and imports a new project copy with history, hashes and remapped view context. Draft/pending actions block packaging. Redo and several advertised shortcut/domain-mutation automation paths remain incomplete.
- **Not supplied by this UI:** real reconstruction, voxel sculpting/booleans, physical measurements, defect/rim/deviation analysis, or an agent mutation facade. The read-only fake-model chat client/HTTP route exists separately; a chat widget is deferred.

The detailed current gap report is [canvas-workspace/spec.md](../canvas-workspace/spec.md#current-implementation-status-gap-report). The earlier source-only review is followed by the scoped Select/Visibility implementation and tests recorded in [its plan](../canvas-workspace/plans/select-visibility.md). Other incomplete spec requirements remain targets.

## Mental model (read this once)

### Two kinds of data

| Data | Technical name | Plain meaning | Mutated by view tools? |
|-|-|-|-|
| Triangle mesh (skull surface) | Display mesh / GLTF `Object3D` | The 3D surface drawn in the big viewport | **No** — camera moves around it |
| Voxel volume (CT-like grid) | NRRD intensity volume (`Uint8Array` + sizes) | A 3D array of brightness samples | **No** — slices only *read* intensities |
| Candidate drafts / revisions | Domain state | Editable repair candidates | **Only** Apply/Cancel/Restore — not by pan/zoom/slice |

View tools move the **camera**, the **crosshair** (a shared 3D cursor), or **display settings** (brightness mapping, projection). They must not rewrite mesh vertices or volume bytes.

### Coordinate systems

| System | Short | What the numbers mean |
|-|-|-|
| **IJK** | Image index | Integer grid index into the voxel array: `i` along first axis, `j` second, `k` third. Like `(column, row, slice)` in a 3D spreadsheet. |
| **RAS** | Right–Anterior–Superior | The coordinate helper’s patient-space readout: **R** = patient right, **A** = front, **S** = head. It is not proof that every derived mesh is registered to these patient axes. |
| **LPS** | Left–Posterior–Superior | Common file-space convention. The coordinate helper converts LPS to RAS (`L→−R`, `P→−A`) when computing readouts; this does not rewrite source voxel bytes. |
| **Camera** | Three.js eye | Where the virtual camera sits and what it looks at. Independent of anatomy bytes. |

Candidate numeric placement uses **editor-world** axes. Do not equate its X/Y/Z inputs with a validated patient RAS transform. Slice extraction is axis-aligned in IJK; oblique reformat and complete renderer/patient-coordinate parity remain gaps.

**Crosshair** = one shared point stored as IJK and shown as RAS in the status strip. Moving it in any slice updates all three planes and the footer numbers.

### Linked views

The three slice panels are **linked**: they share one crosshair. Changing Axial’s offset changes the shared `k` index; Sagittal and Coronal redraw so their planes still cut through that same point. Think of three flashlights slicing one loaf of bread at the same crumb.

---

## Layout map (what each chrome region is)

| Region | DOM / component | Job |
|-|-|-|
| Context strip | `canvas-context-strip` | Shows active mode + hints; hosts Tilt lock / Spin / Rock / Rebuild / Apply |
| Mode rail | `canvas-mode-rail` | Switches pointer behavior: View, Window/Level, Place |
| 3D ViewFrame | `ViewFrame` label `3D view` | Hosts WebGL mesh viewport + ViewController buttons |
| Slice dock | `SliceDock` | Three linked 2D canvases + collapse |
| Inspector drawer | explicit selection or active-candidate fallback | Candidate/revision and numeric-placement panel; not proof of mesh picking |
| Status strip | `canvas-workbench-status` | RAS readout + mode/message |

---

## Interaction modes

Modes change what a pointer does. They do **not** change which anatomy is loaded.

### View mode (`view`)

- **UI:** Mode button **View** (`aria-label`: `View mode`).
- **Meaning:** Navigate and inspect. Default mode.
- **What happens:** 3D mouse gestures drive OrbitControls; slice clicks move the crosshair.
- **Does not:** Edit mesh, create candidates, or change voxel values.
- **Runtime:** `readCanvas().mode === 'view'`.

### Window / Level mode (`window-level`)

- **UI:** **Window / Level** (`Window / Level mode`). Disabled with reason **Requires volume intensity data** when no volume.
- **Technical:** Remap voxel intensities through a linear **window** before painting the 2D slice canvas.
  - **Window center (level)** ≈ brightness midpoint.
  - **Window width** ≈ contrast range.
- **What happens on drag (slice canvas):** horizontal delta adjusts center; vertical delta adjusts width (`max(1, …)`). All three slices re-render with the new mapping.
- **Does not:** Change the underlying `Uint8Array` voxels — only the display transfer function.
- **Note:** Context hint mentions “Ctrl-drag samples a region”; that region auto-window is **not implemented yet**.
- **Prerequisite gap:** enablement uses volume identity; it is not a complete decoded-intensity readiness check.
- **Runtime:** mode `window-level`; no dedicated window fields on `readCanvas()` today (observe slice pixels / UI state).

### Place mode (`place`)

- **UI:** **Place** (`Place mode`).
- **Current behavior (one-shot):** Click a slice → set crosshair to that IJK → status message `Point placed at IJK …` → mode returns to **View**. Anatomy unchanged.
- **Does not (yet):** Persist a landmark entity or candidate. Treat as “pick a patient-space index and announce it.”
- **Runtime:** briefly `place`, then back to `view`; `crosshairRas` updates.

---

## 3D viewport mechanics

Implementation: `app/src/viewport/Viewport.tsx` + Slicer mouse map in `navigationPolicy.ts`.

### Mouse navigation (View mode, over the 3D canvas)

| Input | Technical effect | Plain language |
|-|-|-|
| **LMB drag** | Orbit `ROTATE` | Spin the camera around the look-at target (turntable around the model). |
| **MMB drag** | Orbit `PAN` | Slide the camera sideways/up so the model appears to shift in the frame. |
| **RMB vertical drag** | Orbit `DOLLY` | Move camera closer/farther (zoom). |
| **Ctrl/Cmd + LMB drag** | Custom **roll** | Rotate the camera’s “up” vector around the view direction (twist the horizon). |
| **Shift + LMB drag** | OrbitControls modifier switches rotation to pan | Supported by the installed controls; primary pan remains MMB. Full alternative-input parity is not implemented. |

Camera navigation does not select model faces or regions. After a gesture ends, runtime publishes `lastAction.id = 'view.navigate'` and camera `position` / `target` update. Domain mesh matrices must stay identical.

### ViewController buttons (top of 3D frame)

| Control | `aria-label` | What happens | `lastAction` id |
|-|-|-|-|
| Center | `Center 3D view` | Reframe camera distance to content **without** resetting orientation | `view.center` |
| Reset | `Reset 3D view` | Reframe **and** reset orientation (default up / framing) | `view.reset` |
| A | `Anterior view` | Camera on +Y looking at target (front of patient) | `view.anterior` |
| P | `Posterior view` | Camera on −Y (back of head) | `view.posterior` |
| L | `Left view` | Camera on −X | `view.left` |
| R | `Right view` | Camera on +X | `view.right` |
| S | `Superior view` | Camera on +Z (top-down); up axis adjusted | `view.superior` |
| I | `Inferior view` | Camera on −Z (from feet); up axis adjusted | `view.inferior` |
| Box icon | `Orthographic projection` / `Perspective projection` | Toggle camera type; copies pose between cameras | `view.projection-orthographic` or `view.projection-perspective` |
| Crosshair icon | `Show crosshair` / `Hide crosshair` | Toggles a **screen-centered** overlay in the 3D panel (UI helper; not the RAS crosshair alone) | (visibility flag; slice crosshair is separate) |
| Eye | `Hide active object` / `Show active object` | Toggle active canonical object visibility without a revision; hidden state has a Show object recovery action | `view.presentation` |
| Eye + All | `Show all objects` | Restore known objects across tabs in this session | `view.presentation` when active presentation changes |
| Sun + slider | `Scene lighting` | Scales scene lights + exposure (display only). Sample GLBs with `metalness: 1` are remapped for this viewport (no IBL), otherwise they stay near-black even at max slider | `view.lighting` |

The six anatomically named buttons are camera presets in renderer axes; their labels alone do not prove patient registration.

**Perspective** = things farther look smaller (natural depth). **Orthographic** = parallel rays (good for comparing sizes without foreshortening). Orthographic also shows a static **scale** marker. It has no calibrated numeric mm length; it is not a usable physical ruler. Projection switching copies camera pose, but equivalent visible framing across camera types is not established by current tests.

### Context-strip 3D helpers

| Control | What happens | Notes |
|-|-|-|
| **Tilt lock** | Resets camera `up` to `(0,0,1)` (editor-world +Z) and publishes `view.tilt-lock` | Reduces “barrel roll” feel while orbiting; not a full Slicer elevation lock yet |
| **Spin** | Continuous yaw around Z while motion allowed | Honors `prefers-reduced-motion` |
| **Rock** | Oscillating small yaw | Same reduced-motion respect |
| **Rebuild view** | Increments `rendererNonce` → tear down + recreate WebGL renderer | Shown when context status ≠ `ready` |

### Overlays inside the 3D frame

| Overlay | Meaning |
|-|-|-|
| RAS marker (`R` `A` `S`) | Reminder of patient axes; not a live compass needle yet |
| Screen crosshair (when enabled) | Fixed center lines on the 3D canvas |
| `Rendering interrupted` | WebGL context lost — use **Rebuild view** |
| Status text | Transient viewport message (e.g. loading) |

---

## Candidate construction: numeric rigid placement

This is separate from the **Place** pointer mode above, which only moves a slice crosshair.

1. Open a candidate from case management. Source samples remain read-only. Numeric construction requires verified millimetre metadata and a valid current rigid pose.
2. Use **Object → Transform Tool** or **T**. The inspector shows Translate X/Y/Z (mm) and Rotate X/Y/Z (degrees), initially zero deltas from the captured current revision.
3. Edit the fields to preview the full rotation/translation on a cloned display object. Source NRRD, stored revisions and camera stay unchanged. Rotation is extrinsic X→Y→Z about the current candidate origin; translation is added to its current translation. Axes are editor-world, not certified patient RAS axes. No mouse transform gizmo is provided.
4. **Apply** submits project/case/expected revision and rigid pose through `apiClient.placeCandidate` → POST `/api/candidates/{id}/placement` → `PlacementService`. The repository validates membership and current pointer in the same transaction, appends one pose revision, and advances current. It reuses the volume/hash. The UI reloads backend truth.
5. **Cancel / Escape**, changing tools, or leaving/changing documents removes the displayed preview. Invalid or unchanged drafts cannot Apply. A failed HTTP request reports an error and keeps the draft; no local success is claimed. An accepted backend write is not cancellable by abandoning the preview.
6. **Restore** in the menu or revision inspector reactivates an existing revision and renders its saved full pose. It does not delete later revisions. Cancel/apply an active draft first. The current menu Undo / Ctrl/Cmd+Z uses pointer restore; Redo is not implemented.

The strict placement route rejects malformed/non-rigid/no-change input422, missing candidate404 and ownership/stale conflicts409. It does not add persistent request idempotency, rewrite source anatomy, alter voxels, generate an implant or enable AI writes. The older `/transform` route keeps its migration compatibility behavior.

### Object Select and Visibility

- Use **Object → Select Tool / V** to select the whole object currently rendered. The pointer remains in View mode: click visible mesh → canonical source/candidate selection; click background or Escape → clear. A blue bounding outline shows the selected object without modifying its material. Orbit/pan/zoom/roll and modified or dragged pointer gestures do not pick. Hidden/unloaded/stale meshes are not selectable. Face/region picking is not implemented.
- Sample document ids and source object ids differ. Selection, highlights and view.visibility use sourceAnatomy.objectId for samples and candidate.objectId for candidates. Tabs remain document ids. Changing active document clears stale selection; the inspector distinguishes Document ID from Selected object; a candidate inspector may remain for active-document context with Selected object=None after clearing the outline.
- Toolbar **Hide active object / Show active object**, **H**, and menu **Toggle Visibility** change the actual3D root. Hiding clears selection/outline. **Object hidden → Show object** and **Show all objects** recover without needing a selected mesh. Show All restores known objects across tabs in this session; only the active document is rendered at a time. Hidden3D anatomy does not suppress its2D reference slices.
- These actions update transient view state only: no HTTP mutation, revision, pose, source bytes or dirty edit flag changes. Visibility survives tab changes and renderer rebuild but is not persisted by the API; full reload/hydration may reset it. View refresh no longer rebuilds geometry. A separate outline resource is disposed on change/rebuild.
- `debug.ops.selectObject`, `setVisibility` and `showAllObjects` use the same validated view ops and notify the live UI. Unknown/hidden selection is rejected. This does not make legacy debug transform/restore an equivalent durable backend API.

### Package, shortcut and remaining selection gaps

- **Save / Open Package:** Save/menu/Ctrl-Cmd+S download ZIP v1 containing the authoritative manifest and every referenced NRRD. Open Package imports a new copy, remaps every identity, preserves revision history/current Restore pointer and hydrates backend truth. Validated camera, selection, visibility and open-document settings restore from the package. Existing projects stay intact; drafts must be applied or cancelled first. Limits:64 MiB ZIP,256 MiB expanded,512 entries,4 MiB JSON. See [package plan](../canvas-workspace/plans/save-open-package.md). Legacy Node directory IO is separate.
- **Shortcuts:** the registry advertises Ctrl/Cmd+Backspace for Restore, but `App.tsx` has no handler for it. Ctrl/Cmd+Shift+Z reaches the Ctrl/Cmd+Z restore branch, not Redo. Plain Enter applies only outside text inputs; numeric fields suppress it. Menu, command search and supported key handlers share `runCommand`, not a complete universal control API.
- **Legacy chrome:** a dedicated `WorkspaceNavigator` is not mounted in the workbench. Management navigation and document tabs exist; the active canvas uses `CanvasWorkspace`/`ViewController`, not the old floating `ToolRail`/`OptionsBar`.


---

## Slice dock mechanics

Implementation: `SliceDock.tsx` + `SliceViewport.tsx` + `geometry/slices.ts`.

### Dock chrome

| Control | Effect |
|-|-|-|
| **Collapse / Expand** | Hides or shows the three slice frames; link state remains conceptually “Linked” |
| **Linked** badge | Documents that all planes share one crosshair (no unlink UI yet) |
| Per-plane **Maximize / Restore** | Expands one plane (or 3D) via ViewFrame; other planes hide until restore |

### The three planes

| Plane | Cuts along | Offset slider drives | Meta label uses RAS |
|-|-|-|-|
| **Axial** | Horizontal “stack” slices (looking down the superior axis) | IJK `k` | **S** (superior mm) |
| **Sagittal** | Left–right dividing plane | IJK `i` | **R** (right mm) |
| **Coronal** | Front–back dividing plane | IJK `j` | **A** (anterior mm) |

### Per-slice interactions

| Gesture / control | Mode | Effect |
|-|-|-|-|
| Click canvas | `view` or `place` | Recompute IJK under cursor (`slicePointToIjk`); update shared crosshair |
| Click canvas | `place` | Same + place message + return to View |
| Drag canvas | `window-level` | Adjust window center/width (see above) |
| Range input | any | Move only this plane’s index axis; other planes follow via shared crosshair |
| Crosshair lines | display | Horizontal/vertical guides at the projected shared point |

**Rendering pipeline (each paint):** extract 2D intensity plane → map through window → grayscale `ImageData` → 2D canvas. Black/white masks on binary segmentations are expected; CT-like volumes show more gray levels when windowed.

---

## Status strip

| Field | Source | Meaning |
|-|-|-|
| `RAS R … · A … · S … mm` | `ijkToRas(spatial, crosshairIjk)` | Patient-space location of the crosshair |
| Trailing message | mode / pending / errors / place confirmation | Human-readable last note |

---

## Recovery and failure

| Symptom | Cause | Recovery |
|-|-|-|
| Banner **Rendering interrupted** | Browser fired `webglcontextlost` | Click **Rebuild view** (recreates renderer). Auto-restore alone is not trusted. |
| Window/Level disabled | No volume intensities loaded | Open a volume-backed sample |
| Slice dock missing | No volume **or** 3D is maximized alone | Restore layout / load volume |
| Spin/Rock frozen | OS “reduce motion” | Expected; toggle still updates `lastAction` |

---

## Debug / automation surface (today)

Installed on `window.__hackPrincetonDebug` (`app/src/debug/bridge.ts`).

### `readCanvas()` → `CanvasRuntimeSnapshot`

| Field | Meaning for testers / agents |
|-|-|-|
| `activeView` | Type allows all four views, but viewport publication sets `three-d`; slice-focus ownership is not tracked end-to-end |
| `mode` | `view` \| `window-level` \| `place` |
| `camera.position` / `target` | Eye and look-at in world units, synchronized each rendered frame including OrbitControls damping |
| `camera.projection` | `perspective` \| `orthographic` |
| `camera.near` / `far` | Clip planes |
| `visibleObjectIds` | Active rendered canonical object ids; empty when the object is hidden |
| `selectedObjectId` / `highlightedObjectIds` | Canonical selected id and actual outline ids; null/empty when hidden, cleared or unloaded |
| `objectWorldMatrices` | Three.js column-major world matrices, unlike row-major persisted candidate poses; **must not change** on pure view actions |
| `crosshairRas` | Shared crosshair in RAS mm |
| `sliceOffsets` | Per-plane offsets derived for the dock (`axial`/`sagittal`/`coronal`) |
| `pendingOperationCount` | Defaults to0; not connected to App pending placement/restore state, so not reliable as an in-flight counter |
| `webglStatus` | `initializing` \| `ready` \| `lost` \| `error` |
| `lastAction` | Latest published renderer/view event; not a complete exactly-once outcome log for all UI/domain operations |

### Common `lastAction.id` values

| id | When |
|-|-|
| `renderer.ready` | WebGL created |
| `renderer.context-lost` | Context lost (`result: failed`) |
| `renderer.context-restored` | Browser restored context |
| `content.clear` | Mesh removed from scene |
| `content.update` | Same-object display replacement/preview; camera preserved |
| `view.presentation` | Selection outline/visibility applied; domain data unchanged |
| `view.navigate` | Orbit gesture ended |
| `view.roll` | Ctrl/Cmd+LMB roll ended |
| `view.center` / `view.reset` | Center / Reset buttons |
| `view.anterior` … `view.inferior` | Direction presets |
| `view.projection-perspective` / `view.projection-orthographic` | Projection toggle |
| `view.tilt-lock` | Tilt lock engaged path |
| `view.motion-none` / `view.motion-spin` / `view.motion-rock` | Motion toggles |

### `readState()`

Domain store snapshot (projects, samples, candidates, revisions). Use it to check local view actions did **not** mutate anatomy revisions; compare the real HTTP manifest/volume bytes for persistence guarantees.

The exposed selection/visibility/Show All ops now share view validation and notify the UI. Other `ops` remain legacy in-memory session operations: transform/restore writes do not use the live UI PlacementService/HTTP path. They are not an equivalent durable automation or AI API. Camera quaternion, full coordinate affine, slice orientations, truthful active-view ownership and wired pending counts are not fully exposed by this snapshot.

### Browser proof commands

```bash
cd app
npm run build
SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser -- canvas-workflow.spec.ts placement.e2e.ts selectVisibility.e2e.ts packages.e2e.ts
```

These commands use disposable API/storage fixtures. Browser tests cover representative view/recovery actions, numeric placement and actual Select/Visibility on source/candidate meshes, perspective/orthographic picking, drag/modifier rejection, hidden recovery, tab state and renderer rebuild. HTTP manifest/volume checks prove the new view actions do not write data. They do not cover every control/shortcut or every ledger requirement.

Manual console checks after UI actions:

```js
window.__hackPrincetonDebug.readCanvas()
window.__hackPrincetonDebug.readState()
```

---

## Future canvas control API (contract sketch)

When exposing these mechanics to a control agent, prefer **commands that mirror proven actions**, not DOM clicks.

Suggested command groups (not shipped yet):

1. **Mode** — `setMode('view'|'window-level'|'place')`
2. **Camera** — `center`, `reset`, `setPreset(anterior|…)`, `setProjection`, `setPose({position,target})`, `setTiltLock`, `setMotion`
3. **Crosshair** — `setCrosshairIjk` / `setCrosshairRas` (convert via `coordinates.ts`)
4. **Window** — `setWindow({center,width})`
5. **Layout** — `setMaximizedView`, `setSliceDockCollapsed`
6. **Renderer** — `rebuild()`
7. **Place** — `placeAtIjk` / `placeAtRas` (today: set crosshair + message)

Every command should return the same result vocabulary as the spec: `changed` | `unchanged` | `rejected` | `failed`, and leave an updated `readCanvas()` snapshot.

Invariant for agents: after any camera/window/layout command, `objectWorldMatrices` and domain revision ids from `readState()` must match the pre-command values unless the command was explicitly Apply/Restore.

---

## Not implemented yet

The spec ledger remains a target, not a declaration of shipped behavior. Several items were already deferred in `plan.md`; the source review also identifies partial implementations that the old list missed. This report neither drops nor silently accepts new requirements.

- **Selection/visibility remaining:** face/region selection/highlight, multi-object scene assembly and persisted view settings. Whole-active-object picking/highlight and rendered hide/show/recovery are implemented.
- **Construction:** pointer-driven transform gizmos, mesh/voxel shape editing, sculpt/boolean operations, real repair generation and defect-boundary/rim/deviation/thickness analysis. Current numeric rigid placement is positioning only.
- **Measurement/coordinates:** physical measurement tools, calibrated orthographic mm ruler, live camera-reactive anatomical compass/cube and verified alignment of every display path with patient RAS.
- **Slices:** oblique/interactive reformat, independent slice pan/zoom, layers (background/foreground/label), opacity/blending/interpolation controls, Show slices in3D and unlinking synchronized slices.
- **Window/Level and Place:** Ctrl-drag region sampling, automatic-window reset control, complete decoded-volume readiness gating and persistent Place/landmark domain records. Current Place is one-shot crosshair/message only; there is no landmark draft/session model.
- **Input/control facade:** complete Slicer keyboard/keypad and alternative trackpad/touch paths, advertised Restore shortcut, working Redo, durable shared UI/debug domain-mutation parity and a versioned canvas control API. Selection/visibility view ops already share validation and UI notification. Raw OrbitControls gestures are not full parity.
- **Display:** depth peeling, configurable ambient shadows, FPS diagnostics, stereo capability UI; a one-time up-vector reset is not a continuously enforced tilt lock. Center currently recomputes both target and framing distance rather than preserving zoom. Equivalent projection framing and complete failure rollback are not established.
- **Persistence remaining:** automatic durable view preferences, package overwrite/merge, legacy-directory ZIP compatibility, automatic orphan reconciliation after abrupt process failure, and packages beyond the documented limits. Portable Save/Open Package is implemented; SQLite/files remain the primary store.
- **Observability/proof:** accurate active-view ownership and pending counts, camera quaternion/full affine/slice-orientation fields, deterministic operation outcomes, comprehensive per-control real-browser/repeat/forced-failure proof and randomized stress coverage.
- **Agent integration:** live mechanical mutation tools and a chat widget. The typed chat transport is read-only/fake-model; reconstruction mock is sandbox-only and is not live generated geometry.

---

## File map (implementation)

| Concern | Path |
|-|-|
| Shell / modes / layout | `app/src/ui/CanvasWorkspace.tsx` |
| Slice dock | `app/src/ui/SliceDock.tsx` |
| Slice paint + input | `app/src/ui/SliceViewport.tsx` |
| 3D controls chrome | `app/src/ui/ViewController.tsx` |
| Maximize chrome | `app/src/ui/ViewFrame.tsx` |
| WebGL viewport | `app/src/viewport/Viewport.tsx` |
| Object hit/gesture policy | `app/src/viewport/objectInteraction.ts` |
| Mouse button policy | `app/src/viewport/navigationPolicy.ts` |
| IJK ↔ RAS | `app/src/geometry/coordinates.ts` |
| Slice extract | `app/src/geometry/slices.ts` |
| Wiring / status / rebuild | `app/src/App.tsx` |
| Debug snapshot / legacy session ops | `app/src/debug/bridge.ts`, `app/src/ops/session.ts` |
| Numeric construction controls / math | `app/src/ui/RigidPlacementControls.tsx`, `app/src/geometry/rigidPlacement.ts`, `app/src/geometry/pose.ts` |
| Manual placement API/service/storage | `backend/ai/src/skullfix_ai/api/routes/placement.py`, `backend/ai/src/skullfix_ai/application/placement.py`, `backend/ai/src/skullfix_ai/application/sqlite.py` |
| Existing browser proof | `app/e2e/canvas-workflow.spec.ts`, `app/e2e/placement.e2e.ts`, `app/e2e/migration.e2e.ts`, `app/e2e/selectVisibility.e2e.ts`, `app/e2e/packages.e2e.ts` |
| Source reconciliation record | `features/3d-bone-editor/canvas-workspace/preflights/mechanics-gap-review.md` |
