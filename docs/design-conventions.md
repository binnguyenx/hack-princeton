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

### Layout

- One **project workspace** window at a time.
- **Sidebar navigator:** Cases → Samples → Candidates; New case / Import sample / New candidate / Open document.
- **Top taskbar:** one tab per **open sample or candidate** (not per case). Tab label = name + kind. Switch tab retargets viewport + inspector; close tab does not delete data.
- Viewport occupies the majority of the remaining screen.
- **Tool strip:** visible controls for included ops only (`select`, camera/nav, visibility, inspection plane, create candidate, transform, restore revision, save/open). Icon + short label; rectangular active state from `DESIGN.md`.
- **Inspector:** selection, ownership, spatial verification, candidate revisions, Apply/Cancel when an edit tool is armed.
- No marketing dashboard modules on the canvas.
- Sample tabs are view-only for geometry; candidate tabs are the edit targets.

### Navigation vs editing

| Mode | Examples | Geometry effect | Active chrome |
|-|-|-|-|
| Navigate / inspect | Orbit, pan, zoom, visibility, inspection plane | None | Accent wash only while that view tool is selected; never write revisions |
| Edit | Create candidate, transform Apply, restore revision | Yes, via `ops/` | Accent wash on the edit tool; Apply commits a revision |

Camera drag must not invoke edit ops. If an edit tool is active, require an explicit Apply (or equivalent) before history changes—cancel leaves state unchanged (R9).

### Shortcuts (minimal set)

Behavior while typing in text fields: shortcuts that use plain letter keys are **disabled**; modifiers (⌘/Ctrl) still work.

| Shortcut | Action |
|-|-|
| `Space` + drag / middle-drag | Pan (navigate) |
| Drag on viewport (navigate mode) | Orbit |
| Scroll | Zoom |
| `V` | Select object |
| `T` | Transform candidate (edit tool; Apply separate) |
| `Esc` | Cancel in-progress edit / clear tool to select |
| `⌘/Ctrl+S` | Save project |
| `⌘/Ctrl+Z` | Restore previous revision when supported by ops (no silent geometry mutate outside ops) |

Exact binding implementation must call the same `ops/` functions as the visible buttons.

### Selection, tool, and error states

- **Idle tool:** transparent or elevated control, ink label/icon.
- **Active tool:** accent wash + accent ink; focus ring from design sidecar.
- **Selected object:** viewport highlight + inspector identity; do not use Signal.
- **Unverified spatial metadata:** ink warning copy; do not mark sample verified; optional Signal only if blocking.
- **Failed / rejected op:** show failure to caller; Signal + text; leave last completed candidate state intact.
- **Save failure:** never report success; keep session editable; Signal + clear message.

## R14 checklist

Before UI chrome ships, review every visible control against `DESIGN.md` colors/type/radius and the tables above (spec S7). Reject any soft-pill / Medit-soft regression on either register.
