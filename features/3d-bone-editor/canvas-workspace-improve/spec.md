# Spec: Slicer-standard canvas interaction

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14 (Close pass)

## Summary

The canvas follows the observable interaction behavior documented by 3D Slicer for synchronized views, 3D navigation, slice inspection, display controls, shortcuts, and medical-image coordinates. Every supported action has a defined scene effect, UI response, recovery path, and browser-level proof. A control is not implemented unless tests verify its camera, model, slice, coordinate, or persisted-state result.

This spec replaces the former command-menu P0 contract. The accepted [canvas-workspace spec](../canvas-workspace/spec.md) still governs source immutability, candidate revisions, persistence, and display-mesh integrity where it does not conflict with this spec.

UI hierarchy, component ownership, and end-to-end experiences are defined in [ui-journeys.md](ui-journeys.md).

## Reference boundary

Normative behavior is distilled from:

- [Interacting with views](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#interacting-with-views)
- [3D view](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#d-view)
- [Mouse and keyboard shortcuts](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#mouse-keyboard-shortcuts)
- [Coordinate systems](https://slicer.readthedocs.io/en/latest/user_guide/coordinate_systems.html)

The parity target is the behavior described in those sections, not all Slicer modules. “Model” below means rendered anatomy or candidate geometry; “modal interaction” means an active input mode, not the model.

## Requirements

### Behavioral truth and failure containment

- R1. Each visible control is either executable in the current context or disabled with a specific reason. No visible control may accept input and produce an unexplained no-op.
- R2. Each completed action reports one result: changed, unchanged because already at target, rejected with reason, or failed with recovery. Merely dispatching an event is not a result.
- R3. View actions may change only camera, slice, crosshair, layout, visibility, projection, or rendering preferences. They never alter a model world transform, source bytes, candidate draft, or revision.
- R4. Model-editing and placement actions are atomic. Failure or cancellation restores the last valid scene and domain state.
- R5. Before committing camera or object state, the canvas rejects non-finite vectors, zero or invalid camera distances, invalid projection parameters, missing object references, and singular coordinate transforms.
- R6. The last valid model remains mounted while replacement geometry or display settings load. A stale async result cannot replace a newer document, view, or render result.
- R7. If the WebGL context is lost or rendering throws, the canvas shows a named viewport error and a Rebuild View action. Domain data and the last committed revision remain unchanged.
- R8. Reset View is always reachable by UI and keyboard while a renderable document is open. It restores a finite camera, visible clipping range, canonical orientation, and fit-to-visible-content framing.
- R9. Hiding the last visible object is allowed only as an explicit visibility action. The empty viewport shows “All objects are hidden” with Show all; camera actions cannot make that state appear.
- R10. Repeated input, key repeat, rapid layout changes, and document switching converge to the latest requested valid state without duplicate writes, stuck pending state, or stale controls.

### Coordinate systems and anatomical truth

- R11. The canvas distinguishes image coordinates `(i, j, k)`, patient/anatomical coordinates, object-local coordinates, and one scene/world coordinate system.
- R12. Internal patient/world coordinates use RAS: +X Right, +Y Anterior, +Z Superior. Anatomical labels use A, P, R, L, S, and I and always refer to the patient.
- R13. Imported medical-image files are interpreted as LPS unless metadata explicitly declares RAS. LPS-to-RAS conversion flips the signs of the first two patient axes exactly once.
- R14. Import preserves origin, voxel spacing, axis directions, and the full homogeneous `IJK -> patient` affine. Oblique or reflected direction matrices cannot be reduced to origin and spacing alone.
- R15. Picking, crosshair movement, slice offsets, placement, measurements, focus targets, and exports resolve through the same coordinate transform chain.
- R16. A coordinate readout identifies its basis and unit. At minimum it shows RAS millimetres and IJK voxel indices; invalid or out-of-volume IJK positions show unavailable rather than fabricated values.
- R17. Standard views and orientation markers are derived from patient axes, not mesh-local axes or screen directions. Looking from Anterior places the patient’s Right on the viewer’s left.

### View layout and cross-reference

- R18. The workspace provides a 3D view plus Axial, Sagittal, and Coronal slice views when authoritative volume data is available. Each view can be activated without changing scene content.
- R19. The active view has a visible focus treatment. View-scoped shortcuts affect only the active view; pointer hover alone does not activate a view.
- R20. A single view can be maximized and the previous multi-view layout restored by the same control or left double-click.
- R21. Holding Shift while moving over a 3D or slice view moves the crosshair to the picked patient-space position. All linked slice views scroll to that same RAS position.
- R22. Crosshair visibility, style, and synchronization are exposed in one compact control. Hiding the crosshair does not clear its position.
- R23. Linked views synchronize supported properties within their view group. The UI distinguishes immediate synchronization from synchronization on interaction release.
- R24. When a requested linked-view update cannot be represented in another view, the source view keeps its valid state and the destination reports the unsupported property without partial synchronization.

### Interaction modes

- R25. Transform/View mode is the default mouse mode and controls view rotate, pan, and zoom. It never transforms anatomy or candidate geometry.
- R26. Window/Level mode adjusts volume brightness and contrast through left drag. Ctrl+left drag computes an automatic window/level from the chosen region, and Ctrl+left double-click restores the automatic range.
- R27. Window/Level is disabled with “Requires volume intensity data” when only a display mesh is available.
- R28. Place mode places the selected supported record type at the picked patient-space position in 3D or slice views.
- R29. Place mode returns to Transform/View after one successful placement by default. Persistent placement stays active until explicitly stopped, allowing repeated points.
- R30. Mode buttons show active state, shortcut/help text, and whether placement is one-shot or persistent. Escape cancels an unfinished placement without deleting earlier completed placements.

### 3D navigation and direct model effect

- R31. Left drag rotates the camera around the current target in azimuth and elevation while every model world matrix remains unchanged.
- R32. Ctrl+left drag rolls the camera clockwise or counter-clockwise around its view axis while the target and model world matrices remain unchanged.
- R33. Middle drag or Shift+left drag pans by translating camera and target together in view space.
- R34. Right drag vertically, Ctrl+wheel, `+`, `-`, and touch zoom controls change camera distance or orthographic scale without crossing the target or producing invalid clipping.
- R35. Arrow keys rotate the 3D view. Shift+arrow keys pan it. Each key press produces a bounded, deterministic increment.
- R36. Center View moves the camera target to the center of scene content, including loaded content defined by the scene policy, without changing zoom.
- R37. Reset View centers and fits visible content and returns to the nearest standard patient view. It is available through `Keypad 0` or `Insert` and the view controller.
- R38. Standard view actions show the model from Anterior, Posterior, Left, Right, Superior, or Inferior while preserving valid framing.
- R39. Tilt Lock, toggled by Ctrl+B, restricts rotation to azimuth. When off, elevation and roll are available again immediately.
- R40. Spin continuously rotates around the current target. Rock oscillates left-to-right around that target. Starting one stops the other, and Stop Motion halts either without changing the resulting camera pose.
- R41. Navigation remains available during Place and other tools through the documented Alt-modified alternatives and never completes or mutates the active tool action.

### 3D display controls

- R42. A compact 3D view controller appears on view focus or intentional hover, closes without trapping pointer input, and can be pinned. Pin state is visible and persists for the workspace.
- R43. The controller exposes Center, Reset, Maximize/Restore, six standard directions, linked-view state, projection, ruler, orientation marker, visibility, spin, rock, incremental zoom, tilt lock, rendering diagnostics, and supported shadow controls.
- R44. Perspective projection provides depth perspective. Orthographic projection removes distance-based size change. Switching projection preserves target, orientation, and equivalent visible framing.
- R45. The ruler is available only in orthographic mode, is calibrated in millimetres from the camera scale, and explains why it is unavailable in perspective mode.
- R46. Orientation marker choices include at least anatomical axes and a labelled cube. The marker updates with camera orientation and never changes scene orientation.
- R47. Visibility controls independently cover background and supported scene components. Turning an overlay off does not delete it or alter the underlying object.
- R48. Depth peeling is offered for transparent surfaces, FPS is a diagnostic overlay, and ambient shadows expose enabled, size scale, intensity scale, intensity shift, and volume-opacity threshold. Applying or rejecting these settings cannot unmount geometry.
- R49. Stereo modes are shown only when browser and display capability detection says they are usable. Unsupported stereo is absent or disabled with a reason; it is never presented as working.

### Slice-view inspection

- R50. Axial, Sagittal, Coronal, and Oblique orientations use patient-space planes. Slice offset moves along the displayed plane normal and shows the dominant anatomical direction label.
- R51. Each slice view has a compact hover/focus controller with pin and expanded-options states matching the 3D controller’s dismissal behavior.
- R52. Reset Slice View centers and fits the current background volume without changing the selected volume or patient-space slice position.
- R53. Show in 3D displays the slice plane in the 3D view. “Match volume” uses volume display properties; “Match 2D” also carries the slice view’s zoom and pan presentation.
- R54. Slice controls provide orientation, interactive reformat, offset, spacing increment, field of view, rotate-to-nearest-volume-plane, orientation marker, ruler, and interpolation.
- R55. Slice layers provide background, foreground, label/segmentation selection, independent visibility, layer opacity, foreground/background fade, and documented blending modes.
- R56. Parallel linked slices synchronize center, zoom, layer selection, and opacity according to the selected immediate or release-time link policy.
- R57. A control that requires a missing foreground, label, segmentation, or volume is disabled and names the missing data. It cannot substitute unrelated geometry.

### Keyboard, mouse, trackpad, and touch parity

- R58. On macOS, documented Ctrl application shortcuts use Command where that substitution does not conflict with browser or OS behavior; Alt is presented as Option. The displayed shortcut always matches the actual platform binding.
- R59. 3D view bindings match the source convention: left drag rotate; Ctrl+left drag roll; middle drag or Shift+left drag pan; right vertical drag or Ctrl+wheel zoom; arrows rotate; Shift+arrows pan; End/Keypad1 Anterior; Shift+End/Shift+Keypad1 Posterior; PageDown/Keypad3 Left; Shift+PageDown/Shift+Keypad3 Right; Home/Keypad7 Superior; Shift+Home/Shift+Keypad7 Inferior; Ctrl+B tilt lock; Keypad0/Insert reset; left double-click maximize/restore.
- R60. Slice bindings match the source convention where corresponding slice data exists: right vertical drag or Ctrl+wheel zoom; middle drag or Shift+left drag pan; arrows and B/F step slices; Shift+mouse move crosshair; Ctrl+Alt+left drag rotates enabled slice intersections; V toggles slice-in-3D; R resets; G toggles segmentation/label; T toggles foreground; brackets cycle background/foreground volumes; left double-click maximizes/restores.
- R61. One-button mice can substitute Ctrl+click for right-click. Trackpads can substitute two-finger click for right-click. Touch users receive explicit rotate, pan, zoom, center, reset, and standard-view controls with minimum accessible hit targets.
- R62. Shortcuts do not fire from editable text fields, during incompatible browser composition, or in an inactive view. Browser-reserved bindings are not intercepted unless the app can do so reliably and displays the actual binding.
- R63. Application-level shortcuts in the source are adapted only where this product has an equivalent: open/import, save, close document, error log, help, settings, panel visibility, and workspace/home. Slicer Modules, Extensions Manager, and Python Console are recorded as not applicable rather than represented by inert controls.

### UI behavior, observability, and proof

- R64. Menus, popovers, and controllers close on outside pointer action, Escape, or successful command execution. They do not require clicking their trigger again and do not block the canvas after closing.
- R65. Camera motion and panel transitions honor reduced motion. Continuous spin and rock never start automatically.
- R66. The debug/automation state exposes active view, mode, camera position/quaternion/target/projection, clipping range, visible object IDs, object world matrices, crosshair RAS, slice orientations/offsets, coordinate affine, pending operation count, WebGL status, and last action result.
- R67. An automated interaction test fails if a control expected to change state leaves its relevant observable unchanged, even when the click or key event was received.
- R68. Camera tests assert finite camera state, expected directional change, invariant model matrices, visible-content/frustum intersection, and recoverability through Reset View.
- R69. Render tests assert a live canvas/WebGL context, no uncaught console errors, expected scene-object count, and a deterministic rendered-frame or screenshot change for actions with a visual effect.
- R70. Every visible control and every shortcut has at least one real-browser workflow test covering success, disabled context, repeated input, and recovery after a forced failure. Unit tests alone cannot satisfy this requirement.
- R71. Stress tests interleave navigation, mode changes, visibility, projection, layout switching, and document switching. The final debug state and rendered frame must agree with the final requested action.
- R72. A parity ledger remains in this spec. A source capability cannot disappear from implementation scope without being marked adapted, conditional, not applicable, or removed by an accepted spec change.

### Canvas hierarchy and journeys

- R73. A volume-backed document opens 3D-first with a dominant 3D `ViewFrame` and a compact synchronized Axial/Sagittal/Coronal `SliceDock`; four-up remains available through the layout switch.
- R74. Persistent control placement follows ownership: workspace actions in `DocumentBar`, pointer modes in `ModeRail`, active-mode options in `ContextStrip`, view actions in the affected `ViewFrame`, object properties in `InspectorDrawer`, and coordinates/recovery in `StatusStrip`.
- R75. `ModeRail` contains only View, Window/Level, and Place. Actions such as Center, Reset, Hide, Save, Apply, Restore, and Show all never appear as modes.
- R76. `ContextStrip` changes with the active mode or in-progress operation and does not duplicate view actions that already have a primary home in the active `ViewFrame`.
- R77. Every 3D and slice view uses the same `ViewFrame` contract for active state, name, orientation or offset, link state, maximize/restore, local settings, pending state, and local failure/recovery.
- R78. `InspectorDrawer` opens when selection or operation review needs it and closes without clearing selection. With no selection or review task, it does not reserve permanent viewport width.
- R79. `SliceDock` remains discoverable when collapsed through a labelled summary containing available planes and link state. It collapses before the 3D view falls below its usable height.
- R80. `StatusStrip` shows compact RAS millimetres by default. An expandable coordinate control exposes LPS and IJK without adding a permanent second status row.
- R81. Each control’s label or tooltip states its target, expected effect, and write boundary. Revision-writing or destructive actions also identify their output before confirmation.
- R82. A command has one persistent primary control. Menus and command search may mirror it for discovery, but a second persistent button cannot compete with its primary location.
- R83. Immediate feedback appears beside the affected control or view. The status strip records the completed result. Toasts cannot be the only explanation or proof of an action.
- R84. The canvas is implemented from the reusable component set in `ui-journeys.md`; adding a feature-specific panel requires proof that `ContextStrip`, `ViewController`, `InspectorDrawer`, or a popover cannot express it.
- R85. At narrow desktop widths the inspector becomes an overlay drawer; at short heights the slice dock collapses; on touch-capable devices active-view controls expose direct rotate, pan, and zoom. Core controls never require hover.

## Functional effect and UI matrix

| Capability | Expected scene/model effect | Expected UI and recovery |
|-|-|-|
| Rotate / roll / pan / zoom | Camera changes; model matrices and revisions do not | Active-view feedback; Reset always restores a visible finite frame |
| Center | Target changes; zoom does not | One action with an “already centered” result when unchanged |
| Reset | Camera becomes canonical and visible content fits | Always enabled for a loaded renderable scene |
| Standard directions | Camera aligns to patient axis; model does not rotate | A/P/L/R/S/I labels and active direction agree |
| Crosshair | Shared RAS point and linked slice offsets change | Readout updates; hide preserves position |
| Projection / ruler | Camera projection changes; ruler is calibrated only in orthographic | State is explicit; unsupported combinations explain why |
| Visibility | Only requested object/overlay visibility changes | Hidden-all state offers Show all; no deletion |
| Spin / rock | Camera changes continuously around target | Mutually exclusive active state plus Stop Motion |
| Window/level | Volume display transfer changes; source voxels do not | Disabled for mesh-only data; reset restores automatic range |
| Slice offset / reformat | Slice plane changes in patient space | Direction and millimetre offset remain visible |
| Place | New draft record appears at picked patient coordinate | One-shot returns to View; persistent mode remains visibly active |
| Display settings | Render pipeline/material changes; geometry stays mounted | Failure rolls back setting and keeps last valid frame |
| Maximize / restore | Layout changes only | Same button and double-click restore prior layout |

## Slicer parity ledger

| Source capability group | Disposition |
|-|-|
| Cross-reference and configurable crosshair | Required directly: R21-R24 |
| Transform/View, Window/Level, and one-shot/persistent Place modes | Required with product record types: R25-R30 |
| 3D orientation references and six patient views | Required directly: R12, R17, R38 |
| Hover/pinned 3D and slice controllers | Adapted to Radix browser chrome: R42, R51, R64 |
| Center, reset, maximize, linked views, projection, ruler | Required directly: R20, R23, R36-R45 |
| Stereo viewing | Conditional on browser/display support: R49 |
| Depth peeling, FPS, visibility, orientation marker | Required directly: R46-R48 |
| Spin, rock, touch zoom, tilt lock | Required directly: R39-R43 |
| Ambient-shadow controls | Required where current renderer supports equivalent parameters: R48; unsupported parameters must be explicit |
| Axial, Sagittal, Coronal, Oblique slices and slice controller | Required when authoritative volume exists: R18, R50-R57 |
| Layer selection, blending, opacity, interpolation | Required when corresponding volume/layer data exists: R55-R57 |
| Source 3D and slice shortcuts | Required with platform conflict handling: R58-R62 |
| One-button mouse and trackpad alternatives | Required directly: R61 |
| World, anatomical, image coordinates and affine conversion | Required directly: R11-R17 |
| Slicer Modules, Extensions Manager, Python Console | Not applicable to the canvas; no inert substitutes: R63 |
| Slicer mesh sculpting or cranial-repair editing | Not specified by the linked sources; requires a separate accepted reference and spec |

## Success criteria

- S1. Given a loaded model, every navigation input changes the expected camera component, leaves model world matrices and revision count unchanged, and Reset returns the model to a visible canonical frame.
- S2. Given any camera, projection, or display control, repeated activation never produces NaN/Infinity, loses the WebGL context, unmounts geometry, or leaves pending state.
- S3. Given a file with a known oblique IJK-to-LPS affine, importing and picking a known voxel returns the expected RAS millimetre coordinate after one LPS-to-RAS conversion.
- S4. Given four-up layout, moving the crosshair in one view moves all linked slices to the same RAS point without changing any model transform.
- S5. Given a model-only document, Window/Level and slice-only controls are disabled with data-specific reasons and the 3D controls remain usable.
- S6. Given Place mode, one successful placement returns to View mode; persistent placement produces multiple records until stopped; Escape removes only unfinished placement state.
- S7. Given Perspective view, switching to Orthographic preserves target and framing; the ruler becomes calibrated and available; switching back disables the ruler without changing geometry.
- S8. Given all objects hidden, the viewport explains the state and Show all restores them. Reset cannot be mistaken for a visibility failure.
- S9. Given a failed render-setting update, the last valid frame remains visible, the rejected setting rolls back, and retry can succeed.
- S10. Given rapid document and view switching with delayed geometry loads, only the latest requested document renders and all controls describe that document.
- S11. Given any menu or popover, outside click, Escape, or command execution closes it and the next canvas drag reaches the active view.
- S12. Given every visible button and shortcut, the browser test asserts its documented state and rendered effect; a handler-only or click-only assertion fails review.
- S13. Given random valid sequences of 100 view operations, state remains finite and Reset returns a visible model with no domain mutation.
- S14. Given patient-standard views, orientation marker, labels, coordinate readout, and camera direction agree for A/P/L/R/S/I.
- S15. Given a lost WebGL context, the user sees the failure, can rebuild the view, and committed model/revision data remains intact.
- S16. Given a volume-backed document opens, the 3D view is dominant, the synchronized slice dock is visible, View mode is active, and RAS is readable without opening a panel.
- S17. Given no object is selected, the inspector reserves no viewport width; selecting an object opens it; closing it preserves selection.
- S18. Given the viewport height becomes constrained, the slice dock collapses to a labelled summary before obscuring 3D content, and one action restores it.
- S19. Given any visible canvas control, its primary location matches R74 and no duplicate persistent control exists elsewhere.
- S20. Given a local operation fails, the affected view or control explains the failure and recovery in place, while the status strip records failure and the prior valid visual state remains.

## Design

### State boundaries

The canvas keeps separate state for domain data, scene objects, view/layout, interaction mode, and transient tool input. View commands can write only view/layout state. Placement and future edit commands use a draft transaction and commit through shared operations. Render resources are replaceable projections of authoritative data, not the data itself.

### View controller

Each view owns a compact controller anchored inside its frame. The common section contains maximize, link, orientation marker, and diagnostics. The 3D section contains camera and rendering controls; slice sections contain orientation, offset, layers, and interpolation. Hover may reveal the controller, but focus, pin, keyboard dismissal, and touch access make every action reachable without hover.

### Runtime validation

Camera and coordinate updates are computed as candidate state, validated, then committed. The renderer retains the previous valid scene until replacement resources are ready. Async work carries document and request identity so stale completion is discarded.

### Test oracle

Browser tests use both semantic state and rendered evidence. Semantic assertions read the automation snapshot in R66. Visual assertions verify the WebGL canvas still contains expected geometry and changes where a visual effect is required. Neither alone is sufficient for high-risk navigation and rendering workflows.

## Where it lives

- Feature behavior and journeys: `features/3d-bone-editor/canvas-workspace-improve/`
- Durable canvas conventions: `docs/design-conventions.md`
- Canvas orchestration: `app/src/App.tsx`
- Cross-reference shell: `app/src/ui/CanvasWorkspace.tsx`, `ViewFrame.tsx`, `SliceDock.tsx`, `ViewController.tsx`, `SliceViewport.tsx`
- Viewport and camera: `app/src/viewport/Viewport.tsx`, `app/src/viewport/navigationPolicy.ts`
- Coordinates and slices: `app/src/geometry/coordinates.ts`, `app/src/geometry/slices.ts`, `app/src/geometry/nrrdVoxels.ts`
- Commands and operations: `app/src/commands/`, `app/src/ops/`
- Automation state: `app/src/debug/bridge.ts`
- Unit and component tests: `app/tests/` (`coordinates`, `canvasViewState`, `slices`, `navigationPolicy`, `ui/canvasWorkspace`, `ui/viewController`)
- Real-browser workflows: `app/e2e/canvas-workflow.spec.ts`, `app/playwright.config.ts`

## Decisions

- D1. 3D Slicer is the behavioral reference for the linked view and coordinate capabilities. Why: it provides a coherent medical-imaging convention and removes invented interaction semantics.
- D2. The product adapts behavior, not Slicer’s Qt visual design. Why: this is a browser app governed by `DESIGN.md`.
- D3. Internal patient/world coordinates are RAS and file input defaults to LPS unless declared otherwise. Why: this matches the documented Slicer boundary and makes conversions explicit.
- D4. Synchronized 3D and slice views are part of parity. Why: cross-reference, image coordinates, window/level, and several documented shortcuts are otherwise fake or meaningless.
- D5. View state and model/domain state are separate write domains. Why: camera and display failures must not corrupt anatomy or candidate revisions.
- D6. A click is not proof. Browser acceptance requires state and render oracles. Why: the current failure mode is controls that receive input but do nothing useful.
- D7. Slicer shortcut semantics replace the former Blender-first mapping for this feature. Why: two competing defaults would make the contract ambiguous.
- D8. Unsupported or hardware-dependent capabilities are explicit and disabled or absent. Why: visible inert controls falsely claim parity.
- D9. The default layout is 3D-first with a persistent compact slice dock, not equal four-up. Why: the 3D model remains the primary review surface while cross-reference stays continuously discoverable.
- D10. Cross-reference Dock and Progressive Workbench are combined. Why: synchronized slices need stable spatial presence, while mode and object controls should appear only in their relevant context.
- D11. The default coordinate display is compact RAS with expandable LPS and IJK. Why: patient-space location stays visible without turning the status strip into a data panel.
- D12. One implementation plan uses independently provable vertical slices. Why: a full replacement cannot be trusted until camera, coordinate, render, and recovery effects pass at each seam.

## Flagged concerns

- Product scope conflict: `PRODUCT.md` currently defers measurements and broader inspection features, while this spec requires rulers, crosshair coordinates, and slice inspection. Implementation must not begin until product scope is reconciled.
- Editing boundary: the linked Slicer pages do not specify mesh editing, segmentation, sculpting, booleans, or cranial-repair construction. Claiming those mechanics from these references would be false.
- Data availability: slice views, window/level, IJK readout, and volume layers require authoritative volume data and spatial metadata. Display-mesh-only documents can provide only the 3D subset.
- Browser capability: stereo display and some browser-reserved shortcuts may not be implementable consistently. R49 and R62 require capability detection and truthful UI rather than fake parity.
- Performance: four synchronized views, volume slices, transparency, and ambient shadows can exceed current render cost. The future plan needs measured budgets and fallback behavior, not silent feature removal.

## Open questions

1. Which Slicer editing or segmentation module documentation defines the next geometry-editing brief?
2. Which browsers, pointing devices, and touch devices form the acceptance matrix?
3. Which stereo modes, if any, are realistic browser targets?

## Out of scope

Slicer’s module system, extension manager, Python console, DICOM database, clinical claims, manufacturing approval, and mesh-edit behavior not documented by the four normative source sections.
