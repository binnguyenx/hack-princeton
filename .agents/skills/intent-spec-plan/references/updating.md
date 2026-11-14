# Updating the files

The rule that keeps this workflow useful: **the spec describes the feature as it works today.** Everything else on this page follows from it.

Contents: which file to edit · changing an existing feature · when code and docs disagree · retiring and splitting · housekeeping

---

## Which file to edit

| What happened | What to do |
|-|-|
| Brand-new capability | New `features/<name>/` folder. Run the full workflow. |
| Behavior of an existing feature changes | Add an amendment to its `intent.md`, update `spec.md`, write a fresh `plan.md` if the work is more than trivial. No new folder. |
| Bug fix; the code was wrong and the spec was right | Fix the code. No doc changes. |
| Bug fix; the spec was wrong or missing a case | Fix the code and update the spec in the same commit. |
| Refactor with no behavior change | Update the spec's "Where it lives" if files moved. Nothing else. |
| Typo, copy or style tweak the spec doesn't mention | No doc changes. |
| Build departs from the plan but behavior is the same | Add a line to the plan's Deviations. |
| Build would change behavior the spec promises | Stop. Raise it with the user. If they agree, update the spec first, then proceed. |
| Feature is removed | Set spec status to `retired` with a one-line reason and date, update `docs/project.md`. Delete the folder only if the user asks; git history keeps it either way. |
| A feature turns out to be two | Create the second folder, move the relevant requirements across, and leave a pointer in each spec to the other. |
| Something project-wide was learned (new command, convention, repeated agent mistake) | Add it to `AGENTS.md` (or a tool-specific delta file if it only applies to one agent). |

Docs change in the same commit as the code they describe. A spec update in a later commit is a spec that will be forgotten.

## Changing an existing feature

1. Open `features/<name>/spec.md` and read it before touching any code.
2. If the *ask* has changed, append a dated entry to the intent's Amendments: what's new and why. Don't rewrite the original intent. The history of the ask is part of its value.
   ```markdown
   ## Amendments
   - 2026-12-03: Owners also want to see who has opened a shared task. Added after support feedback.
   ```
3. Update the spec. Add or change requirements, success criteria and decisions so the file describes the new behavior in full, as if it had always worked that way. Don't write "previously X, now Y" into the requirements. Requirement IDs stay stable: new ones get the next number, and dropped ones become `R3. (removed)`.
4. Bump "Last updated" in the spec header.
5. If the work is non-trivial, replace `plan.md` with a plan for this change and set its status to `draft`. Review it like any other plan.
6. Build, verify (`verification.md`), and set the plan to `done`.

If the amendment is large enough that the original intent no longer describes the feature, that's a signal to split off a new feature rather than keep stretching the old one.

## When code and docs disagree

Don't silently edit either side to match. Work out which is wrong:

- **The code does something the spec doesn't say.** Ask whether the behavior is wanted. If yes, add it to the spec (marked `(added)` until the owner accepts it). If no, remove it from the code.
- **The spec says something the code doesn't do.** Is the requirement still wanted? If yes, the code has a bug or the feature is unfinished. If no, retire the requirement.
- **The plan says X but the diff did Y.** If the result is the same behavior, log it in Deviations. If the behavior differs, it's a spec question as above.

Never edit a spec just to make a check pass. A spec that was bent to fit accidental behavior is worse than a mismatch, because the mismatch is at least visible.

## Housekeeping

- **Index.** Keep the feature table in `docs/project.md` in step with the folders. Add a row on creation. Update status at each milestone.
- **Staleness check.** At the start of work on a feature, check the spec's "Last updated" date and that the "Where it lives" paths still exist. If they've rotted, repair the spec before building on it.
- **Resolved items.** Delete answered Open questions from the spec once their answers are recorded. Keep resolved Flagged concerns with a "Resolved:" prefix, because they explain constraints.
- **`AGENTS.md` (and `CLAUDE.md` deltas).** Prune them when you touch them. A line about a problem that no longer exists costs context every session.
- **Commits.** Suggest, don't make, commits unless the user asks. A good commit groups the code with its doc updates and says so in the message.
