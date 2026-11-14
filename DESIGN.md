---
name: hack-princeton
description: Dense Atlassian-like B2B chrome for project/case management; Figma/Blender-clean chrome for the 3D canvas — Operate, never soft wellness UI.
colors:
  base: "#F4F5F7"
  elevated: "#FFFFFF"
  ink: "#172B4D"
  accent: "#0052CC"
  signal: "#DE350B"
  ink-muted: "#6B778C"
  border: "#DFE1E6"
typography:
  page-title:
    fontFamily: "system-ui, \"Segoe UI\", \"SF Pro Text\", sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  section:
    fontFamily: "system-ui, \"Segoe UI\", \"SF Pro Text\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "system-ui, \"Segoe UI\", \"SF Pro Text\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  meta:
    fontFamily: "system-ui, \"Segoe UI\", \"SF Pro Text\", sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "3px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  panel:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  tool-idle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  tool-active:
    backgroundColor: "#DEEBFF"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  button-danger:
    backgroundColor: "{colors.signal}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  viewport-frame:
    backgroundColor: "#EBECF0"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs}"
---

# hack-princeton design system

## Overview

**Agents:** This file is the required visual system for all UI / front-end work on this repo. Read it before implementing or redesigning any chrome. Pair with `docs/design-conventions.md` for management vs canvas interaction rules and `PRODUCT.md` for brand constraints. Do not introduce a competing palette, type ramp, or layout language. The product display name is undecided; do not invent or hard-code a consumer brand in UI chrome beyond what `PRODUCT.md` allows.

**hack-princeton** is a dual-register **Operate** system:

1. **Management** — Atlassian-like B2B density: tables, toolbars, dropdowns, filters, project/case headers.
2. **Canvas workspace** — Figma/Blender-like editor chrome: viewport-dominant, compact tool strips and context bars, quiet panels.

Soft Medit / large-radius neumorphic wellness UI is an **anti-reference**. Do not revive pill tool chips, 24px panel radii, or lavender soft-active fills.

Craft reference (management density/feel): `.impeccable/reference/ui-styling-atlassian-b2b.jpg`.  
Anti-reference (do not follow): `.impeccable/reference/ui-styling-medit-soft.jpg`.

Color strategy: **Restrained** neutrals + one blue accent. Main hierarchy: **Base → Ink → Accent → Signal**. `elevated` white and `border` are structural, not extra brand hues. `ink-muted` is secondary text.

Display-mesh quality (smooth medical surfaces vs blocky voxels) is a later rendering requirement; chrome here must not imply toy or game aesthetics.

## Colors

| Token | Hex | Hierarchy role |
|-|-|-|
| `base` | `#F4F5F7` | App ground behind panels and tables |
| `ink` | `#172B4D` | Primary text, icons, structure |
| `accent` | `#0052CC` | Primary buttons, links, focus, active tool tint |
| `signal` | `#DE350B` | Errors, blocking warnings, destructive confirm |

Supporting (not main brand colors):

- `elevated` `#FFFFFF` — panels, table surfaces, menus
- `ink-muted` `#6B778C` — secondary labels, timestamps, hints
- `border` `#DFE1E6` — hairline rules, table grid, input edges
- Active tool wash `#DEEBFF` (accent at low opacity)—selection/focus fill, not a fifth brand color

Do not use soft lavender (`#C9CBE8`) or purple-indigo gradients. Selection and primary actions use Accent; danger uses Signal plus text—not color alone.

## Typography

**System workhorse stack** for dense Operate UI: `system-ui`, Segoe UI, SF Pro Text, sans-serif. No Plus Jakarta Sans. No display serifs.

| Role | Size | Weight | Use |
|-|-|-|-|
| page-title | 1.25rem | 600 | Project/case page titles, workspace title |
| section | 0.875rem | 600 | Panel headers, table section labels, dialog titles |
| body | 0.875rem | 400 | Table cells, forms, ops feedback |
| meta | 0.75rem | 400 | Timestamps, IDs, shortcut hints, column secondary |

Prefer tabular figures in numeric columns when the stack supports them. Avoid all-caps tracking for section labels.

## Layout

### Management surfaces

Project list, case list, import, and related non-canvas screens:

1. Slim left nav or top app tabs for primary destinations
2. Page header with title + primary action (New / Import)
3. Toolbar row: search, Sort, Filter, overflow
4. Data table or structured list as the main content—not a card collage
5. Optional detail drawer or nested header for the selected project/case

Rules:

- Dense but readable padding (`spacing.sm`–`md`); borders separate regions more than soft shadows
- One job per region; marketing strips and wellness dashboards are forbidden
- Desktop-first; management may later tighten for laptop widths, but mobile is not first-class this phase

### Canvas workspace

In-case 3D editor:

1. Compact **top context bar** (project / case / sample / candidate)—VS Code–like tabs or breadcrumb + overflow, not soft pills
2. Compact **tool strip** (icon + short label) for included ops; modes, not toy chips
3. Dominant **viewport** (majority of the screen)
4. Optional **inspector** for selection, ownership, revision—quiet empty state

Rules:

- Viewport is the hero; chrome stays thin and structural
- Distinguish **navigation** (orbit/pan/zoom) from **edit** tools in placement and active styling
- No soft pill tool rails as the default editor chrome

## Elevation & Depth

Prefer **hairline borders** (`border`) and light modal/menu shadows. Tables use row rules, not stacked cards.

- Panels: 1px border; optional very light shadow for floating menus/modals only (see `.impeccable/design.json`)
- Active tools: accent wash + accent ink, not large soft shadows
- Viewport sits in a slightly darker well (`viewport-frame` ground); geometry provides drama, not glowing UI

No multi-layer dramatic shadows, neon glows, glassmorphism, or neumorphic wells.

## Shapes

- Controls / buttons / inputs: `rounded.sm` (3px)
- Panels / tables / viewport frame: `rounded.md`–`lg` (6–8px)
- `rounded.pill` only for rare status dots or count badges—not tool buttons
- Icon hit targets: square/rounded-sm wells, not circular soft blobs

Prefer sharp professional SaaS chrome over continuous “soft UI” curves.

## Components

**Panel** — Elevated + border; small radius; used for inspector, dialogs, management side panes.

**Button primary** — Accent fill, white label. Secondary — elevated + border + ink. Danger — Signal fill for destructive confirms only.

**Tool control** — Idle: transparent/elevated + ink. Active: accent wash + accent text. Never use Signal for “selected.”

**Table** — Header row with meta/section weight; body rows with hairline separators; row hover subtle Base tint; selected row accent wash.

**Dropdown / menu** — Elevated, border, light shadow; dense items at body size.

**Viewport frame** — Quiet well holding the Three.js canvas; minimal bezel.

**Feedback** — Neutral messages: ink / ink-muted. Failures: Signal + clear text; keep Signal rare.

**Icons** — Outline/medium stroke; resting ink or ink-muted; active on accent wash.

Wire all editor controls through the shared `ops/` layer; visual state must match operation state (selected tool, failed edit, unverified spatial metadata).

## Do's and Don'ts

**Do**

- Use Atlassian-like density on management: tables, toolbars, New/Sort/Filter/search
- Use Figma/Blender-like restraint on the canvas: thin chrome, strong viewport
- Use Accent for primary actions and active tools; Signal only for errors/destructive
- Keep nav vs edit distinguishable on the canvas
- Follow `docs/design-conventions.md` for shortcuts and management vs canvas patterns

**Don't**

- Follow the Medit soft anti-reference (large radii, pill chips, lavender soft-active, airy wellness cards)
- Build marketing/wellness dashboards (DNA heroes, supplement grids, fake clinical metrics)
- Default tool UI to pill chips or 24px rounded panels
- Add purple-to-indigo gradients or a fifth brand color
- Put clinical claims or decorative badges on chrome
