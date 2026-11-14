# Agent instructions

This repo is agent-agnostic. Cursor, Claude Code, Codex, Copilot, and similar tools should follow the same workflow.

## Onboard (read first)

1. Read `docs/project.md` for the product goal and feature index.
2. Read `PRODUCT.md` for durable product truth and `DESIGN.md` before any UI / front-end design or implementation.
3. For **major feature work** (new capability or behavior change), follow the **`intent-spec-plan`** skill. That skill is the **implementation flow for major agent runs** on this project: intent → spec → plan → build → close, with a human gate between each doc.
4. During the Build step, follow the **`tdd`** skill (red → green → refactor). Derive tests from the accepted `features/<name>/spec.md`.
5. After Build, run **Close** before ending the run (see **Close (required)** below). A major run is not finished when the code compiles; it is finished when Close reports.
6. Skip intent-spec-plan only for tiny work: typos, copy tweaks, bugfixes that restore already-documented behavior, throwaway spikes. Say so explicitly when you skip it.

AI/backend work under `backend/ai/`, `docs/ai/`, and `features/ai-workspace-assistant/` follows [docs/ai/workflow.md](docs/ai/workflow.md). Intent and spec stay separate. Foundation schemas, application storage, the synchronous operation service, and reconstruction mock are implemented; future graph/API/model work requires its own plan and preflight. Newly proposed requirements require review before implementation. Other features keep a human gate between each document.

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
- **`features/3d-bone-editor/` is an umbrella:** root `intent.md` / `spec.md` / `plan.md` are **retired**. Active units are category subfolders (`software-app-model`, `business-ui`, `canvas-workspace`) — see `features/3d-bone-editor/README.md`. Do not implement against the retired root docs.

## Sample / training data

- Layout and **how to inspect** (human + agent): [`data/README.md`](data/README.md).
- Curated cases live in `data/samples/` (committed). Full archives in `data/raw/` (zip gitignored; re-download via `data/raw/README.md`).
- License CC BY-NC-SA 4.0. Do not treat samples as the app project store until `features/3d-bone-editor/` says so.

## Close (required)

Major work is **not done** until Close finishes. Tests are the verification interface; docs are the handoff interface for the next agent.

Do this before your final reply on any major run (new capability, behavior change, or build against an accepted `plan.md`):

1. Run the plan’s **Proof** tests/commands and report real output (not remembered results).
2. Run `python .agents/skills/intent-spec-plan/scripts/check_features.py .`
3. Follow `.agents/skills/intent-spec-plan/references/verification.md`: trace intent → spec → plan → diff; flag stray ideas and unplanned files for a human decision.
4. Update docs in the same change: `spec.md` (Where it lives, Last updated, Decisions if needed), `plan.md` (status → `done`, Deviations), `docs/project.md` index row, and `AGENTS.md` only if a project-wide command/convention appeared.
5. End with the Close report from verification.md §5 (`Needs your decision` / `Checks` / `Docs updated`).

Tiny work that skipped intent-spec-plan does not need Close — say that explicitly. Cursor’s project `stop` hook (`.cursor/hooks/feature-close-stop.py`) will auto-prompt Close when code changed alongside feature docs or an accepted plan without a Close report; still run Close yourself so the hook never has to.

## UI / front-end design system (required)

Design system name: **hack-princeton**. Product display name is undecided — do not ship “SkullFix” (or another brand) in UI chrome unless `PRODUCT.md` is updated.

Agents **must** use this system for any UI, front-end, layout, styling, or visual work. Do not invent a parallel palette, type ramp, or chrome style.

| File | Role |
|-|-|
| `PRODUCT.md` | Product truth, brand commitments, craft reference path |
| `DESIGN.md` | **Source of truth** for colors, typography, layout, elevation, shapes, components, Do’s/Don’ts |
| `.impeccable/design.json` | Shadows, focus rings, motion, icon stroke (sidecar tokens) |
| `docs/design-conventions.md` | R14: management vs canvas, nav vs edit, shortcuts, selection/error states; points at `DESIGN.md` |
| `.impeccable/reference/ui-styling-atlassian-b2b.jpg` | Management craft reference (density/feel) |
| `.impeccable/reference/ui-styling-medit-soft.jpg` | Anti-reference — do not follow |

Rules:

- Before writing or changing UI code (`app/src/ui/`, CSS, component chrome, viewport framing), read `DESIGN.md` and apply its tokens.
- Dual-register Operate UI: Atlassian-like B2B on management surfaces; Figma/Blender-clean chrome on the 3D canvas. Soft Medit / pill / large-radius wellness chrome is rejected.
- At most four main colors with hierarchy: Base → Ink → Accent → Signal. Do not add brand hues or revive soft-active lavender.
- Management may use tables/toolbars; still ban marketing/wellness dashboard kits. Canvas stays viewport-first with compact editor chrome.
- Management surfaces are **Radix Themes-first** (`@radix-ui/themes`) with Radix primitives only where Themes lacks a required behavior primitive.
- Interaction conventions live in `docs/design-conventions.md` (R14). Visual tokens stay in `DESIGN.md`.
- For broader design craft workflows, use the `impeccable` skill; it must still honor `DESIGN.md` / `PRODUCT.md`.

## Build / test / lint

Run every deterministic backend suite from the repo root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
```

A healthy run reports `Ran 64 tests` and `OK`. It includes storage, artifact, schema, fixture, operation-service, mock-adapter, and legacy regressions. No AWS/network/HTTP service is required. See `docs/ai/setup.md` for guarantees and recovery limits.

From the repo root, run storage and artifact tests:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/storage/test_local_artifacts.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/storage/test_sqlite_storage.py
```

Healthy runs print `Ran 4 tests` / `Ran 14 tests` and `OK`. They verify local storage invariants, not operation orchestration or retry recovery.

Run the shared-schema unit tests:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/schemas/test_shared_schemas.py
```

A healthy schema run prints `Ran 12 tests` and `OK`. It verifies structural contracts, not application execution.

Run the missing-contract unit test:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
```

A healthy run prints `Ran 1 test` and `OK`. What that test does and does not prove is in `docs/ai/setup.md`. No lint command. `backend/ai/tests/live/` must not be described as passing.

```bash
cd app && npm install && npm test && npm run build
```

Healthy: Vitest reports all tests passed; `npm run build` completes. Live app: `cd app && npm run dev` (opens one editor; demo case loads automatically). Sample inspection: `data/README.md`.

Validate the synthetic demo fixtures:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/workflows/test_demo_fixtures.py
```

A healthy run prints `Ran 11 tests` and `OK`. This validates shared-schema conformance plus fixture integrity; application acceptance scenarios remain planned.

## Conventions agents get wrong

- Do not code a major feature from chat alone. Files in `features/` are the record.
- Do not mark intent/spec/plan `accepted` unless the user said so.
- Do not invent scope; mark extras `(added)` in the spec for user acceptance.
- Do not end a major run after Build without Close (tests + diff vs intent/spec/plan + doc updates + Close report).
- Do not freestyle UI colors, fonts, or layout when `DESIGN.md` exists — extend the system or ask before changing tokens.
- Do not commit or push unless the user asks.

## AI app integration

Live authority is app/server/storageSqlite.ts and its /api routes. Python storage/mock service is sandbox-only; never point it at app-model.sqlite. Use AppWorkspaceAdapter for live context and read docs/ai/app-integration.md before graph/tool work. Live AI mutation is not available yet. App tests include a Python-over-HTTP contract test; install backend/ai first. npm run lint currently reports three existing warnings.
