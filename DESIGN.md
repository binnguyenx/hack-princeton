---
name: hack-princeton
description: Soft monochrome Operate UI — floating white islands on light gray, blue accent for strong actions; Atlassian grid/structure for management, quiet editor chrome for canvas.
colors:
  base: "#F0F2F5"
  elevated: "#FFFFFF"
  ink: "#1A1D21"
  accent: "#2F6BFF"
  signal: "#E5484D"
  ink-muted: "#8B929A"
  border: "#E4E6EA"
typography:
  page-title:
    fontFamily: "\"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  section:
    fontFamily: "\"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "\"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  meta:
    fontFamily: "\"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
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
    rounded: "{rounded.lg}"
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
    backgroundColor: "#E8EFFF"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  button-danger:
    backgroundColor: "{colors.signal}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  viewport-frame:
    backgroundColor: "#E8EAEE"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs}"
---

# hack-princeton design system

## Overview

**Agents:** This file is the required visual system for all UI / front-end work on this repo. Read it before implementing or redesigning any chrome. Pair with `docs/design-conventions.md` for management vs canvas interaction rules and `PRODUCT.md` for brand constraints.

**hack-princeton** is a dual-register **Operate** system with one shared visual skin:

1. **Structure (management)** — Atlassian-like **grid and business component layout**: tables, toolbars, filters, page headers, primary actions. Structure only — not Atlassian blue-box chrome.
2. **Canvas workspace** — Viewport-dominant editor chrome: compact tool strips, quiet panels, Figma/Blender restraint in density.

**Visual craft reference:** `.impeccable/reference/ui-styling-soft-monochrome.jpg` (soft floating islands, B/W/gray + blue accent).  
**Layout density reference:** `.impeccable/reference/ui-styling-atlassian-b2b.jpg` (tables/toolbars/hierarchy — structure only).  
**Anti-reference:** `.impeccable/reference/ui-styling-medit-soft.jpg` (clinical wellness / oversized pill theater — do not follow).

Color strategy: **Restrained** monochrome neutrals + one accent. Main hierarchy: **Base → Ink → Accent**. `elevated` white and `border` are structural. `signal` is rare danger only — not a brand color.

Pinned direction (2026-11-14): soft monochrome CAD Operate UI; accent blue only for strong actions; Atlassian retained as layout guideline.

## Colors

| Token | Hex | Hierarchy role |
|-|-|-|
| `base` | `#F0F2F5` | App ground behind floating panels |
| `ink` | `#1A1D21` | Primary text, icons, structure |
| `accent` | `#2F6BFF` | Primary buttons, focus, active tool tint |

Supporting (not main brand colors):

- `elevated` `#FFFFFF` — panels, tables, menus, islands
- `ink-muted` / `ink-subtle` — secondary labels, timestamps, hints
- `border` `#E4E6EA` — hairline rules, input edges
- Active wash `#E8EFFF` — selection/focus fill from accent at low opacity
- `signal` `#E5484D` — errors / destructive confirms only

Do not add purple gradients, lavender fills, or extra brand hues. Rest of the UI stays black / white / gray.

### Annotation palette (canvas only)

Annotation geometry needs to be told apart on the skull, so annotations get a small categorical palette. These colours are allowed **only** for annotation geometry in the 3D canvas and slice views, their colour swatches (placement strip, annotation list), and case-report captures. They are never used for app chrome, buttons, text or status. `signal` stays reserved for danger.

| Key | Hex | Default for |
|-|-|-|
| `accent` | `#2F6BFF` | every annotation type except ROI |
| `amber` | `#F59E0B` | ROI |
| `emerald` | `#10B981` | — |
| `rose` | `#F43F5E` | — |
| `slate` | `#64748B` | — |

Source of truth in code: `app/src/domain/annotationPalette.ts`. Hover and selection emphasis lighten an annotation's own colour; they never switch it to another hue.

## Typography

Geometric system workhorse: SF Pro Text / Segoe UI / system-ui. Hierarchy by **weight**, not color noise.

| Role | Size | Weight | Use |
|-|-|-|-|
| page-title | 1.25rem | 600 | Project/case titles |
| section | 0.875rem | 600 | Panel headers, dialog titles |
| body | 0.875rem | 400 | Tables, forms, ops feedback |
| meta | 0.75rem | 400 | IDs, shortcuts, secondary |

## Layout

### Management surfaces

Keep Atlassian **information architecture**:

1. Slim left nav + main content
2. Page header with title + primary action
3. Toolbar: search, Sort, Filter
4. Data table / structured list as main content
5. Optional detail drawer

Rules:

- Floating shell: padded app ground; sidebar and main as rounded white islands
- Soft shadows + hairline borders for depth; generous gutters between islands
- Dense enough for technical users; not rigid legacy enterprise chrome
- No marketing/wellness dashboard kits

### Canvas workspace

1. Compact top context bar
2. Compact mode rail + options strip
3. Dominant viewport
4. Quiet inspector / slice dock

Viewport stays the hero; chrome is soft but thin.

## Elevation & Depth

Soft diffuse charcoal-tinted shadows (see `.impeccable/design.json`). Panels float on Base. Prefer shadow **or** border for a surface — hairline border + soft panel shadow is allowed for islands matching the craft reference.

No neon glow, heavy glassmorphism, or multi-layer theatrical shadows.

## Shapes

- Controls / buttons / inputs: `rounded.sm` (8px)
- Cards / view frames: `rounded.md` (12px)
- Shell islands (sidebar, main): `rounded.lg` (16px)
- `rounded.pill` only for rare status dots / count badges — not tool rails

## Motion

Personality: **Corporate / Premium** calm responsiveness (LottieFiles motion-design skill).

| Token | Value | Use |
|-|-|-|
| Signature easing | `cubic-bezier(0.2, 0, 0, 1)` | ~80% of transitions |
| Fast | 120ms | hover, press, tool toggle |
| Normal | 220ms | panel / drawer / shadow lift |
| Slow | 360ms | shell collapse, major layout |

Patterns: button press scale ~0.98; card/panel hover shadow lift; sidebar width + fade; no bounce/overshoot. Honor `prefers-reduced-motion`.

## Components

**Panel** — White island, lg radius, soft panel shadow, quiet border.

**Button primary** — Accent fill, white label (strong action only). Secondary — white + border + ink. Danger — Signal only for destructive confirms.

**Tool control** — Idle ghost; active accent wash + accent ink.

**Table** — Structured business grid (Atlassian layout). Soft row hover; selected row accent wash.

**Viewport frame** — Quiet well; geometry provides drama.

**Icons** — Thin outline stroke; resting ink-muted; active on accent wash.

## Do's and Don'ts

**Do**

- Keep management as tables/toolbars/filters (Atlassian structure)
- Keep canvas viewport-first with compact chrome
- Use Accent only for strong actions and active tools
- Use soft floating containers and calm motion
- Follow `docs/design-conventions.md` for nav vs edit behavior

**Don't**

- Revert to rigid Atlassian blue-box chrome as the visual skin
- Follow the Medit wellness anti-reference (oversized pill theater, clinical marketing)
- Scatter Accent across non-action surfaces
- Add purple/lavender brand fills or decorative glass clutter
- Break component layout or application logic for visual polish
