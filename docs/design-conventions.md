# Design conventions (3D bone editor)

**Agents:** Use the **hack-princeton** system ([`DESIGN.md`](../DESIGN.md)) for all UI. Tokens and look live in `DESIGN.md`; management vs canvas behavior, nav-vs-edit, and shortcuts live here. Onboard reminder: `AGENTS.md` § UI / front-end design system. Product display name is undecided.

**Visual system of record:** [`DESIGN.md`](../DESIGN.md) (tokens + Do’s/Don’ts).  
**Sidecar:** [`.impeccable/design.json`](../.impeccable/design.json) (shadows, focus, motion).  
**Craft reference (management):** [`.impeccable/reference/ui-styling-atlassian-b2b.jpg`](../.impeccable/reference/ui-styling-atlassian-b2b.jpg).  
**Anti-reference (do not follow):** [`.impeccable/reference/ui-styling-medit-soft.jpg`](../.impeccable/reference/ui-styling-medit-soft.jpg).

This file satisfies feature **R14** for interaction and control mapping. Do not fork a second palette here—change `DESIGN.md` instead.

## Component policy (management surfaces)

- Use **Radix Themes first** for management-shell composition (`Table`, `Grid`, `Flex`, `Tabs`, `TextField`, `Button`, `Badge`, `Card`).
- Use **Radix Primitives** when Themes lacks a needed behavior primitive.
- Do not introduce hand-rolled visual primitives when a Radix Themes component can provide equivalent structure.
- Keep custom CSS focused on app-level layout and canvas-specific surfaces, not one-off management widgets.

Dual register (from the 2026-11-14 intent amendment):

| Register | Surfaces | Craft bar |
|-|-|-|
| **Management** | Project/case lists, create/open, import, tables, filters, dropdowns | Atlassian-like B2B |
| **Canvas** | In-case 3D workspace | Figma / Blender / VS Code–like editor chrome |

Soft pill tool rails are **forbidden** as the default editor chrome.

Behavior details: `features/3d-bone-editor/spec.md` (R14, R26–R34). Patterns below are the interaction bar.

## Management conventions

- **Projects home** is the primary management surface: project table, New project, Open package, search/sort.
- Page header: title + primary action.
- Toolbar: search, Sort, Filter, overflow—text + icon, not pill clusters.
- Main content is a **data table or structured list** (columns, row selection, dense meta). Cards only when they contain a real interaction that needs a container.
- Dropdowns and menus: bordered elevated surfaces; keyboard-friendly; clear destructive vs primary actions.
- Empty states: short ink copy + one primary CTA; no wellness illustration kits.

## Canvas conventions

The detailed journeys and component ownership contract live in
`features/3d-bone-editor/canvas-workspace-improve/ui-journeys.md`.

### Structure

- Default to a dominant **3D view** with a compact synchronized
  **Axial/Sagittal/Coronal slice dock** when volume data exists.
- Keep document tabs and layout choice in the top document bar.
- Keep only pointer modes—View, Window/Level, Place—in the left mode rail.
- Put active-mode options in one contextual strip above the active view.
- Attach Center, Reset, projection, direction, link, maximize, ruler, and
  display controls to the `ViewFrame` they affect.
- Open the inspector only for selection or operation review. With neither,
  return its width to the viewport.
- Keep compact RAS coordinates and recovery state in the bottom status strip;
  expand LPS and IJK on request.
- No marketing modules or management-table chrome inside the canvas.

### Placement rule

| Scope | Primary home | Examples |
|-|-|-|
| Workspace | Document bar | tabs, layout, save/close, command search |
| Pointer mode | Mode rail | View, Window/Level, Place |
| Active mode | Context strip | preset, record type, one-shot/persistent, Apply/Cancel |
| View | ViewFrame header/controller | Center, Reset, A/P/L/R/S/I, projection, link, ruler |
| Object | Inspector drawer | visibility, opacity, metadata, revision |
| Global feedback | Status strip | RAS, pending, WebGL, last result, recovery |

A command has one persistent primary control. Menus and command search may
mirror it for discovery; another toolbar may not duplicate it.

### Navigation, inspection, and editing

| Interaction | Effect | Revision write |
|-|-|-|
| Rotate, roll, pan, zoom, Center, Reset | Camera only | Never |
| Crosshair and slice offset | Patient-space inspection state | Never |
| Window/Level and display settings | Render/display state | Never |
| Place | Draft record at patient coordinate | Only on explicit commit |
| Candidate editing | Draft candidate state | Only on explicit Apply |

Camera input remains available while another mode is active through the
documented Slicer modifiers. Navigation never silently completes placement or
editing.

### Input conventions

- Use the Slicer-standard bindings in the active feature spec rather than the
  former Blender-first defaults.
- View-scoped shortcuts require an active view; hover alone does not activate.
- Plain-key shortcuts do not fire while typing. Displayed bindings match the
  current platform.
- One-button mouse and trackpad substitutions remain available.
- Touch users receive direct active-view rotate, pan, zoom, Center, and Reset
  controls; hover is never required.

### State and feedback

- **Idle mode:** transparent/elevated control with Ink label and icon.
- **Active mode/view:** Accent wash + Accent ink + visible focus treatment.
- **Selected object:** viewport highlight and inspector identity; never Signal.
- **Disabled:** remains visible only when the reason teaches a prerequisite;
  tooltip and accessible description name it.
- **Pending:** owned by the originating control; duplicate input is blocked.
- **Failed:** explain beside the affected view/control, preserve the last valid
  frame, and offer one recovery action.
- **All hidden:** show “All objects are hidden” and **Show all**.
- **Render failure:** show **Rebuild View** without changing committed data.
- Toasts may echo completion but cannot carry required instructions or be the
  only proof that an action worked.

## R14 checklist

Before UI chrome ships, review every visible control against `DESIGN.md` colors/type/radius and the tables above (spec S7). Reject any soft-pill / Medit-soft regression on either register.
