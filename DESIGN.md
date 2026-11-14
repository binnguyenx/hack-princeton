---
name: SkullFix
description: Soft, calm chrome for a cranial reconstruction 3D editor — viewport first, marketing-dashboard never.
colors:
  base: "#F4F5F7"
  elevated: "#FFFFFF"
  ink: "#1A1B1F"
  soft-active: "#C9CBE8"
  signal: "#FF9F64"
  ink-muted: "#5C5F6A"
typography:
  display:
    fontFamily: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  panel:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  tool-idle:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tool-active:
    backgroundColor: "{colors.soft-active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  viewport-frame:
    backgroundColor: "{colors.base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
---

# SkullFix Design System

## Overview

**Agents:** This file is the required visual system for all UI / front-end work. Read it before implementing or redesigning any chrome. Pair with `docs/design-conventions.md` for 3D-editor interaction rules and `PRODUCT.md` for brand constraints. Do not introduce a competing palette, type ramp, or layout language.

SkullFix chrome borrows the **soft medical UI feel** of the medit-style reference (light ground, large radii, quiet elevation, geometric sans) and applies it to an **Operate** surface: a 3D bone editor. The case viewport is the hero. UI is sparse scaffolding—tools, selection state, and honest errors—not a wellness dashboard.

Styling reference (feel only): `.impeccable/reference/ui-styling-medit-soft.jpg`.

Four main colors only, with hierarchy: **Base → Ink → Soft active → Signal**. `elevated` white is a Base tint for panels, not a fifth brand color. `ink-muted` is Ink at reduced emphasis for metadata.

## Colors

| Token | Hex | Hierarchy role |
|-|-|-|
| `base` | `#F4F5F7` | App ground / chrome behind panels |
| `ink` | `#1A1B1F` | Primary text, resting icons, structure |
| `soft-active` | `#C9CBE8` | Selected tool, focus chip, quiet brand fill |
| `signal` | `#FF9F64` | Errors, blocking warnings, sparse attention |

Supporting (not main brand colors):

- `elevated` `#FFFFFF` — panels, cards, tool rails on Base
- `ink-muted` `#5C5F6A` — secondary labels, timestamps, hints

Do not introduce additional hues (greens, bright blues, gradients). Selection uses Soft active; danger/attention uses Signal plus text—not color alone.

## Typography

**Plus Jakarta Sans** (geometric, airy). Fallbacks: Segoe UI, system sans.

| Role | Size | Weight | Use |
|-|-|-|-|
| display | 1.5rem | 600 | Rare: project/case title in chrome |
| title | 1.125rem | 600 | Panel headers, dialog titles |
| body | 0.9375rem | 500 | Primary UI copy, ops feedback |
| label | 0.8125rem | 500 | Tool names, metadata, shortcuts |

Keep letter-spacing slightly open on labels. Avoid dense all-caps and heavy black weights that fight the soft chrome.

## Layout

Viewport-first Operate layout:

1. Thin top or side tool rail (shared ops as visible controls)
2. Dominant 3D viewport (majority of the first screen)
3. Optional narrow inspector for selection/ownership/revision—collapsed by default when empty

Rules:

- Generous padding (`spacing.md`–`lg`); prefer empty Base over extra cards
- One job per chrome region; no marketing strips, calendars, or stat grids
- Desktop-first for the editor; mobile is not a first-class target this phase
- Distinguish **navigation** (orbit/pan/zoom) from **edit** tools in placement and active styling

## Elevation & Depth

Soft neumorphic-adjacent depth—raised panels on Base, never harsh borders as the primary separator.

- Default panel shadow: very soft, large blur, low opacity (see `.impeccable/design.json`)
- Active Soft-active controls may use a slightly stronger soft shadow
- Viewport sits in a Base well; geometry provides the visual drama, not glowing UI

No multi-layer dramatic shadows, neon glows, or glassmorphism stacks.

## Shapes

- Panels / viewport frame: `rounded.lg` (24px)
- Compact controls: `rounded.md` (16px)
- Tool chips / selection pills: `rounded.pill`
- Icon hit targets: circular soft wells (thin-line icons)

Prefer continuous curves over sharp engineering-CAD chrome.

## Components

**Panel** — Elevated surface for inspector/tool groups; large radius; quiet shadow.

**Tool chip** — Idle: elevated + ink. Active: soft-active fill + ink. Never use Signal for “selected.”

**Viewport frame** — Base inset holding the Three.js canvas; minimal chrome bezel.

**Feedback** — Success/neutral messages use ink/ink-muted on elevated. Failures use Signal fill or Signal left-edge + clear text; keep Signal rare.

**Icons** — Outline/thin stroke; resting state ink or ink-muted; active state sits on Soft active well.

Wire all controls through the shared `ops/` layer; visual state must match operation state (selected tool, failed edit, unverified spatial metadata).

## Do's and Don'ts

**Do**

- Keep the 3D case visually dominant; chrome stays soft and secondary
- Use Soft active for selection/focus and Signal only for attention/errors
- Match nav vs edit: camera tools must not share the same active treatment as geometry edits without a clear mode cue
- Load Plus Jakarta Sans once; use the four type roles above

**Don't**

- Recreate the medit dashboard layout (DNA hero, supplements, weekly calendar, multi-card marketing)
- Add a fifth brand color or purple-to-indigo gradients beyond Soft active
- Use dense borders, hairline “broadsheet” layouts, or dark-mode default
- Put clinical claims, fake metrics, or decorative badges on the editor chrome
