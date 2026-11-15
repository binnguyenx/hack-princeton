# Cranial

**An AI-assisted 3D workspace for designing cranial implants.** Built at HackPrinceton.

When part of a patient's skull is missing after trauma or surgery, the replacement implant has to be designed for that one person. Today an engineer does that largely by hand: reconstructing the missing bone, checking it against the anatomy and iterating with the surgeon. Cranial speeds this up with three pieces:

- **A machine-learning model that predicts the missing bone.** A 3D U-Net returns a starting implant as a new candidate on the case.
- **Measurement tools that work on the real scan,** in true millimetres from the scan's voxel spacing.
- **An AI agent that uses those tools.** It answers questions about the case, researches the literature and writes the case report. It never changes the design on its own.

> Cranial is a hackathon research prototype. Its output is a reviewable digital proposal, not a manufacturable implant or a clinical decision. Thresholds are workspace screening defaults, not validated clinical standards.

## Features

### 3D canvas
- Import a segmented skull scan (NRRD) and render it as a 3D model with its real spatial metadata.
- Synchronised axial, sagittal and coronal slice views, window/level controls and Slicer-style mouse navigation.
- Revision-scoped annotations: points, lines, angles, planes and regions of interest, in a shared 5-colour palette.
- Numeric rigid placement with preview. Every commit checks the expected revision, so concurrent edits can't silently overwrite each other.
- Projects, cases, samples, candidates and an immutable revision history, with Save/Open as a portable ZIP package.

### Predicted fix (machine learning)
- **Generate fix** sends the defective skull to the frozen 3D U-Net (`ml/cranial/`), served on AWS SageMaker async inference.
- On held-out SkullBreak parietotemporal cases the model scores **mean Dice 0.811** and **median HD95 2.49 mm**, with no failures in 20 cases.
- The predicted implant comes back as a new candidate with its statistics and ML provenance: model, checkpoint hash and freeze file. The model was trained on synthetic defects, so the result is labelled a geometry proposal.

### AI assistant
The assistant is a LangChain **Deep Agent** (LangGraph) running on **AWS Bedrock** by default, with Gemini as an option. It streams a live thinking trace, so you can watch each step.

| Ask | What happens |
|-|-|
| "Check the bone thickness around the defect." | It finds the defect, measures bone thickness along surface normals around the rim, and reports min/mean/max with PASS/FAIL against the 2.0 mm screening default. **Show in viewport** then flies the camera to the thinnest point and paints a red/amber/green heat map on the mesh. |
| "How large is the defect, in cm³?" | It measures volumes from the voxel mask and the verified spacing. |
| "Does this implant fit the defect rim?" | It measures rim gap, bone interference and onlay overlap against the policy tolerances. |
| "Check screw fixation: bone 1.5 mm, sinus clearance 6 mm, screw 4 mm." | Deterministic calculation tools compute the margins. The language model never does the arithmetic. |
| "PEEK or titanium? Cite your sources." | It searches a curated, cited cranioplasty knowledge base (`backend/ai/knowledge/`). |
| "Find recent papers on …" | It hands off to a **research subagent** that searches PubMed, arXiv and Wikipedia and returns cited links. |
| "Generate a case report PDF." | A **case-report subagent** plans the report. The browser captures the views, and the server builds the PDF. |

**Safety by design:**
- **Read-only tools.** The agent can inspect, measure and propose, but not modify meshes, volumes or files.
- **A human approves every change.** Proposed changes, such as moving an implant, appear as a card with **Accept** or **Discard**, and Accept is checked against the current revision.
- **Preflight check.** Before each turn, a check with no model call lists what can actually be measured for the selected object. The agent refuses honestly rather than guessing.
- **Grounded numbers.** Every number comes from a tool result, and the knowledge base labels its evidence (literature vs. policy default).

## Architecture

```
app/          React + TypeScript + Three.js editor (Vite). Radix Themes management UI.
backend/ai/   Python package `skullfix_ai`: FastAPI application API (/api), SQLite + NRRD storage,
              Deep Agent chat (/api/ai/chat/stream), geometry and clinical tools, knowledge base.
ml/cranial/   3D U-Net training, evaluation, prediction and SageMaker serving.
data/         Curated SkullBreak and MUG500+ sample cases (see data/README.md).
features/     Intent, spec and plan for every feature (the record of what was built and why).
docs/         Project index, AI setup and design conventions.
```

FastAPI is the single application backend. Vite proxies `/api` to it during development.

## Getting started

**Requirements:**
- Node.js **≥ 22.13** (app tests need jsdom on Node 22+)
- Python **≥ 3.11**
- AWS credentials with `bedrock:InvokeModel` for the assistant

```sh
# 1. Python backend
python3 -m venv .venv
.venv/bin/python -m pip install -e 'backend/ai[test]'

# 2. Configuration
cp backend/ai/.env.example backend/ai/.env
# Set AWS_REGION, AWS_PROFILE (or keys) and SKULLFIX_BEDROCK_MODEL.
# Optional, for Generate fix: CRANIAL_ENDPOINT_NAME and CRANIAL_INFERENCE_BUCKET.

# 3. Frontend
cd app && npm install && cd ..

# 4. Run FastAPI (:8000) and Vite (:5173) together
./scripts/dev.sh
```

Open http://localhost:5173. A demo case loads automatically.

To use Gemini instead of Bedrock, set `SKULLFIX_CHAT_PROVIDER=gemini` and `GOOGLE_API_KEY` in `.env`.

## Testing

```sh
# Backend: deterministic suites (no network or AWS needed)
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B backend/ai/tests/run_checks.py

# Agent eval harness: offline golden cases (add --live-bedrock to run against the real model)
.venv/bin/python -m pytest backend/ai/tests/eval_harness

# Frontend: unit tests, build, lint and browser journeys
cd app && npm test && npm run build && npm run lint
npm run test:browser
```

## Data and licence

Sample cases come from the SkullBreak and MUG500+ datasets, licensed **CC BY-NC-SA 4.0**. See [`data/README.md`](data/README.md) for layout and how to download the full archives. Do not use them commercially.

## Further reading

- [`docs/project.md`](docs/project.md): feature index and build order
- [`docs/ai/setup.md`](docs/ai/setup.md): backend setup, guarantees and test inventory
- [`ml/cranial/README.md`](ml/cranial/README.md): model training and evaluation
- [`PRODUCT.md`](PRODUCT.md) and [`DESIGN.md`](DESIGN.md): product truth and the design system
- [`AGENTS.md`](AGENTS.md): the workflow for coding agents working in this repo
