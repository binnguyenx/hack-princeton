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

Greenfield. Expected responsibilities (not yet implemented): canvas/case state, geometry tools, reconstruction generator, AI agent + tool use, evidence retrieval, persistence. The product-wide stack is still undecided. The AI owner's draft subproject is `backend/ai/`, described in `docs/ai/` and `features/ai-workspace-assistant/`. It does not define the 3D frontend or geometry algorithms.

Draft product intent (not yet an accepted feature folder): `hackprinceton_intent.md`.

## Features

| Feature | Status | What it does |
|-|-|-|
| [ai-workspace-assistant](../features/ai-workspace-assistant/intent.md) | proposed | AI requests on the shared workspace. After the scaffold and adapter boundary, a labeled reconstruction mock and the real measurement proceed independently. The first real integration milestone is one measurement shown in the frontend. Inspection, one edit, and comparison wait for their contracts. The mock does not complete that milestone. |
| [measure-candidate](../features/measure-candidate/intent.md) | proposed | Earlier draft of the measurement milestone. Folded into `ai-workspace-assistant`. Do not implement separately. |

Status values: proposed, in progress, shipped, retired.

## Build order

1. Keep `hackprinceton_intent.md` as draft product input. Do not treat it as an accepted feature spec.
2. Review `features/ai-workspace-assistant/intent.md` and `spec.md`. They may be updated in one round and stay separate files. Code only after both are explicitly accepted. The AI workflow exception is `docs/ai/workflow.md`. Do not treat this index as acceptance.
3. Do not start a second implementation from `features/measure-candidate/`. That draft is folded into the assistant spec.
4. Inside the AI feature, after the scaffold, shared schemas, and adapter boundary, the reconstruction mock and the real measurement are independent. The mock does not wait on mechanical tools or a measurement contract, and it does not complete the first real integration milestone. See `docs/ai/workflow.md`.

## Glossary

| Term | Meaning |
|-|-|
| Cranial vault / cranioplasty | Designing a replacement for a missing section of the skull surrounding the brain |
| Reconstruction brief | Intended repair: objectives and case-specific constraints |
| Proposed design | Editable candidate repair geometry |
| Review result | Measurements, observations, and change requests tied to a revision |
