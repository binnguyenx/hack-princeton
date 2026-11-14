# UI journeys: Slicer-standard canvas

Spec: [spec.md](spec.md) · Status: accepted · Last updated: 2026-11-14

## Job and audience

Biomedical engineers and surgeons arrive with a patient volume or candidate open and need to inspect spatial relationships without wondering whether a gesture moved the camera, changed a slice, or edited anatomy. This is an Operate surface. Familiar placement, explicit state, and recoverability outrank visual novelty.

## Outcome and proof

The user can move between 3D inspection, synchronized slices, window/level, and placement without losing the model or confusing view changes with edits. Every control names its target and gives visible evidence of its effect. Success is proven by camera, scene, coordinate, domain, and rendered-output state—not by a click event.

## Selected direction

Use a **Cross-reference Workbench**:

- A dominant 3D view is the default.
- A compact synchronized Axial/Sagittal/Coronal dock stays visible below it when volume data exists and can collapse to one labelled row.
- A persistent left rail contains interaction modes only.
- A contextual strip above the active view contains options for the active mode or view.
- Object details appear in a right inspector only when an object is selected or an operation needs review.
- Compact RAS coordinates remain in the bottom status strip; LPS and IJK expand on demand.

The signature interaction is cross-reference continuity: moving the crosshair in any view updates the three slice previews and coordinate readout as one visibly linked event while the model remains unchanged.

## Scope and boundaries

- Redesign the canvas workspace only. Management navigation and management visual rules remain unchanged.
- Preserve `DESIGN.md` tokens and the Radix-first stack. This is a structural replacement, not a new brand system.
- Default to 3D-first rather than four equal panes.
- Keep the component set small and reusable. A feature does not receive a dedicated panel when it can use the contextual strip, a `ViewFrame` controller, or the inspector.
- Do not represent unsupported stereo, missing volume layers, or mesh-edit tools with inert controls.
- Geometry sculpting and repair editing remain outside this brief because the linked Slicer sources do not define them.

## Canvas convention rules

### 1. Control placement follows ownership

1. **Workspace scope** — document tabs, layout choice, command search, save/close: top document bar.
2. **Mode scope** — View, Window/Level, Place: left mode rail.
3. **Active-mode scope** — current mode options and completion state: contextual strip.
4. **View scope** — center, reset, maximize, projection, direction, link, ruler, display: inside that view’s header/controller.
5. **Object scope** — name, visibility, opacity, spatial metadata, revision: right inspector.
6. **Cross-workspace feedback** — coordinates, pending, error, WebGL, last action, recovery: bottom status strip.

A command appears once at its primary scope. Menus and command search may mirror it for discovery, but no second persistent button competes with the primary control.

### 2. Modes are not actions

The left rail contains only persistent pointer interpretations:

- **View** — rotate, roll, pan, zoom, crosshair.
- **Window/Level** — brightness and contrast for volume data.
- **Place** — place the selected record type, one-shot or persistent.

Center, Reset, Hide, Save, Apply, and Restore are actions and never occupy the mode rail. Active mode uses Accent wash and label text; disabled modes remain visible only when their absence teaches the data requirement.

### 3. Every control previews its effect

- Labels use verbs and targets: “Reset 3D view,” “Hide source anatomy,” “Show Axial slice in 3D.”
- Tooltips state input, effect, and write boundary: “Changes camera only; anatomy is unchanged.”
- Toggles show current state in their label or adjacent value.
- Destructive or revision-writing actions state the object and output before confirmation.
- Disabled controls name the missing prerequisite.

### 4. View controls stay attached to the view

Each `ViewFrame` has one compact header:

- left: view name, orientation/offset, active-view indicator;
- center or overflow: view-specific options;
- right: link, maximize/restore, pin/more.

Frequently used controls remain in the header. Advanced display controls use one Radix popover anchored to that header. Controls never float over unrelated views.

### 5. Progressive disclosure preserves discoverability

- The slice dock remains labelled even when collapsed.
- The inspector opens for selection and closes without clearing selection.
- Advanced display and coordinate details use popovers, not permanent panels.
- Command search indexes every supported action and includes its scope path.
- Hidden controls retain one stable route; they do not move between unrelated regions based on state.

### 6. Feedback is local first, global second

Immediate state appears beside the control or affected view. The status strip records the last completed result. Blocking failures use an inline viewport banner with one recovery action. Toasts never carry required instructions and never overlap primary controls.

### 7. Recovery is a first-class control

- Reset View remains visible in every loaded 3D view.
- Show all appears when all scene objects are hidden.
- Rebuild View appears after WebGL/render failure.
- Failed settings roll back to their prior visible values.
- Escape cancels only the top interaction layer and states what was cancelled.

## Minimal reusable component set

| Component | Responsibility | Reused by |
|-|-|-|
| `CanvasWorkspace` | Grid, active view, layout, responsive collapse | all canvas journeys |
| `DocumentBar` | open documents, layout switch, global canvas actions | 3D and slice layouts |
| `ModeRail` | persistent pointer mode selection | View, Window/Level, Place |
| `ContextStrip` | options for active mode/view; apply/cancel when needed | all modes |
| `ViewFrame` | active state, title, header slots, maximize, local failure | 3D and every slice |
| `ViewController` | reusable grouped view actions in header/popover | 3D and slices |
| `SliceDock` | three synchronized `ViewFrame` instances; collapse/expand | volume-backed documents |
| `InspectorDrawer` | selected object and operation details | source and candidate objects |
| `StatusStrip` | compact coordinates, state, diagnostics, recovery | all canvas states |
| `InlineNotice` | local pending, empty, failure, and recovery message | view, dock, inspector |

Use Radix `Toolbar`, `ToggleGroup`, `Tabs`, `Popover`, `Tooltip`, `Collapsible`, `DropdownMenu`, and `Dialog` for behavior. Styling remains in existing canvas CSS and tokens; do not add another component library.

## Journeys

### J1. Open a volume-backed document

**Entry:** The user opens a sample or candidate with authoritative volume data.

1. Keep the previous valid scene visible while the new document loads.
2. Open the document tab and show the 3D view as the dominant region.
3. Show the compact slice dock with Axial, Sagittal, and Coronal previews.
4. Set View mode active. Show RAS in the status strip.
5. On success, frame visible content and report “Ready.”

**Effect:** Scene and view state target the new document; no model edit occurs.

**Failure:** Keep the prior scene, mark the new tab failed, and offer Retry. Never replace the viewport with a blank canvas.

### J2. Navigate and recover the 3D view

**Entry:** The 3D `ViewFrame` is active.

1. Rotate, roll, pan, or zoom using Slicer-standard input.
2. Update orientation marker and camera state continuously.
3. On completion, record “Camera changed; anatomy unchanged.”
4. Center changes target only. Reset returns to a visible patient-standard frame.

**Effect:** Camera changes; model matrices and revisions remain identical.

**Recovery:** Reset 3D view remains in the header. Invalid camera state is rejected before render.

### J3. Cross-reference anatomy

**Entry:** A volume-backed document is open and linked views are enabled.

1. Hold Shift and move in the 3D or slice view.
2. Place the shared crosshair at the picked patient-space point.
3. Move all linked slices to the same RAS position.
4. Update the compact RAS readout; coordinate details expose LPS and IJK.

**Effect:** Crosshair and slice offsets change. Camera, geometry, and revisions do not.

**Failure:** If one view cannot represent the point, keep valid views unchanged and identify the failed destination.

### J4. Adjust window and level

**Entry:** Volume intensity data exists.

1. Select Window/Level in the mode rail.
2. The context strip shows preset, numeric window/level, Auto, and Reset.
3. Left drag changes brightness/contrast. Ctrl+drag computes from a region.
4. Escape abandons the current drag and restores the prior values.

**Effect:** Display transfer changes; source voxels and surface geometry do not.

**Unavailable state:** Mesh-only documents keep the mode disabled with “Requires volume intensity data.”

### J5. Place a record

**Entry:** The user chooses Place and a supported record type.

1. The context strip names the record type and one-shot/persistent choice.
2. Pointer preview shows the patient-space point before click.
3. Click creates a draft record and shows its coordinates in the inspector.
4. One-shot returns to View after success. Persistent remains active.
5. Escape removes only unfinished placement.

**Effect:** A draft record is added at the resolved patient coordinate; anatomy remains unchanged.

**Failure:** Reject invalid picks and retain the active mode with a local explanation.

### J6. Change projection and display

**Entry:** The 3D view is active.

1. Open the view controller from the 3D header.
2. Switch Perspective/Orthographic while preserving target and framing.
3. Orthographic enables the calibrated ruler; Perspective explains why it is unavailable.
4. Advanced display opens one popover for orientation marker, visibility, transparency, FPS, shadows, and supported stereo.

**Effect:** View/render state changes; geometry remains mounted.

**Failure:** Roll back the failed setting and keep the last valid frame.

### J7. Use standard views, spin, rock, and tilt lock

**Entry:** The 3D view is active.

1. Choose A/P/L/R/S/I from the view controller or shortcut.
2. The orientation marker and active direction agree.
3. Spin and Rock are mutually exclusive; Stop Motion ends either.
4. Tilt Lock exposes a persistent pressed state and limits only elevation.

**Effect:** Camera pose changes around the current target; model pose does not.

### J8. Manage visibility without losing context

**Entry:** An object is selected or the Scene section is open.

1. Toggle visibility from the object row or inspector.
2. The row, inspector, and viewport agree.
3. If the last object is hidden, the viewport explains “All objects are hidden.”
4. Show all restores visibility without changing camera or revisions.

**Effect:** Visibility mapping changes only.

### J9. Maximize and restore a view

**Entry:** Any 3D or slice `ViewFrame` is active.

1. Use the view-header control or left double-click.
2. The active view occupies the work area; mode rail, context strip, and status remain.
3. Restore returns the exact prior dock/layout proportions.

**Effect:** Layout changes only. Crosshair, camera, slices, selection, and mode persist.

### J10. Recover rendering

**Entry:** WebGL context loss, renderer exception, or invalid display update occurs.

1. Freeze domain writes and retain the last valid scene description.
2. Show an inline viewport failure with Rebuild View.
3. Rebuild renderer resources and rehydrate the current document.
4. On success, restore the prior view state where valid and clear the failure.

**Effect:** Render resources are recreated; committed data is unchanged.

## States and ranges

- **No document:** explain how to open anatomy; hide view-only controls that have no meaningful disabled lesson.
- **Loading:** preserve prior scene; show loading status in the target tab and view.
- **Mesh only:** 3D tools work; slice, IJK, and window/level controls explain the missing volume requirement.
- **Volume backed:** 3D plus slice dock, crosshair, RAS/IJK, and window/level are available.
- **Selected object:** inspector opens without reducing 3D below a usable width.
- **No selection:** inspector closes; viewport expands.
- **All hidden:** explicit empty state with Show all.
- **Pending:** originating control owns the progress state and blocks duplicate submission.
- **Failed:** last valid visual state remains, failed value rolls back, one recovery action is offered.
- **Short viewport:** slice dock collapses to its labelled summary before the 3D view becomes unusable.
- **Narrow desktop:** inspector overlays as a drawer; mode rail and active-view controls remain fixed.
- **Touch-capable:** direct rotate/pan/zoom buttons appear in the active view controller; hover is never required.

## Anti-goals

- No floating toolbar that mixes modes, view actions, object actions, and file actions.
- No detached anatomical-direction pad outside the affected `ViewFrame`.
- No duplicate persistent Apply, Save, Focus, Visibility, or Reset buttons.
- No permanent inspector when nothing is selected.
- No toast as the only proof that a visual action worked.
- No control that disappears merely because the pointer leaves it while keyboard focus remains inside.
- No soft pills, oversized cards, decorative gradients, or management-table chrome inside the viewport.
