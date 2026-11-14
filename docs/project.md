# HackPrinceton (product name undecided)

Design system: **hack-princeton** (`DESIGN.md`) — dual-register Operate UI (Atlassian-like management + Figma/Blender canvas). Soft Medit chrome is retired as an anti-reference.

## Goal

A 3D design workspace for cranial vault reconstruction (cranioplasty): inspect anatomy, construct and edit candidate repairs, supply constraints, measure geometry, and work with an AI agent on the same case. Primary users are biomedical engineers; surgeons contribute clinical objectives and review. Shared capabilities for both groups—no role-specific product modes.

## Non-goals

- Universal bone / reconstructive-surgery platform
- Autonomous clinical decisions, manufacture, surgical deployment, or safety certification
- Predicting healing, complications, or postoperative appearance from shape labels alone
- Separate apps or hardcoded workflows by profession
- Treating bone-completion output as a finished manufacturable implant

## Architecture at a glance

Greenfield. Expected responsibilities (not yet implemented): canvas/case state, geometry tools, reconstruction generator, AI agent + tool use, evidence retrieval, persistence. Initial editor stack and UI system: see `PRODUCT.md` and `DESIGN.md`; remaining service boundaries land in feature specs.

Draft product intent (not yet an accepted feature folder): `hackprinceton_intent.md`.

## Sample data

Curated SkullBreak cases for manual inspection and later training: [`data/`](../data/README.md) (`samples/` committed; `raw/` zip gitignored). Inspection steps for humans and agents are in that README.

## Features

| Feature | Status | What it does |
|-|-|-|
| [3D bone editor (umbrella)](../features/3d-bone-editor/README.md) | retired | Former mega-feature; split into category folders below. Root intent/spec/plan are retired — do not implement against them. |
| [Software app model](../features/3d-bone-editor/software-app-model/intent.md) | shipped | Domain + persistent local CRUD for project / case / sample / candidate / revision. |
| [Business UI](../features/3d-bone-editor/business-ui/intent.md) | shipped | Atlassian-like management surfaces over the app model. |
| [Canvas workspace](../features/3d-bone-editor/canvas-workspace/intent.md) | shipped | Unified canvas tools + viewport behavior, GLB-first rendering, restore/apply integrity, and clean-state UI contracts. |
| [Business UI polish](../features/3d-bone-editor/business-ui-polish/intent.md) | shipped | Radix-first redesign of management surfaces with consistency hardening and UI-glitch regression tests. |

Status values: proposed, in progress, shipped, retired.

## Build order

1. Accept and build **software-app-model** (domain + disk/API CRUD) — foundation.
2. **business-ui** (management chrome on a real model).
3. **canvas-workspace** (canvas tools + viewport rendering and interaction integrity).
4. **business-ui-polish** (Radix-first management redesign + UI consistency hardening).
5. Do not reopen the retired umbrella plan under `features/3d-bone-editor/plan.md`.


## Design system

Agents building or changing UI / front-end must follow this system (also summarized in `AGENTS.md`):

| File | Role |
|-|-|
| [`PRODUCT.md`](../PRODUCT.md) | Product truth and brand commitments |
| [`DESIGN.md`](../DESIGN.md) | Visual tokens and Do’s/Don’ts (source of truth) |
| [`design-conventions.md`](design-conventions.md) | Management vs canvas conventions (R14) |
| [`.impeccable/design.json`](../.impeccable/design.json) | Shadows, focus, motion sidecar |
| [`.impeccable/reference/ui-styling-atlassian-b2b.jpg`](../.impeccable/reference/ui-styling-atlassian-b2b.jpg) | Management craft reference (density/feel) |
| [`.impeccable/reference/ui-styling-medit-soft.jpg`](../.impeccable/reference/ui-styling-medit-soft.jpg) | Anti-reference — do not follow |

Stack for the first editor shell is recorded in `PRODUCT.md` (Vite + React + TypeScript + Three.js).

## Glossary

| Term | Meaning |
|-|-|
| Cranial vault / cranioplasty | Designing a replacement for a missing section of the skull surrounding the brain |
| Reconstruction brief | Intended repair: objectives and case-specific constraints |
| Proposed design | Editable candidate repair geometry |
| Review result | Measurements, observations, and change requests tied to a revision |
