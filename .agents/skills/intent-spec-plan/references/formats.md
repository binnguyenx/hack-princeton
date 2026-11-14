# File formats

Templates for each file are in `../assets/`. This page explains what goes in each section and why, so you can judge edge cases. Every file starts with a header line carrying its status, and the status values below are the only ones to use.

Contents: intent.md · spec.md · plan.md · docs/project.md · AGENTS.md / CLAUDE.md snippet

---

## intent.md

**Purpose:** capture what is wanted and why, in the originator's terms, before anyone designs anything. It's a proto-spec a product owner can read and correct without engineering knowledge.

**Status values:** `draft` → `accepted`. Accepted means the product owner agrees it says what they meant.

**Length:** about one page.

| Section | What goes in it | Common mistakes |
|-|-|-|
| Problem | What people can't do today or what hurts, who runs into it, a real example | Describing the solution instead of the problem |
| Desired outcome | What someone will see or be able to do afterward | Describing implementation ("add a table") |
| Affected users and systems | Who uses it; parts of the product or code it touches, as far as known | Guessing at code paths the author doesn't know |
| Constraints | Hard limits: security, privacy, performance, deadlines, required tech, off-limits areas | Listing preferences as constraints |
| Out of scope | Things readers might assume are included but aren't | Leaving it empty, which invites scope creep |
| Open questions | Genuine unknowns | Hiding assumptions that should be questions |
| Amendments | Dated, append-only notes when the ask changes after acceptance | Rewriting the original text instead of appending |

Header: `Author: <name> · Date: <date> · Status: <status>`. If a ticket exists, add its ID or link to the header.

Keep the author's own phrasing. The value of the intent is that it hasn't been filtered through several handoffs.

---

## spec.md

**Purpose:** the requirements and design, precise enough that an engineer can plan against it and a reviewer can test against it. It is the contract, and it always describes the feature as it works *now*.

**Status values:** `draft` → `accepted`. Later, `retired` if the feature is removed.

**Length:** one to three pages. If it's longer, the feature is probably two features.

| Section | What goes in it | Notes |
|-|-|-|
| Summary | Two or three sentences on what the feature does when finished | Someone should be able to stop reading here and know what this is |
| Requirements | Numbered R1, R2… Each is testable and says what must be true | Mark any requirement not asked for in the intent with `(added)` so the reviewer sees it. Never renumber after acceptance; retire an ID by writing `R3. (removed)` so references in plans and tests stay valid |
| Success criteria | Numbered S1, S2… Observable checks, ideally Given/When/Then | These become tests or manual review steps |
| Design | How it fits the system: approach, data, interfaces, UI | Decisions a reader needs, not a code tour |
| Where it lives | Main code locations across folders, including tests | Update when files move. The check script verifies these paths exist |
| Decisions | Numbered D1, D2… Choice, reason, alternatives | Record the *why*. Future-you will want to undo it |
| Flagged concerns | Conflicts with conventions or policy, risks, anything unsatisfied | Resolved ones stay, prefixed "Resolved:" with the answer |
| Open questions | Unknowns carried from the intent or discovered | Delete once answered and record the answer elsewhere in the spec |
| Out of scope | Carried from the intent plus design-time exclusions | |

Header: `Intent: [intent.md](intent.md) · Status: <status> · Last updated: <date>`.

**Writing a good requirement.** One requirement states one checkable thing. If you can't imagine the test, it isn't ready.

- Weak: "Sharing should be intuitive and secure."
- Better: "R1. An owner can share a task with any existing user by entering their email. R2. Sharing with an email that has no account shows the error 'No user with that email' and creates nothing."

**Requirements vs. success criteria.** Requirements are rules ("recipients can't delete"). Success criteria are concrete scenarios that show the rules hold ("Given Ana shares T with Ben, when Ben tries to delete T, then it fails and T remains in both lists"). A rule can have several scenarios.

---

## plan.md

**Purpose:** a written build plan that someone who never saw the conversation could carry out. It exists so the human can fix the approach while fixing it only costs an edit, and so the final diff can be compared against what was agreed.

**Status values:** `draft` → `accepted` → `done`.

**Length:** about one page.

| Section | What goes in it |
|-|-|
| Approach | Two or three sentences on the strategy and why this over the alternatives |
| Files that change | Each path, new or modified, why, and the requirement IDs it serves |
| Order of work | Steps small enough to verify one at a time |
| Risks | What could break, which step is riskiest, how you'll handle it |
| Proof | For every requirement, the exact test or command that verifies it |
| Deviations | Where the build departed from the plan and why. Empty at first |

Header: `Spec: [spec.md](spec.md) · Status: <status> · Date: <date>`.

When a plan reaches `done`, add this line directly under the header so no one mistakes it for current behavior:

`> Historical: describes how this change was built. For how the feature works now, read spec.md.`

When the next change to the feature needs a plan, overwrite `plan.md`. Git keeps the old one.

---

## docs/project.md

**Purpose:** the map. A new engineer or a fresh agent session reads this to learn what the project is and which feature folder to open.

Sections: Goal, Non-goals, Architecture at a glance, Features (an index table), Build order, Glossary. Template in `../assets/project.template.md`.

**Feature status values:** `proposed`, `in progress`, `shipped`, `retired`. Keep the index table current: add a row when a feature folder is created and update the status when it ships or is retired. Build order is a plain ordered list, not folders. If the user thinks in phases, write "Phase 1: a, b. Phase 2: c" as a list here.

---

## AGENTS.md / CLAUDE.md snippet

Put the workflow in `AGENTS.md` (agent-agnostic, always loaded by common coding agents). Keep it under a page. `CLAUDE.md` should import it (`@AGENTS.md`) and hold Claude-only deltas.

```markdown
## Feature docs
- Each feature has `features/<name>/` with `intent.md` (what and why), `spec.md` (what must be true now), and `plan.md` (how it's being built).
- Before changing how a feature behaves, read its `spec.md`. When behavior changes, update `spec.md` in the same commit.
- `docs/project.md` lists every feature and the build order.
- Major feature work follows the `intent-spec-plan` skill; the Build step uses the `tdd` skill.
```

What else belongs in `AGENTS.md`: build, test and lint commands (with what a healthy run looks like), conventions that matter, architecture in a few lines, and "things agents get wrong". The working rule for the last one: when an agent makes the same mistake twice, the correction goes in.
