# SkullFix (HackPrinceton)

## Goal

A 3D design workspace for cranial vault reconstruction (cranioplasty): inspect anatomy, construct and edit candidate repairs, supply constraints, measure geometry, and work with an AI agent on the same case. Primary users are biomedical engineers; surgeons contribute clinical objectives and review. Shared capabilities for both groups—no role-specific product modes.

## Non-goals

- Universal bone / reconstructive-surgery platform
- Autonomous clinical decisions, manufacture, surgical deployment, or safety certification
- Predicting healing, complications, or postoperative appearance from shape labels alone
- Separate apps or hardcoded workflows by profession
- Treating bone-completion output as a finished manufacturable implant

## Architecture at a glance

Greenfield. Expected responsibilities (not yet implemented): canvas/case state, geometry tools, reconstruction generator, AI agent + tool use, evidence retrieval, persistence. Stack and service boundaries are undecided; define them in feature specs as they land.

Draft product intent (not yet an accepted feature folder): `hackprinceton_intent.md`.

## Features

| Feature | Status | What it does |
|-|-|-|
| — | — | No feature folders yet. Create via the `intent-spec-plan` skill. |

Status values: proposed, in progress, shipped, retired.

## Build order

1. Promote product direction into accepted feature intents/specs via intent-spec-plan (starting from `hackprinceton_intent.md` as draft input).
2. Order concrete features once the first intents are accepted.

## Glossary

| Term | Meaning |
|-|-|
| Cranial vault / cranioplasty | Designing a replacement for a missing section of the skull surrounding the brain |
| Reconstruction brief | Intended repair: objectives and case-specific constraints |
| Proposed design | Editable candidate repair geometry |
| Review result | Measurements, observations, and change requests tied to a revision |
