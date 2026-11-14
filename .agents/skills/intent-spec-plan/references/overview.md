# The intent, spec, plan workflow: an explanation for new engineers

Read this once and you should be able to work in a repo that uses it. It takes about ten minutes.

## The problem it solves

When you build with an AI assistant, the context lives in the conversation. Close the session and it's gone. A teammate can't read it. Next week, you re-explain the same decisions and the assistant makes the same wrong guesses. Meanwhile, a lot of time goes into prompting by hand because each session starts cold.

The fix is to write the context down in small files, in git, next to the code. The assistant reads them at the start of a session, and so does every new engineer.

## The three files

Every feature has a folder, `features/<name>/`, with up to three files. They are written in order, and a human reviews each one before the next is created.

| File | Answers | Written by | Reviewed by | How long it lives |
|-|-|-|-|-|
| `intent.md` | What do we want, why, and under what limits? | The person with the idea, with an agent drafting from a conversation | That same person, then the product owner | Permanent. Only appended to (Amendments). |
| `spec.md` | What must be true when it's done, and how does it fit the system? | Agent drafts from the intent | Product owner, with a tech lead for risky areas | Permanent. Always describes how the feature works *today*. |
| `plan.md` | Which files change, in what order, and how is each requirement proved? | Agent drafts (plan/read-only mode if available), engineer corrects | The engineer, then the PR reviewer | Written per change. Kept as history once done. |

A useful way to remember the split: the intent is the request, the spec is the contract, the plan is the work order.

Three other files live at the project level:

- `AGENTS.md` at the repo root holds what a new teammate or agent needs on day one: how to build, test and lint, the conventions that matter, and mistakes agents keep making. Keep it under a page. `CLAUDE.md` imports it for Claude Code.
- `docs/project.md` holds the goal, a short architecture overview, an index of features with their status, and the order they'll be built in.
- Project skills under `.agents/skills/` hold procedures that must be applied the same way every time (this workflow, TDD). They are part of how this repo expects agents to work.

## How the pieces connect

```
idea ──► intent.md ──► spec.md ──► plan.md ──► code + tests ──► merged
          what/why     must be      how to        built to        spec updated,
                       true         build it      the plan        plan marked done

   ▲ human reviews each arrow before the next file is written ▲
```

Each file is checked against the one before it. Everything in the spec should trace back to the intent, every plan step should serve a requirement, and the finished diff should match the plan. Anything that doesn't trace back is either a mistake or a decision someone needs to make out loud.

## Where things go in a real codebase

Code lives where code normally lives. The feature folders hold documents only.

```
repo/
  AGENTS.md
  CLAUDE.md
  docs/project.md
  features/
    task-sharing/
      intent.md
      spec.md
      plan.md
  .agents/skills/
    intent-spec-plan/
    tdd/
  backend/
    api/sharing.py
    models/task_share.py
  frontend/
    components/ShareDialog.tsx
```

A feature usually crosses folders: `task-sharing` touches both `backend/` and `frontend/`. That's fine. You don't decide which folder it belongs to. Its spec has a "Where it lives" section that lists the code locations, and its plan lists every file that changes.

Name features after what users can do (`task-sharing`, `login`), never after code locations. Phases like "Phase 1" and "Phase 2" are not folders either. They're an ordering of features and live as a list in `docs/project.md`.

## A worked example

Here is a small feature, shown with trimmed-down files.

**`features/task-sharing/intent.md`**
```markdown
# Intent: task sharing
Author: Dana (support lead) · Date: 2026-11-02 · Status: accepted

## Problem
People keep tasks in the app but can't hand one to a teammate. They screenshot
the task, paste it into chat, then retype every change back into the app.

## Desired outcome
A user can share a task with another user, and both see the same task and edits.

## Constraints
Existing accounts only. No new login system. The owner must be able to take access back.

## Out of scope
Teams, groups, public links.

## Open questions
Can a person you shared with share it again?
```

**`features/task-sharing/spec.md`** (trimmed)
```markdown
# Spec: task sharing
Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-04

## Requirements
- R1. An owner can share a task with any existing user by email.
- R2. A person a task is shared with sees it in their list, labeled "shared by <name>".
- R3. That person can edit the title and status but cannot delete the task.
- R4. The owner can revoke access. The task leaves the other person's list within 5 seconds.

## Success criteria
- S1. Given Ana shares task T with Ben, when Ben opens his list, then T appears labeled "shared by Ana".

## Where it lives
- Backend: `backend/api/sharing.py`, `backend/models/task_share.py`
- Frontend: `frontend/components/ShareDialog.tsx`, `frontend/components/TaskList.tsx`

## Decisions
- D1. People you share with can't share it again. Why: keeps the owner in control, and answers the open question in the intent.
```

**`features/task-sharing/plan.md`** (trimmed)
```markdown
# Plan: task sharing
Spec: [spec.md](spec.md) · Status: accepted · Date: 2026-11-05

## Files that change
- `backend/models/task_share.py` (new): stores who a task is shared with (R1, R4)
- `backend/api/sharing.py` (new): share, edit-as-recipient, revoke endpoints (R1, R3, R4)
- `frontend/components/ShareDialog.tsx` (new): the share form (R1)
- `frontend/components/TaskList.tsx` (modified): "shared by" label (R2)

## Order of work
1. Model and migration. 2. Endpoints. 3. Dialog. 4. List label.

## Risks
R4's 5-second limit depends on how often the list refreshes. Check the current polling interval before step 3.

## Proof
- R1: `tests/test_sharing.py::test_owner_can_share`
- R3: `tests/test_sharing.py::test_recipient_cannot_delete`
- R4: `tests/test_sharing.py::test_revoke_removes_task_for_recipient`
```

Notice what each file does *not* contain. The intent has no design. The spec has no code. The plan has no argument about whether to build the feature.

## Day to day

**Starting a feature.** Describe the idea to an agent in your own words. It asks a few questions and drafts `intent.md`. You fix what it got wrong. Then it drafts the spec and flags anything that conflicts with your conventions. You resolve those. Then it drafts the plan (plan/read-only mode if available). You build with TDD, with tests that check each requirement. Before merging, someone checks that the docs and the diff still agree.

**Changing a feature later.** Don't create a new folder. Add a dated note under Amendments in the intent, update the spec so it describes the new behavior, and write a fresh plan for the change.

**Fixing a bug.** If the code was wrong and the spec was right, fix the code and touch no docs. If the spec was wrong or missing something, fix the spec too.

**Joining the project.** Read `docs/project.md` for the big picture, then the `spec.md` of whatever you're about to touch. Read the intent if you want to know why it exists.

## Common questions

**Why is there both an intent and a spec?** They have different jobs and different authors. The intent is the originator's words, so nothing gets lost between the idea and the engineering. The spec is precise enough to test against. If you mash them together, you get either vague requirements or a spec nobody who had the idea can recognize.

**Why commit the plan?** Three reasons. A reviewer can check the diff against it. Someone (or a fresh agent session) can resume the work without the original conversation. And fixing a plan is cheaper than fixing code. Once the feature is done the plan is marked as history, since the spec is the record of how things work now.

**What if the code ends up different from the spec?** One of them is wrong, and a person decides which. If the code is wrong, fix the code. If the spec was wrong or incomplete, update the spec in the same commit. What you never do is leave them disagreeing.

**Does every change need all this?** No. Typos, copy changes, and bug fixes that restore documented behavior need no new files. The workflow is for new capabilities and for changes to how something behaves.

**How big should a feature be?** Roughly: the intent fits on a page, the spec fits in one working session, and you can say what "done" looks like. If part B can't start until part A ships, they're separate features. These are rules of thumb.

**Where do cross-cutting decisions go?** Decisions that affect one feature go in its spec under Decisions. Decisions that affect everything (database choice, auth approach) belong in `AGENTS.md` if they change how code is written, or in `docs/project.md` under architecture if they explain how the system hangs together.

**What if we already track work in Jira or Notion?** Pick one place as the source of truth for each kind of record, and link the other. For example, the repo owns specs and the ticket tool owns status, with the ticket ID written in the intent header.

## Background reading

The workflow is adapted from Anthropic's "AI-native SDLC playbook" (https://claude.com/resources/articles/the-ai-native-sdlc-playbook), which describes the same chain of committed files (intent, spec, plan, diff) for larger organizations, plus hooks, evals and review automation. The per-feature folder layout and the rules for amendments and plan history are this skill's own conventions.
