# Design conventions (3D bone editor)

**Agents:** Use this file with [`DESIGN.md`](../DESIGN.md) for all 3D-editor UI. Tokens and look live in `DESIGN.md`; nav-vs-edit, shortcuts, and state behavior live here. Onboard reminder: `AGENTS.md` § UI / front-end design system.

**Visual system of record:** [`DESIGN.md`](../DESIGN.md) (tokens + Do’s/Don’ts).  
**Sidecar:** [`.impeccable/design.json`](../.impeccable/design.json) (shadows, focus, motion).  
**Styling reference (feel only):** [`.impeccable/reference/ui-styling-medit-soft.jpg`](../.impeccable/reference/ui-styling-medit-soft.jpg).

This file satisfies feature **R14** for interaction and control mapping. Do not fork a second palette here—change `DESIGN.md` instead.

## Layout (editor)

- Viewport occupies the majority of the screen.
- Tool rail: visible controls for included ops only (`select`, camera/nav, visibility, inspection plane, create candidate, transform, restore revision, save/open).
- Inspector (optional): selection, ownership, current revision—empty state stays quiet.
- No marketing dashboard modules.

## Navigation vs editing

| Mode | Examples | Geometry effect | Active chrome |
|-|-|-|-|
| Navigate / inspect | Orbit, pan, zoom, visibility, inspection plane | None | Soft-active only while that view tool is selected; never write revisions |
| Edit | Create candidate, transform Apply, restore revision | Yes, via `ops/` | Soft-active on the edit tool; Apply commits a revision |

Camera drag must not invoke edit ops. If an edit tool is active, require an explicit Apply (or equivalent) before history changes—cancel leaves state unchanged (R9).

## Shortcuts (minimal set)

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

## Selection, tool, and error states

- **Idle tool:** elevated chip, ink label/icon.
- **Active tool:** `soft-active` fill; focus ring from design sidecar.
- **Selected object:** viewport highlight + inspector identity; do not use Signal.
- **Unverified spatial metadata:** ink warning copy; do not mark sample verified; optional Signal only if blocking.
- **Failed / rejected op:** show failure to caller; Signal accent + text; leave last completed candidate state intact.
- **Save failure:** never report success; keep session editable; Signal + clear message.

## R14 checklist

Before UI chrome ships, review every visible control against `DESIGN.md` colors/type/radius and the tables above (spec S7).
