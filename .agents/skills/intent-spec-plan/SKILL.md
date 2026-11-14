---
name: intent-spec-plan
description: >-
  Document-first implementation flow for major feature work on this project:
  intent.md (what/why), spec.md (what must be true), plan.md (how to build),
  then code. Also uses docs/project.md and AGENTS.md. Use for any new feature
  or behavioral change, or when the user says write the intent, spec this out,
  plan this feature, update the spec, check the spec against the diff, set up
  feature docs, mentions intent.md/spec.md/plan.md, spec-driven development,
  or asks where decisions and requirements live. Skip only for tiny work
  (typos, copy tweaks, restoring already-documented behavior, throwaway spikes).
---

# Intent, spec, plan

**On this project, intent-spec-plan is the implementation flow for major agent runs.** Do not jump straight to code for a new feature or a behavior change. Write and gate the docs in order, then build. Chat is not the record; files in git are.

Each feature gets three short Markdown files, written in order, each reviewed by a human before the next one starts:

| File | Answers | Who it's for |
|-|-|-|
| `intent.md` | What do we want, why, and under what limits? | The person who had the idea, and anyone asking "why does this exist?" |
| `spec.md` | What must be true when it's done? How does it fit the system? | Reviewers, testers, and any later agent session |
| `plan.md` | How will we build it: which files, in what order, proved how? | The engineer (or agent) doing the build, and the PR reviewer |

This workflow adapts Anthropic's AI-native SDLC playbook to a single product or small team. The folder layout below is this skill's convention.

## Layout

```
AGENTS.md                 # agent-agnostic project instructions (always read this)
CLAUDE.md                 # imports AGENTS.md for Claude Code; tool-specific deltas only
docs/project.md           # goal, architecture at a glance, feature index, build order
features/<name>/          # docs only, no code
  intent.md
  spec.md
  plan.md
backend/  frontend/  ...  # code lives wherever it normally does
```

Feature folders describe capabilities, not code locations. A feature can touch `backend/`, `frontend/` and more; `spec.md` has a "Where it lives" section that points at the code. Name features after what a user can do or what the system does (`task-sharing`), never after a folder (`backend-api`). Phases are not folders: build order is a list in `docs/project.md`.

If the repo already keeps docs somewhere else, follow its convention and tell the user you did.

## Pick the mode

- **New feature or unit of work** → follow "New feature" below.
- **Changing behavior of something that already has a folder** → "Change an existing feature" in `references/updating.md`.
- **"Does the code still match the docs?", reviewing a diff, closing out a feature** → `references/verification.md`.
- **Repo has none of this yet** → "Bootstrap" below.
- **Someone asks what this workflow is, or a new engineer needs onboarding** → read `references/overview.md`, then explain at the depth they need. Don't dump the whole file.
- **Tiny work** (typo, copy tweak, bug fix that restores documented behavior, throwaway spike) → say no new files are needed and skip the workflow. Ceremony on small changes teaches people to ignore the process.

Before writing any file, read `references/formats.md` for what each section should contain and `references/writing-conventions.md` for how to write it. Templates are in `assets/`.

## New feature

### 0. Scope it
Check `docs/project.md` and `features/` to confirm this isn't already covered; if it is, switch to "Change an existing feature". Pick a kebab-case name. Sanity-check the size, because everything downstream inherits it. These are rules of thumb, not hard limits:

- The intent fits on about one page.
- The spec fits in one focused working session.
- You can write "this is done when X is observable."
- Part B can't start until part A ships → they're separate features.

If it's too big, propose a split and let the user choose.

### 1. Intent
Get the idea in the user's own words. If they already described it in chat, extract from that first. Ask only the few questions that would change the design (who is affected, what's out of scope, hard constraints, what success looks like), in one message, five at most. Write `intent.md` from `assets/intent.template.md`, keeping the user's voice rather than polishing it into corporate prose. List what's unknown under Open questions.

**Gate:** show the draft, say what you assumed, and wait for corrections. Set `Status: accepted` only when the user says so. A wrong assumption here turns into twenty wrong requirements later.

### 2. Spec
Read the accepted intent, `AGENTS.md` (and `CLAUDE.md` if present), the code the feature will touch, and neighboring specs. Draft `spec.md` from `assets/spec.template.md`:

- Number every requirement (R1, R2…) and make each one testable, so plans, tests and reviews can point at it.
- Every requirement should trace to the intent. If you think something is missing, add it marked `(added)` so the user can accept or reject it.
- Answer each open question from the intent, or carry it forward.
- Put flagged concerns in your reply first, before the draft: conflicts with conventions or security rules, risky areas, anything you couldn't satisfy.

**Gate:** the user resolves the flagged concerns and accepts the spec. Specs describe behavior and design, not code.

### 3. Plan
Explore the codebase read-only first (use plan/read-only mode if the tool has one). Draft `plan.md` from `assets/plan.template.md`: files that change (marked with the requirements they serve), order of work, risks, and proof (the exact tests or commands that verify each requirement). Then interrogate it: what could this break, which step is riskiest, what did we choose not to do and why. Iterate until an engineer who never saw the conversation could carry it out.

**Gate:** the user approves. Set `Status: accepted`. If they use git, the plan should be committed before coding starts, so the review can compare the final diff against it.

### 4. Build
Implement against the plan. **Use the `tdd` skill here:** write the proof first — tests that encode the spec's success criteria, confirmed failing for the right reason, then make them pass. Never edit a test to make it pass. Run the verification commands the plan lists.

Two kinds of departure, handled differently:
- The *implementation* departs from the plan → log it under Deviations in `plan.md` in the same change.
- The *behavior* departs from the spec → stop and tell the user. Changing what the feature does is a decision, not a detail.

### 5. Close
Run the checks in `references/verification.md`. Then bring the docs up to date: spec's "Where it lives", Decisions and "Last updated"; plan status to `done` with the historical banner; the feature's row in the `docs/project.md` index; and `AGENTS.md` (or tool-specific deltas) if something project-wide came up (a command, a convention, a mistake agents repeated). Report what changed.

## Bootstrap

When the repo has none of this, create only what's needed:

1. `features/` (empty is fine).
2. `docs/project.md` from `assets/project.template.md`, filled from what you can learn from the repo plus a couple of questions to the user (goal, who it's for).
3. Ensure `AGENTS.md` describes this workflow and points at the project skills. If `CLAUDE.md` exists, keep it as `@AGENTS.md` plus Claude-only deltas; otherwise create a short one that imports `AGENTS.md`. Keep always-loaded instruction files under a page.

## Rules that matter

- **Gates are real.** Don't write the next file until the user has reviewed the last one. If the user says "just draft everything," do it, but still list your assumptions and flagged concerns before any code is written.
- **The spec is current truth.** When behavior changes, the spec changes in the same commit as the code. A spec that lags behind is worse than none, because agents will trust it.
- **No phase folders and no "v2" folders.** Changes to an existing feature edit that feature's files.
- **Don't invent scope.** Anything the user didn't ask for is flagged as added, never slipped in.
- **Don't commit or push** unless the user asks. Suggest the commit and say what should be in it.
- **Keep files short.** A new engineer should read a feature's three files in ten minutes.
- **Never print the guidance text from templates into finished files.** Replace every `<placeholder>`.

## Bundled files

- `references/overview.md` — plain-language explanation of the files and workflow with a worked example; the onboarding doc.
- `references/formats.md` — section-by-section guidance for each file, status values, the AGENTS.md / CLAUDE.md snippet.
- `references/updating.md` — what to edit when something changes, drift handling, retiring features.
- `references/verification.md` — the stray-idea check, diff review, tests, report format.
- `references/writing-conventions.md` — how to write these files so humans understand them.
- `assets/*.template.md` — starting points for each file.
- `scripts/check_features.py` — mechanical checks (missing files, leftover placeholders, plan references to requirements that don't exist, "Where it lives" paths that don't exist). Run `python scripts/check_features.py <repo-root>` from this skill's directory.
