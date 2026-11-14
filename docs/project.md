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

Initial editor stack and UI system are described in `PRODUCT.md` and `DESIGN.md`. The AI/backend subproject is `backend/ai/`, described in `docs/ai/` and `features/ai-workspace-assistant/`; it does not define the 3D frontend or geometry algorithms. Remaining service boundaries land in feature specs.

The AI backend owns application state, immutable revisions, and the shared operation-service boundary. Its interfaces do not establish teammate approval of real geometry or browser protocols.

Draft product intent (not yet an accepted feature folder): `hackprinceton_intent.md`.

## Sample data

Curated SkullBreak cases for manual inspection and later training: [`data/`](../data/README.md) (`samples/` committed; `raw/` zip gitignored). Inspection steps for humans and agents are in that README.

## Features

| Feature | Status | What it does |
|-|-|-|
| [ai-workspace-assistant](../features/ai-workspace-assistant/intent.md) | in progress | Accepted backend/state boundaries, structural schemas, authoritative SQLite application storage, and local artifact handling. The synchronous operation service and reconstruction mock are implemented; The live app already has Express CRUD APIs; Python has a read-only app workspace adapter. AI API/graphs/model integrations and live AI mutations remain unimplemented. The retry lifecycle is proposed pending review; real measurement, browser geometry, editing, inspection, and comparison contracts remain unresolved. |
| [measure-candidate](../features/measure-candidate/intent.md) | proposed | Earlier draft of the measurement milestone. Folded into `ai-workspace-assistant`. Do not implement separately. |
| [3D bone editor](../features/3d-bone-editor/intent.md) | in progress | Local projects with multiple samples, editable candidates, and recoverable revision history. Spec/plan draft; mechanical shell scaffolding in `app/`. |

Status values: proposed, foundation accepted, in progress, shipped, retired.

## Build order

1. Keep `hackprinceton_intent.md` as draft product input. Do not treat it as an accepted feature spec.
2. The AI foundation acceptance is recorded in `features/ai-workspace-assistant/intent.md` and `spec.md`. They remain separate files and overall draft documents because the retry clarification and operation-specific contracts are still open. This index only reflects the recorded scope; it does not accept new requirements.
3. Do not start a second implementation from `features/measure-candidate/`. That draft is folded into the assistant spec.
4. The current `plan.md` is the completed operation-service/mock record; completed fixture, schema, and storage plans are archived under the feature's `plans/` directory. Write a separate plan before graph, API, model, or real-adapter coding. Review the proposed retry requirements before including them.
5. Inside the AI feature, after shared schemas and storage, the synchronous operation service and reconstruction mock are available for the next graph/API slice. The reconstruction mock and real measurement then remain independent. The mock does not wait on mechanical tools or a measurement contract, and it does not complete the first real integration milestone. See `docs/ai/workflow.md`.


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

## Current integration authority

The live UI uses app/server/api.ts and app/server/storageSqlite.ts with Project → Case → Sample → Candidate → Revision and NRRD volumes. Python sandbox state is not app state. See docs/ai/app-integration.md for contract alignment and read-only LangGraph readiness.
