# HackPrinceton (product name undecided)

Design system: **hack-princeton** (`DESIGN.md`).

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
| [3D bone editor](../features/3d-bone-editor/intent.md) | in progress | Local projects with multiple samples, editable candidates, and recoverable revision history. Spec/plan draft; mechanical shell scaffolding in `app/`. |

Status values: proposed, in progress, shipped, retired.

## Build order

1. Promote product direction into accepted feature intents/specs via intent-spec-plan (starting from `hackprinceton_intent.md` as draft input).
2. Order concrete features once the first intents are accepted.


## Design system

Agents building or changing UI / front-end must follow this system (also summarized in `AGENTS.md`):

| File | Role |
|-|-|
| [`PRODUCT.md`](../PRODUCT.md) | Product truth and brand commitments |
| [`DESIGN.md`](../DESIGN.md) | Visual tokens and Do’s/Don’ts (source of truth) |
| [`design-conventions.md`](design-conventions.md) | 3D editor interaction conventions (R14) |
| [`.impeccable/design.json`](../.impeccable/design.json) | Shadows, focus, motion sidecar |
| [`.impeccable/reference/ui-styling-medit-soft.jpg`](../.impeccable/reference/ui-styling-medit-soft.jpg) | Styling feel reference (not layout) |

Stack for the first editor shell is recorded in `PRODUCT.md` (Vite + React + TypeScript + Three.js).

## Glossary

| Term | Meaning |
|-|-|
| Cranial vault / cranioplasty | Designing a replacement for a missing section of the skull surrounding the brain |
| Reconstruction brief | Intended repair: objectives and case-specific constraints |
| Proposed design | Editable candidate repair geometry |
| Review result | Measurements, observations, and change requests tied to a revision |
