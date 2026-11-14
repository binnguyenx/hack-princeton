# Agent instructions

This repo is agent-agnostic. Cursor, Claude Code, Codex, Copilot, and similar tools should follow the same workflow.

## Onboard (read first)

1. Read `docs/project.md` for the product goal and feature index.
2. For **major feature work** (new capability or behavior change), follow the **`intent-spec-plan`** skill. That skill is the **implementation flow for major agent runs** on this project: intent → spec → plan → build → close, with a human gate between each doc.
3. During the Build step, follow the **`tdd`** skill (red → green → refactor). Derive tests from the accepted `features/<name>/spec.md`.
4. Skip intent-spec-plan only for tiny work: typos, copy tweaks, bugfixes that restore already-documented behavior, throwaway spikes. Say so explicitly when you skip it.

AI/backend work under `backend/ai/`, `docs/ai/`, and `features/ai-workspace-assistant/` follows [docs/ai/workflow.md](docs/ai/workflow.md). Intent and spec may be drafted in one round and stay separate files. After both are explicitly accepted, a separate plan approval is not required unless the user asks. Other features keep a human gate between each document.

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

## Build / test / lint

From the repo root, the missing-contract unit test:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
```

A healthy run prints `Ran 1 test` and `OK`. What that test does and does not prove is in `docs/ai/setup.md`. No lint command. `backend/ai/tests/live/` must not be described as passing.

## Conventions agents get wrong

- Do not code a major feature from chat alone. Files in `features/` are the record.
- Do not mark intent/spec/plan `accepted` unless the user said so.
- Do not invent scope; mark extras `(added)` in the spec for user acceptance.
- Do not commit or push unless the user asks.
