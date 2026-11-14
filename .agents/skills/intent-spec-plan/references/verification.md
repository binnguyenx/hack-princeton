# Verification

Verification answers two questions: did anything stray as the idea moved from intent to spec to plan to code, and does the finished diff match what was agreed? Run it before closing out a feature, when reviewing a PR, or whenever the user asks "does the code still match the docs?"

Contents: 1 mechanical check · 2 trace the chain · 3 review the diff · 4 tests · 5 report · 6 resolving mismatches

---

## 1. Mechanical check

Run the bundled script from the skill directory:

```
python scripts/check_features.py <repo-root>
```

It checks for missing files, leftover template placeholders, duplicate requirement IDs, plan references to requirements that don't exist, requirements with no proof in the plan, "Where it lives" paths that don't exist, and features missing from the `docs/project.md` index. Fix every error it reports and read each warning. It cannot judge meaning, so continue with the steps below.

## 2. Trace the chain (the stray-idea check)

Read the three files together and look for ideas that appeared or vanished between them. Work through these in order and list every failure:

1. **Intent → spec.** Every desired outcome and constraint in the intent shows up as at least one requirement, decision or out-of-scope line. List any that don't.
2. **Spec → intent.** Every requirement traces to something in the intent. Requirements marked `(added)` are fine if the owner accepted them. Unmarked ones with no source are stray ideas: flag them.
3. **Open questions.** Each question in the intent is answered in the spec or carried forward. None silently disappeared.
4. **Spec → plan.** Every requirement appears in the plan's Files that change and its Proof.
5. **Plan → spec.** Every file and step in the plan serves a requirement. Steps with no requirement are scope creep, or they reveal a missing requirement.
6. **Constraints.** Spot-check that the design and plan respect each constraint from the intent.

## 3. Review the diff

Compare the actual change against the plan and spec.

- **Files.** Is every changed file listed in the plan's Files that change? For each one that isn't: is it justified (log it under Deviations) or accidental (revert)?
- **Behavior.** For each requirement, find the evidence in the diff: the code that implements it and the test that proves it. List requirements with no evidence.
- **Extras.** Look for behavior in the diff that no requirement asks for. Either add it to the spec (if wanted) or remove it.
- **Risks.** Check that the plan's listed risks were handled, not just acknowledged.

## 4. Tests

Tests are the mechanical form of verification and the best defense against drift, because they fail when code stops matching the spec.

- Each requirement in the plan's Proof maps to at least one named test or command. Check that those tests exist and pass.
- Where practical, write tests from the success criteria *before* implementing. Confirm each one fails for the right reason, then make it pass.
- For bug fixes, write the failing test first, confirm it fails, then fix the code.
- Never weaken or delete a test to make a build pass. If a test is wrong, say so and change the spec first.
- Run the commands exactly as written in the plan and report the real output rather than summarizing from memory.

## 5. Report

Keep the report short, and lead with what needs a human decision.

```markdown
**Needs your decision**
- R5 isn't mentioned in the intent. Keep it (I'll mark it accepted) or drop it?
- The diff changes `backend/api/auth.py`, which the plan doesn't list. Intended?

**Checks**
| Check | Result | Notes |
|-|-|-|
| Script | Pass | 0 errors, 1 warning (see below) |
| Intent → spec | Pass | |
| Spec → intent | 1 stray | R5 |
| Plan covers requirements | Pass | |
| Diff matches plan | 1 unplanned file | auth.py |
| Tests | Pass | 14 passed |

**Docs updated**
- spec.md: Where it lives, Last updated
- plan.md: status → done
```

Don't pad the report. If everything passes, say so in one or two lines.

## 6. Resolving mismatches

Use the rules in `updating.md` under "When code and docs disagree." The short version: decide which side is wrong with the user, fix that side, and never edit the spec only to make a check pass.
