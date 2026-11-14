# Canvas mechanics reference

Manual-test and future **canvas control API** catalog for the Cross-reference Workbench.

Audience: engineers and testers without radiology training. Each row uses the product/medical term, then a plain explanation of what the computer is doing.

**Scope of this doc:** behaviors that are **actually wired in the current UI**. Spec items that are accepted but not shipped yet live under [Not implemented yet](#not-implemented-yet).

Related docs: [intent](intent.md) · [spec](spec.md) · [ui-journeys](ui-journeys.md) · [plan](plan.md)

---

## Hover help (`FeatureHint`)

Every Cross-reference Workbench control uses the reusable `FeatureHint` component (`app/src/ui/FeatureHint.tsx`). Hover (or focus) a control to see:

- **Label** — feature name
- **Description** — what it does in plain language
- **Shortcut chip** — when a gesture exists
- **Amber reason** — when the control is unavailable

Copy lives in `app/src/ui/canvasFeatureHints.ts` so demos and the future canvas API stay aligned with the same wording.

## How to open the workbench

1. Run `cd app && npm run dev`.
2. Open a project → open a case with sample data, or use **Open 3D** / navigate to **3D Studio Canvas**.
3. You should see: large **3D** panel on top, **Cross-reference slices** dock (Axial / Sagittal / Coronal) below, mode buttons on the left, RAS numbers in the footer.

Without a **volume** (the 3D voxel grid from NRRD), slice panels and Window/Level stay unavailable. Mesh-only documents still get the 3D view.

---

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
| **RAS** | Right–Anterior–Superior | Patient-space millimetres. **R** = toward patient right, **A** = toward patient front (face), **S** = toward patient head. This is the app’s patient/world truth. |
| **LPS** | Left–Posterior–Superior | Common file-space convention. Converted to RAS on import when needed (`L→−R`, `P→−A`). |
| **Camera** | Three.js eye | Where the virtual camera sits and what it looks at. Independent of anatomy bytes. |

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
| Inspector drawer | only when an object is selected | Candidate/revision side panel (domain, not camera) |
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
| **Shift + LMB** | Policy hint maps to pan | Hint string exposes it; primary pan remains MMB. |

After a gesture ends, runtime publishes `lastAction.id = 'view.navigate'` and camera `position` / `target` update. Domain mesh matrices must stay identical.

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
| Sun + slider | `Scene lighting` | Scales scene lights + exposure (display only). Sample GLBs with `metalness: 1` are remapped for this viewport (no IBL), otherwise they stay near-black even at max slider | `view.lighting` |

**Perspective** = things farther look smaller (natural depth). **Orthographic** = parallel rays (good for comparing sizes without foreshortening). Orthographic also shows a simple **scale** marker.

### Context-strip 3D helpers

| Control | What happens | Notes |
|-|-|-|
| **Tilt lock** | Forces camera `up` to `(0,0,1)` (world superior) and publishes `view.tilt-lock` | Reduces “barrel roll” feel while orbiting; not a full Slicer elevation lock yet |
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

## Slice dock mechanics

Implementation: `SliceDock.tsx` + `SliceViewport.tsx` + `geometry/slices.ts`.

### Dock chrome

| Control | Effect |
|-|-|-|
| **Collapse / Expand** | Hides or shows the three slice frames; link state remains conceptually “Linked” |
| **Linked** badge | Status label (not clickable): all planes share one crosshair. Hover explains this; unlink UI is not available yet |
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
| `activeView` | Which view is considered active (`three-d` \| `axial` \| `sagittal` \| `coronal`) |
| `mode` | `view` \| `window-level` \| `place` |
| `camera.position` / `target` | Eye and look-at in world units |
| `camera.projection` | `perspective` \| `orthographic` |
| `camera.near` / `far` | Clip planes |
| `visibleObjectIds` | Mesh object ids currently in the scene group |
| `objectWorldMatrices` | Per-object 4×4 transforms — **must not change** on pure view actions |
| `crosshairRas` | Shared crosshair in RAS mm |
| `sliceOffsets` | Per-plane offsets derived for the dock (`axial`/`sagittal`/`coronal`) |
| `pendingOperationCount` | In-flight domain ops |
| `webglStatus` | `initializing` \| `ready` \| `lost` \| `error` |
| `lastAction` | `{ id, result }` for the latest published canvas action |

### Common `lastAction.id` values

| id | When |
|-|-|
| `renderer.ready` | WebGL created |
| `renderer.context-lost` | Context lost (`result: failed`) |
| `renderer.context-restored` | Browser restored context |
| `content.clear` | Mesh removed from scene |
| `view.navigate` | Orbit gesture ended |
| `view.roll` | Ctrl/Cmd+LMB roll ended |
| `view.center` / `view.reset` | Center / Reset buttons |
| `view.anterior` … `view.inferior` | Direction presets |
| `view.projection-perspective` / `view.projection-orthographic` | Projection toggle |
| `view.tilt-lock` | Tilt lock engaged path |
| `view.motion-none` / `view.motion-spin` / `view.motion-rock` | Motion toggles |

### `readState()`

Domain store snapshot (projects, samples, candidates, revisions). Use it to prove view tools did **not** mutate anatomy revisions.

### Browser proof commands

```bash
cd app
npx playwright test e2e/canvas-workflow.spec.ts
```

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

Do not test these as if they exist; they are accepted ledger items deferred in `plan.md` Deviations:

- Oblique / interactive reformat of slice planes
- Slice layer stack (background / foreground / label) and blending
- Show slices in 3D
- Full Slicer keyboard / keypad matrix
- Trackpad / touch substitution paths beyond basic pointer
- Depth peeling, ambient shadows, FPS overlay
- Stereo modes
- Window/Level **region sample** (Ctrl-drag)
- Persistent Place landmarks as domain records
- Unlinking synchronized slices

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
| Mouse button policy | `app/src/viewport/navigationPolicy.ts` |
| IJK ↔ RAS | `app/src/geometry/coordinates.ts` |
| Slice extract | `app/src/geometry/slices.ts` |
| Wiring / status / rebuild | `app/src/App.tsx` |
| Debug snapshot | `app/src/debug/bridge.ts` |
| E2E proofs | `app/e2e/canvas-workflow.spec.ts` |
