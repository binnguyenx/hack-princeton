# Agent instructions

This repo is agent-agnostic. Cursor, Claude Code, Codex, Copilot, and similar tools should follow the same workflow.

## Onboard (read first)

1. Read `docs/project.md` for the product goal and feature index.
2. Read `PRODUCT.md` for durable product truth and `DESIGN.md` before any UI / front-end design or implementation.
3. For **major feature work** (new capability or behavior change), follow the **`intent-spec-plan`** skill. That skill is the **implementation flow for major agent runs** on this project: intent → spec → plan → build → close, with a human gate between each doc.
4. During the Build step, follow the **`tdd`** skill (red → green → refactor). Derive tests from the accepted `features/<name>/spec.md`.
5. Skip intent-spec-plan only for tiny work: typos, copy tweaks, bugfixes that restore already-documented behavior, throwaway spikes. Say so explicitly when you skip it.

## Project skills

Canonical skills live in `.agents/skills/` (Agent Skills format). Tool-specific skill dirs are symlinks to the same folders so discovery works natively:

| Skill | Path | When to use |
|-|-|-|
| `intent-spec-plan` | `.agents/skills/intent-spec-plan/` | Major features, behavior changes, writing/updating intent/spec/plan, verifying docs vs diff |
| `tdd` | `.agents/skills/tdd/` | Build step of a feature, test-first implementation, integration tests |

Before a major run: open the matching `SKILL.md` and follow it. Do not improvise a parallel process.

## Feature docs

- Each feature has `features/<name>/` with `intent.md` (what and why), `spec.md` (what must be true now), and `plan.md` (how it's being built).
- Before changing how a feature behaves, read its `spec.md`. When behavior changes, update `spec.md` in the same commit.
- `docs/project.md` lists every feature and the build order.
- Draft product notes may exist outside `features/` (e.g. `hackprinceton_intent.md`); promote into a feature folder via intent-spec-plan before treating them as accepted requirements.

## UI / front-end design system (required)

Design system name: **hack-princeton**. Product display name is undecided — do not ship “SkullFix” (or another brand) in UI chrome unless `PRODUCT.md` is updated.

Agents **must** use this system for any UI, front-end, layout, styling, or visual work. Do not invent a parallel palette, type ramp, or chrome style.

| File | Role |
|-|-|
| `PRODUCT.md` | Product truth, brand commitments, styling reference path |
| `DESIGN.md` | **Source of truth** for colors, typography, layout, elevation, shapes, components, Do’s/Don’ts |
| `.impeccable/design.json` | Shadows, focus rings, motion, icon stroke (sidecar tokens) |
| `docs/design-conventions.md` | Editor R14 rules: nav vs edit, shortcuts, selection/error states; points at `DESIGN.md` |
| `.impeccable/reference/ui-styling-medit-soft.jpg` | Styling **feel** reference only — not layout to copy |

Rules:

- Before writing or changing UI code (`app/src/ui/`, CSS, component chrome, viewport framing), read `DESIGN.md` and apply its tokens.
- At most four main colors with hierarchy: Base → Ink → Soft active → Signal. Do not add brand hues.
- Soft medical chrome; viewport-first Operate layout. Do not recreate the medit marketing dashboard (DNA hero, supplements, calendar, stat grids).
- Interaction conventions for the 3D editor live in `docs/design-conventions.md` (R14). Visual tokens stay in `DESIGN.md`.
- For broader design craft workflows, use the `impeccable` skill; it must still honor `DESIGN.md` / `PRODUCT.md`.

## Build / test / lint

Not established yet (greenfield). When commands exist, record them here with what a healthy run looks like.

## Conventions agents get wrong

- Do not code a major feature from chat alone. Files in `features/` are the record.
- Do not mark intent/spec/plan `accepted` unless the user said so.
- Do not invent scope; mark extras `(added)` in the spec for user acceptance.
- Do not freestyle UI colors, fonts, or layout when `DESIGN.md` exists — extend the system or ask before changing tokens.
- Do not commit or push unless the user asks.
