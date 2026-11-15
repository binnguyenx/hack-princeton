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

Current recovered development setup keeps Vite SQLite apiPlugin for CRUD and forwards only `/api/ai/chat` to the read-only FastAPI graph. Full FastAPI routing cutover remains a separate step; earlier cutover records are historical evidence, not the current recovery routing configuration. The migration target has one FastAPI/Python application backend serving the existing API and built React/TypeScript/Three.js frontend; Vite remains frontend tooling. The Python AI sandbox remains an isolated library/test environment, not another application backend or authority.

Draft product intent (not yet an accepted feature folder): `hackprinceton_intent.md`.

## Sample data

Curated SkullBreak cases for manual inspection and later training: [`data/`](../data/README.md) (`samples/` committed; `raw/` zip gitignored). Inspection steps for humans and agents are in that README.

## Features

| Feature | Status | What it does |
|-|-|-|
| [express-to-fastapi](../features/express-to-fastapi/intent.md) | shipped | Python application storage, FastAPI13 compatibility routes, opt-in proxy/built serving and disposable S13 verified. Shared16 contracts pass on each backend; live cutover and Express removal are verified; external recovery is retained7days. D1–D5 hardening remains proposed. |
| [ai-workspace-assistant](../features/ai-workspace-assistant/intent.md) | in progress | Accepted backend/state boundaries, structural schemas, authoritative SQLite application storage, and local artifact handling. The synchronous operation service and reconstruction mock are implemented; The live app has FastAPI CRUD APIs; Python has a read-only app workspace adapter. Read-only/fake-model LangGraph, metadata-only chat HTTP transport and restored Assistant panel integration are implemented (explicit fake or Gemini metadata-only model; active-document-scoped session-memory history, strict tool validation and grounded fact rendering, guarded disposable browser tests, no AI writes; real Gemini Flash-Lite smoke verified on synthetic data). Live mechanical foreground-volume measurement (T2) is bound over ApplicationRepository; sandbox/LangGraph measurement and AI mutations remain unbound. Bedrock, SSE, and checkpoint persistence remain unavailable. The retry lifecycle is proposed pending review; edit/inspect/compare/real-reconstruction contracts remain unresolved. |
| [measure-candidate](../features/measure-candidate/intent.md) | proposed | Earlier draft of the measurement milestone. Folded into `ai-workspace-assistant`. Do not implement separately. |
| [3D bone editor (umbrella)](../features/3d-bone-editor/README.md) | retired | Former mega-feature; split into category folders below. Root intent/spec/plan are retired — do not implement against them. |
| [Software app model](../features/3d-bone-editor/software-app-model/intent.md) | shipped | Domain + persistent local CRUD for project / case / sample / candidate / revision. |
| [Business UI](../features/3d-bone-editor/business-ui/intent.md) | shipped | Atlassian-like management surfaces over the app model. |
| [Canvas workspace](../features/3d-bone-editor/canvas-workspace/intent.md) | shipped | Unified canvas tools + viewport behavior, GLB-first rendering, object-level picking/highlight and rendered hide/show recovery, numeric rigid placement with preview/atomic expected-revision commits, restored-pointer integrity, portable ZIP Save/Open as a new project copy, and clean-state UI contracts. |
| [Canvas workspace Slicer relaunch](../features/3d-bone-editor/canvas-workspace-improve/intent.md) | shipped | Cross-reference Workbench: Slicer mouse nav, synchronized Axial/Sagittal/Coronal dock, Window/Level + Place modes, RAS truth, WebGL rebuild recovery. Advanced layer/keyboard/stereo parity deferred in plan Deviations. |
| [Business UI polish](../features/3d-bone-editor/business-ui-polish/intent.md) | shipped | Radix-first redesign of management surfaces with consistency hardening and UI-glitch regression tests. |

Status values: proposed, foundation accepted, in progress, shipped, retired.

## Build order

1. Keep `hackprinceton_intent.md` as draft product input. Do not treat it as an accepted feature spec.
2. The AI foundation acceptance is recorded in `features/ai-workspace-assistant/intent.md` and `spec.md`. They remain separate files and overall draft documents because the retry clarification and operation-specific contracts are still open. This index only reflects the recorded scope; it does not accept new requirements.
3. Do not start a second implementation from `features/measure-candidate/`. That draft is folded into the assistant spec.
4. Inside the 3D editor: **software-app-model** → **business-ui** → **canvas-workspace** → **business-ui-polish** → **canvas-workspace-improve** (Cross-reference Workbench). Do not reopen the retired umbrella plan under `features/3d-bone-editor/plan.md`.
5. Completed AI foundation plans remain under the feature's plans/ directory. The scoped fake-model graph is recorded in plans/langgraph-fake-model.md; provider, checkpoint, recovery and real-operation changes require their own preflight/plan and any outstanding acceptance.
6. Direct mechanical and AI mutation contracts remain separate from the read-only graph and isolated reconstruction mock. The mock is not real geometry and does not complete the measurement milestone.
7. The Express-to-FastAPI migration, disposable S13, local live cutover and Express removal are recorded in features/express-to-fastapi/. FastAPI is the application authority; the old runtime/backups are retained outside the repo. Preserve current UI contracts, acknowledged data and rollback requirements. Current main's management/canvas implementation remains the frontend source of truth.



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

The live UI uses backend/ai/src/skullfix_ai/api/routes/application.py and backend/ai/src/skullfix_ai/application/sqlite.py with Project → Case → Sample → Candidate → Revision and NRRD volumes. Python sandbox state is not app state. See docs/ai/app-integration.md for contract alignment and read-only LangGraph readiness.
