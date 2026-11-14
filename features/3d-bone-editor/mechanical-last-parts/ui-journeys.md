# UI journeys: annotation, measurement, and spatial markup

Spec: [spec.md](spec.md) · Status: draft · Last updated: 2026-11-15

---

## Purpose and design principles

This document defines the complete UI behavior, hierarchy, and visual conventions for the annotation feature. It is an extension of the Cross-reference Workbench defined in `canvas-workspace-improve/ui-journeys.md` — not a parallel or replacement system. Every convention established there applies here; this document only adds what is new.

**Core principle:** annotation is a *placement and inspection* workflow, not a drawing application. The vocabulary is deliberate marks (a named landmark, a measured line, a closed boundary) not freehand sketching. The workspace already does the hard work of viewing anatomy; annotation extends it with named, recoverable, persistent observations.

The user the design optimizes for is working methodically: they pause, choose what to mark, place it with intent, read the measurement, and move on. Speed of placement matters less than clarity of what was placed.

---

## What extends, what stays the same

**Unchanged from canvas-workspace-improve:**

- `CanvasWorkspace` grid, `ModeRail`, `ContextStrip`, `ViewFrame`, `SliceDock`, `StatusStrip` — same components, same placement rules, same CSS tokens.
- Control placement ownership table (scope → primary home) — annotation entries are added, nothing is moved.
- `DESIGN.md` colors, type, radius, motion, elevation — applied strictly.
- Radix Themes first for any new composed controls. No hand-rolled dropdowns, selectors, or toggles.
- "No permanent inspector when nothing is selected" and "one persistent primary control per command" remain hard rules.

**Extended:**

- `ModeRail` — Place mode is already present. Annotation type selection lives in `ContextStrip` when Place is active, not in the rail.
- `ContextStrip` — gains annotation type selector buttons for Phase 1 and Phase 2.
- `InspectorDrawer` — gains a new "Annotations" section below the existing revision history.
- `Viewport` — gains `AnnotationOverlay` for 3D glyph and line rendering.
- `SliceViewport` — gains projected annotation rendering.

**New:**

- `AnnotationTypeSelector` — the row of type buttons inside `ContextStrip` when Place is active.
- `AnnotationList` — the collapsible section in `InspectorDrawer`.
- `AnnotationRow` — a single annotation's collapsed and expanded row state.
- `AnnotationOverlay` — the Three.js overlay component inside `Viewport`.

---

## Control placement ownership (annotation additions)

Extends the ownership table from `canvas-workspace-improve/ui-journeys.md`:

| Scope | Primary home | Annotation examples |
|---|---|---|
| Pointer mode | Mode rail | Place (already there) |
| Active annotation type | Context strip | Landmark, Distance Line, Closed Curve, Text Note, Angle, Plane, Open Curve, ROI, Surface Highlight |
| In-progress placement state | Context strip | "2 of 3 points placed · Enter to close · Esc to cancel" |
| Measurement result of active annotation | Context strip | "Length: 48.2 mm" live during drag |
| Committed annotations | Inspector drawer → Annotations section | all annotation types |
| Jump-to-landmark action | Inspector drawer annotation row | Click name → all slices jump |
| Annotation visibility / lock | Inspector drawer annotation row | icons per row |
| Place annotation entry point | Inspector drawer Annotations section header | "Place annotation" button |
| Highlight brush radius | Context strip | slider, Phase 2 only, only when Surface Highlight is active type |
| Plane method | Context strip | Point-normal / Three-point sub-selector, Phase 2 only |
| Show in slice dock | Inspector drawer annotation row | plane type only, Phase 2 |

No annotation control belongs in the `ViewFrame` header or `StatusStrip`. The `StatusStrip` continues to show RAS coordinates and renderer state only.

---

## Visual tokens for annotation elements

All annotation rendering uses only established `DESIGN.md` tokens. No new colors are introduced to the design system.

| Element | Token | Hex | Rationale |
|---|---|---|---|
| Unselected glyph / line | `accent` | `#2F6BFF` | Accent is the system's strong-action / active-object color. Annotations are active objects. |
| Selected glyph / line | Accent at 100% opacity + 2px outline with `elevated` white | — | Standard selection treatment — accent fill, white halo for contrast against dark geometry |
| Hovered glyph | Accent at 80% opacity | — | Subdued; hover is not interaction proof |
| Label text | `elevated` `#FFFFFF` on `ink` `#1A1D21` pill | — | Readable against both light and dark backgrounds in the 3D viewport |
| Label pill background | `ink` at 85% opacity | — | Soft dark pill; avoids harsh black box |
| Projected annotation in slice (in-plane) | `accent` full opacity | `#2F6BFF` | Matches 3D treatment |
| Projected annotation in slice (behind plane) | `accent` at 25% opacity, dashed outline | — | Matches Slicer projection visibility convention |
| Active placement preview (not committed) | `accent` at 50% opacity, dashed | — | Distinguishes in-progress from committed |
| Measurement label in viewport | Same pill style as glyph label | — | Consistent |
| Highlight overlay — accent blue | `accent` `#2F6BFF` at opacity 0.4 | — | Phase 2 |
| Highlight overlay — amber | `#F59E0B` at opacity 0.4 | — | Phase 2; amber is a standard data-viz neutral |
| Highlight overlay — rose | `#F43F5E` at opacity 0.4 | — | Phase 2; not Signal red, differentiated |
| Highlight overlay — emerald | `#10B981` at opacity 0.4 | — | Phase 2; standard confirmation green |
| Panel row icon (type) | `ink-muted` idle, `accent` when expanded | — | Quiet until focused |
| Panel lock icon | `ink-muted` when unlocked, `ink` when locked | — | Lock state reads immediately |
| Panel visibility icon | `ink-muted` when visible, `ink-muted` strikethrough when hidden | — | Eye icon convention |

Glyph geometry:

- Landmark / text note: `SphereGeometry` radius 1.5 mm in world space. Never scales with viewport zoom (always 1.5 mm physical).
- Angle vertex: same sphere.
- Control point on line, curve, ROI: `SphereGeometry` radius 1.2 mm — slightly smaller to not overwhelm the connecting line.
- Connecting lines / curve segments: `Line2` with 1.5 px screen-space width, anti-aliased.
- Closed curve / open curve: same as connecting lines; closure segment dashed until a closed curve is fully committed.
- ROI box: `EdgesGeometry` wireframe, 1.5 px.
- Plane: `PlaneGeometry` with `MeshBasicMaterial({ transparent: true, opacity: 0.15, side: THREE.DoubleSide })` for the fill, `EdgesGeometry` at full accent opacity for the outline.
- Highlight overlay: `THREE.Mesh` with filtered index buffer, `MeshBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false })`.

---

## Component: `AnnotationTypeSelector`

Lives in `ContextStrip`, rendered only when Place mode is active.

**Visual structure:**

```
[ Landmark ]  [ Distance Line ]  [ Closed Curve ]  [ Text Note ]
                    ── Phase 2 ──
[ Angle ]  [ Plane ▾ ]  [ Open Curve ]  [ ROI ]  [ Highlight ▾ ]
```

Each button uses the existing `canvas-mode-button` / `is-active` class pattern from `CanvasWorkspace.tsx` — idle ghost, active accent wash (`#E8EFFF`) with accent ink (`#2F6BFF`). The Phase 1 / Phase 2 separator is a 1px `border` horizontal rule with a `meta` text label "Phase 2" (0.75rem, `ink-muted`) — same treatment as section separators in management tables.

Sub-selectors (Plane method, Highlight brush) appear as inline controls immediately below the type row, in the same `ContextStrip`. They are not popovers — the strip already collapses contextually, so inline expansion is cleaner and maintains focus within the strip region.

**Behavior:**

- Exactly one type is active at a time. Switching types while an in-progress multi-point placement is running shows an inline confirmation prompt in `ContextStrip`: "Cancel current placement and switch?" with **Switch** (accent) and **Keep placing** (secondary). This prompt does not use a Radix `Dialog` modal — it is an inline strip message, because the action is low-consequence and reversible (no data has been committed yet).
- The active type name appears as a `section` weight label at the left of `ContextStrip`: "Place: Landmark" / "Place: Distance Line" etc.
- The in-progress placement status also lives in `ContextStrip` to the right of the type selector: "1 of 2 points placed · click to place second point · Esc to cancel". This disappears once the annotation is committed.
- The live measurement, if one is computable, appears rightmost in `ContextStrip`: "Distance: 32.4 mm" updating on cursor move. It uses `section` weight, `accent` color.

---

## Component: `AnnotationList` (inside `InspectorDrawer`)

The Annotations section is added below the existing revision history section in `Inspector.tsx`.

**When it appears:** any time a candidate revision is the active document, regardless of whether annotations exist. When no annotations exist, it shows the empty state. The section header always shows the count badge.

**Section header:**

```
[ ◈ Annotations  3 ]  ──────────────────────  [ Place annotation ▸ ]
```

- Section title uses `section` weight (0.875rem 600) with a small `MapPin` icon (14px, `ink-muted`).
- Count badge uses `rounded.pill`, `base` background, `ink` text — same as the revision count badge already in the inspector. Badge disappears at zero.
- "Place annotation" is a `button-secondary` size `xs`. Clicking it activates Place mode on the canvas and sets the last-used annotation type (or Landmark if none used yet). It is disabled with reason "Requires active candidate" when source anatomy is active.

**Empty state:**

```
[ MapPin icon 24px ink-muted ]
No annotations yet
Click "Place annotation" to mark landmarks,
measure distances, or trace boundaries.
```

Short, verb-led, one CTA. No illustration. Matches the existing empty state pattern in management tables.

---

## Component: `AnnotationRow`

Each annotation is a single Radix `Collapsible` row. Default: collapsed.

**Collapsed row (all types):**

```
[ type-icon ]  Name                 [ measurement ]  [ 👁 ]  [ 🔒 ]  [ 🗑 ]
```

- `type-icon` 14px, `ink-muted` idle, `accent` when expanded.
- Name: `body` weight (0.875rem 400). Truncated to one line with ellipsis if longer than available width.
- `measurement`: `meta` weight (0.75rem 400), `ink-muted`. Right-aligned. Shows the primary value for the type: RAS coords for landmark, distance mm for line, length mm for curve, degrees for angle, etc. Shows "—" if insufficient points.
- Visibility icon (eye): `ink-muted` when visible. When hidden: eye with strikethrough, `ink-muted`. Click toggles. Uses Radix `Tooltip` with "Hide annotation" / "Show annotation".
- Lock icon: `ink-muted` when unlocked (open padlock). When locked: closed padlock, `ink`. Click toggles. Tooltip: "Lock position" / "Unlock position".
- Delete icon: `ink-muted` trash. Only visible on row hover (CSS `opacity: 0 → 1` on `annotation-row:hover`, `transition: 120ms`). Tooltip: "Delete annotation". Clicking raises an inline confirmation directly in the row (not a modal), described below.

**Expanded row:**

Clicking anywhere on the row body (not on the action icons) expands it. The chevron rotates 90°. Expanded content uses `body` text, `border-top` separator, padding `spacing.md`.

For each type, the expanded content is:

**Landmark:**
```
Name  [ editable inline text field ]
Position  R 12.4 · A -5.8 · S 24.1 mm   [ ⌖ Jump to ]
```
"Jump to" is a `button-secondary xs` with a crosshair icon. Clicking jumps all linked slices to the landmark's RAS.

**Distance line:**
```
Name  [ editable ]
Distance  48.2 mm
Point A  R 12.4 · A -5.8 · S 24.1 mm
Point B  R 18.1 · A -2.1 · S 29.8 mm
```

**Closed curve:**
```
Name  [ editable ]
Length  112.4 mm   (N control points)
```

**Text note:**
```
Name  [ editable ]
Anchor  R 12.4 · A -5.8 · S 24.1 mm   [ ⌖ Jump to ]
Note  [ multiline textarea, body size, border-radius sm ]
      [ committed on blur / Enter, cancelled on Esc ]
```
The textarea is styled using `border`, `elevated` background, `ink` text, `rounded.sm`, body font — same as management form inputs.

**Angle (Phase 2):**
```
Name  [ editable ]
Angle  34.6°
Vertex B  R ... · A ... · S ...
Arm A    R ... · A ... · S ...
Arm C    R ... · A ... · S ...
```

**Plane (Phase 2):**
```
Name  [ editable ]
Normal  ( 0.00, 0.71, 0.71 )
Area    824.3 mm²
[ Show in slice dock   ○ ]   ← Radix Switch, not a checkbox
```
The Radix `Switch` uses accent when on. Label: "Show in slice dock". Turning it on adds the slice to SliceDock; turning it off removes it.

**Open curve (Phase 2):**
```
Name  [ editable ]
Length  67.1 mm   (N points)
```

**ROI (Phase 2):**
```
Name  [ editable ]
L–R   24.1 mm   P–A   18.3 mm   I–S   31.0 mm
Volume  13 621 mm³
```

**Surface highlight (Phase 2):**
```
Name  [ editable ]
Color  [ ● accent ]  [ ● amber ]  [ ● rose ]  [ ● emerald ]
Triangles  2 148
Brush radius  [ ——●—— ]  12 mm         [ Clear ]
```
Color selector: four radio-style `button-secondary` buttons each with a colored dot (10px circle, the respective token hex, inline SVG). Active color gets accent wash treatment. Clear is `button-secondary xs` that removes strokes but keeps the annotation record. If a stale-mesh warning is active, the row shows a `signal`-colored inline notice: "Overlay references stale mesh — repaint required."

**Inline delete confirmation:**

When the trash icon is clicked on a row that has a measurement result:
```
Delete "Name"? This cannot be undone.    [ Cancel ]  [ Delete ]
```
This inline confirm replaces the row content temporarily (Radix `Collapsible` animation collapses the normal content, the confirm message slides in at the same height). `Cancel` restores the row. `Delete` calls the delete op. No modal dialog. For a row with no measurement result (empty placement), deletion happens immediately without confirmation.

---

## Journey: J-A1. Place a landmark

**Entry:** Candidate document is active.

1. User clicks **Place annotation** in the Annotations section header, or switches mode rail to Place.
2. `ContextStrip` shows the type selector. Last-used type is pre-selected (default: Landmark on first use).
3. User confirms Landmark is selected. `ContextStrip` reads: **Place: Landmark** · "Click in the 3D view or any slice to place. Esc to cancel."
4. User moves cursor over the 3D view. A preview sphere (accent, 50% opacity) tracks the cursor position in world space. `ContextStrip` right side shows: **R 12.4 · A -5.8 · S 24.1 mm** (live RAS of the cursor, same precision as the crosshair).
5. User clicks. The sphere becomes fully opaque (committed). The name label appears ("Landmark 1").
6. Place mode remains active (one-shot returns to View after one landmark per convention R41). The annotations panel gains a new row.
7. The InspectorDrawer opens to the Annotations section if it was closed. The new row is scrolled into view and momentarily highlighted (accent wash, 400ms, then fades).

**Failure:** If the click lands outside any loaded geometry or volume (a pick miss), no annotation is created. `ContextStrip` shows inline: "No geometry at that position — try again." The mode stays active.

---

## Journey: J-A2. Place a distance line

1. User selects Distance Line in `ContextStrip`.
2. `ContextStrip`: **Place: Distance Line** · "Click to place first point."
3. Click places Point A (sphere, fully opaque). `ContextStrip` updates: "Click to place second point. Esc to cancel."
4. As user moves cursor, a dashed preview line extends from A to cursor. `ContextStrip` right: "Distance: 32.4 mm" (live Euclidean).
5. Click places Point B. The line becomes solid. The midpoint label appears: "32.4 mm". Annotation committed.
6. Place mode stays active (persistent for distance line). The type remains Distance Line, ready for the next one.

**Escape behavior:** pressing Esc while only A is placed removes A and cancels the in-progress placement. ContextStrip returns to the type selector state. Already-committed annotations are unaffected.

**Post-commit drag:** user clicks an endpoint sphere in the viewport. The sphere highlights (1px white halo + scale 1.1). Dragging repositions it; the dashed preview shows the new proposed position; `ContextStrip` live-updates the distance. Release commits the new position. The line is not locked. If the annotation is locked, the sphere is not draggable — hovering shows a lock cursor and tooltip "Unlock in the Annotations panel to reposition."

---

## Journey: J-A3. Trace a closed curve (defect rim)

1. User selects Closed Curve.
2. `ContextStrip`: **Place: Closed Curve** · "Click to add points. Double-click or Enter to close. Right-click or Esc to cancel."
3. Each click adds a control point sphere. The connecting segments draw immediately.
4. The in-progress status tracks: "4 points · Double-click or Enter to close · Esc to cancel."
5. A "ghost" closing segment (dashed, 50% accent) always shows from the last placed point back to the first, so the user can see how the closure will look.
6. Double-click or Enter closes the curve. The ghost segment becomes solid. The length label appears at the centroid of the curve.
7. Annotation committed. Place mode remains active.

**Minimum 3 points:** if the user double-clicks or presses Enter with fewer than 3 points, `ContextStrip` shows: "Need at least 3 points to close — keep clicking." The state does not change.

---

## Journey: J-A4. Add a text note

1. User selects Text Note.
2. `ContextStrip`: **Place: Text Note** · "Click to place anchor point."
3. Click places the anchor sphere.
4. Immediately, an inline text input activates: a small floating input box appears directly beside the glyph in the viewport (positioned by projecting the 3D point to screen space). The input has a minimum width of 160px, `elevated` background, `ink` text, `border`, `rounded.sm`. Focus is set automatically.
5. User types the note. The callout label previews in real time.
6. Blur or Enter commits. Escape cancels (removes the placed anchor).
7. Place mode returns to View after text note commit (one-shot per R41).

The floating input is a viewport overlay div positioned via `getBoundingClientRect`-style projection, not a Three.js object. It sits in the DOM above the canvas, z-index above `AnnotationOverlay`. On scroll / camera move, it re-projects on each animation frame while the input is active.

---

## Journey: J-A5. Switching annotation type mid-placement

User has placed one point of a distance line and then clicks Closed Curve in `ContextStrip`.

`ContextStrip` replaces the type selector row with an inline confirmation row:
```
Cancel current Distance Line placement (1 point) and switch to Closed Curve?
[ Keep placing ]  [ Switch ]
```

- **Keep placing** (secondary button): dismisses the confirm, returns to Distance Line in-progress state.
- **Switch** (accent button): discards the in-progress placement (the single A point is removed) and activates Closed Curve.

This is not a modal. It is a strip-level inline message that replaces the type selector row for one interaction cycle.

---

## Journey: J-A6. Restore a revision — annotation panel update

User clicks Restore on revision R1 in the Inspector revision history panel.

1. The restore op fires. `App.tsx` calls `apiClient.restoreRevision`, then `loadProject`.
2. The project manifest reload fetches all annotations for all revisions.
3. `EditorState.annotations` now reflects R1's annotations.
4. The Annotations section in Inspector re-renders with R1's annotation list.
5. `AnnotationOverlay` re-renders with R1's annotation objects in the viewport.
6. If R1 had no annotations, the section shows the empty state.

No flash, no spinner needed. The existing `loadProject` → `refresh` tick already triggers a full re-render. The annotation panel is a derived view of `state.annotations` filtered by the active revision ID.

---

## Journey: J-A7. Surface highlight (Phase 2)

1. User selects Surface Highlight in `ContextStrip`.
2. `ContextStrip` sub-row appears: color picker (four radio buttons) + brush radius slider + "Brush: 12 mm" label.
3. `ContextStrip`: **Place: Surface Highlight** · "Drag over the mesh to paint. Release to commit stroke."
4. User enters a name for the overlay in a small inline field in `ContextStrip` (defaults to "Highlight 1"). This creates the annotation record on first stroke, not on name entry.
5. Left-click-drag over the mesh surface. The brush sphere (semi-transparent accent circle, screen-space radius derived from the 12 mm world-space radius at the current camera distance) tracks the cursor. Triangles within range are highlighted immediately in the chosen color at 0.4 opacity.
6. Each drag stroke is accumulated into the same overlay until the user clicks **Clear** in the annotation row or exits Paint submode.
7. Releasing the mouse button commits the stroke. The annotation record is updated via `apiClient.updateAnnotation`.
8. The annotation row in Inspector shows the triangle count, color selector, brush-radius control, and Clear button.

**Stale mesh warning:** If the display mesh is reloaded and stored triangle indices become invalid (any index ≥ mesh triangle count), the overlay row in Inspector shows: "Overlay references stale mesh — repaint required" in `signal` color. The overlay is not rendered. The annotation record is preserved so the user can repaint.

---

## Journey: J-A8. Inspect and delete an annotation

1. User opens the Inspector. The Annotations section lists 3 annotations.
2. User expands the "Rim boundary" closed curve row.
3. Sees: name (editable), length 112.4 mm, 8 control points.
4. Clicks the trash icon (visible on hover).
5. Inline confirmation appears: "Delete 'Rim boundary'? This cannot be undone. [ Cancel ]  [ Delete ]"
6. User clicks Delete.
7. The row slides out (220ms `slow` ease, height collapses to 0). The glyph and line disappear from the viewport. The count badge in the section header decrements.
8. `apiClient.deleteAnnotation` is called. `loadProject` refreshes the full state.

If the user clicks Cancel, the confirmation collapses back to the normal expanded row content.

---

## Full state machine for annotation placement

```
Idle (View mode)
  │
  ├─ [Enter Place mode] ──────────────────────────────────────────────┐
  │                                                                   │
  ▼                                                                   │
Type selector active (ContextStrip shows type buttons)               │
  │                                                                   │
  ├─ [Select type] → ─────────────────────────────────────────────┐  │
  │                                                               │  │
  ▼                                                               │  │
Placing (type active, 0 points so far)                            │  │
  │                                                               │  │
  ├─ [Click in view] → point added                                │  │
  │      • Landmark / Text Note: → Committed → back to Type sel.  │  │
  │      • Line (1 pt): stays in Placing                          │  │
  │      • Line (2 pts): → Committed → back to Type sel.          │  │
  │      • Closed curve (1-2 pts): stays in Placing               │  │
  │      • Closed curve (3+ pts): can commit                      │  │
  │                                                               │  │
  ├─ [Double-click / Enter, closed curve, 3+ pts] → Committed     │  │
  │                                                               │  │
  ├─ [Right-click during closed curve] → Cancel placement         │  │
  │   (removes in-progress points, returns to Type sel.)          │  │
  │                                                               │  │
  ├─ [Esc, 0 in-progress points] → ─────────────────────────────►─┘  │
  │   (exits Place mode, returns to View)                             │
  │                                                                   │
  ├─ [Esc, 1+ in-progress points] → Cancel placement                 │
  │   (removes in-progress points, returns to Type sel.)              │
  │                                                                   │
  └─ [Click different type while in-progress] → Inline confirm ──┐   │
       ├─ Keep placing → back to Placing                          │   │
       └─ Switch → cancel in-progress → new type active ─────────┘   │
                                                                      │
Committed (annotation written, in-progress cleared)                   │
  │                                                                   │
  ├─ One-shot types (landmark, text note) → back to Type sel. ───────┘
  │
  └─ Persistent types (line, curves, angle, plane, ROI, highlight)
       → back to Type sel. with same type pre-selected
```

---

## States and feedback for every annotation control

| State | Visual treatment | Notes |
|---|---|---|
| Type button idle | Ghost: transparent bg, `ink` icon and label | Matches `tool-idle` token |
| Type button active | Accent wash `#E8EFFF`, `accent` icon and label | Matches `tool-active` token |
| Type button disabled | `ink-muted` icon and label, `cursor: not-allowed` | Only Surface Highlight (no mesh): tooltip "Requires candidate mesh" |
| In-progress preview glyph | Accent 50% opacity, dashed connecting line | Not committed; can still be cancelled |
| Committed glyph, unselected | Accent full opacity, solid line | |
| Committed glyph, selected (clicked in viewport) | Accent + 2px white halo + scale 1.05 | Selection does not open Inspector — annotation is already listed; selection does highlight the row |
| Committed glyph, locked | Accent, lock cursor on hover | Cannot be dragged; tooltip "Unlock in Annotations panel" |
| Committed glyph, hidden | Not rendered | Panel row still shows with strikethrough eye icon |
| Annotation row, collapsed | Type icon `ink-muted`, name body, measurement meta `ink-muted`, actions on hover | |
| Annotation row, expanded | Type icon accent, `border-top` separator, structured fields | Chevron rotated 90° |
| Annotation row, hovered | Soft background lift `base` → `border` tint at 20% | Trash icon fades in |
| Measurement live (dragging) | `accent` text in ContextStrip right, 120ms update throttle | |
| Measurement ready (committed) | `ink-muted` text in panel row meta column | |
| Delete confirm inline | Replaces row body content; Cancel secondary, Delete signal-tinted | No modal |
| Inspector section — empty | 24px MapPin icon `ink-muted`, 2 lines body copy, Place CTA | |
| Inspector section — loading | Same as rest of Inspector (no spinner; data loads with project) | |

---

## Responsive behavior

Follows the same rules as the existing workbench:

- **Short viewport (height < 600px):** `SliceDock` collapses first. Annotation panel scrolls independently of the inspector. The `ContextStrip` annotation type selector wraps to two lines before truncating labels.
- **Narrow desktop (< 1024px):** `InspectorDrawer` becomes an overlay drawer (slides in from the right). The Annotations section is accessible via the drawer. The drawer open/close button is pinned to the right edge of `CanvasWorkspace`.
- **Touch-capable:** annotation placement type buttons in `ContextStrip` have minimum 44×44px hit targets. Drag-to-reposition control points uses a 12mm minimum touch radius. The in-progress cancel uses an explicit on-screen Cancel button in `ContextStrip` in addition to touch-Escape.

---

## Anti-goals (annotation-specific)

- No annotation toolbar floating above the viewport. All type selection lives in `ContextStrip`.
- No separate "Annotations panel" as an independent layout column. It is a section inside `InspectorDrawer`.
- No modal dialog for delete confirmation on annotations — inline row confirmation only.
- No measurement value stored separately from control points (it is always computed live).
- No annotation placement from the management surfaces (Cases view, etc.). Annotations belong to the canvas workflow only.
- No visual indicator on the viewport that shows "you are in annotation mode" beyond the standard `ContextStrip` active state and the preview glyph on cursor move. The mode rail's Place button being active is sufficient.
- No color outside the four fixed highlight colors for surface overlays. No free color picker.
- Do not show annotation controls when source anatomy is the active document — the entire Place annotation button and ContextStrip type selector are absent (not disabled). The InspectorDrawer section shows "Annotations require an active candidate."
