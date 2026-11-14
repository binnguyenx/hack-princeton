# Writing conventions

These files are read by people who weren't in the conversation: a new engineer, a product owner skimming for what changed, someone debugging in a year. Write for them. The test for every file is whether someone who has never seen the chat could act on it.

Contents: principles · requirement and plan wording · length · using the write skill · checklist

---

## Principles

- **Lead with the point.** The first sentence of every section says the most important thing. Don't warm up.
- **Use plain words.** Say "use" instead of "utilize", and "start" instead of "initiate". Choose the word a colleague would say out loud.
- **One idea per sentence.** If a sentence needs a semicolon to hold together, split it.
- **Be concrete.** Prefer numbers, names and examples over abstractions. "Loads in under 2 seconds on the dashboard" beats "performs well." "An owner" beats "the relevant stakeholder."
- **Say why.** A decision without a reason can't be revisited sensibly. "Recipients can't re-share. Why: keeps the owner in control" lets the next person judge whether the reason still holds.
- **Define terms once, then use them consistently.** Pick one name for each thing and stick to it. If the spec says "recipient" in one place and "collaborator" in another, a reader will assume they're different.
- **Keep the author's voice in the intent.** Don't smooth the originator's words into corporate prose. The value of the file is that it's still theirs.
- **Don't narrate the conversation.** No "as discussed", "per our chat", "the user asked". The file should read the same to someone who wasn't there.
- **Skip empty vocabulary.** Words like *robust*, *seamless*, *appropriate*, *gracefully*, *etc.* and *and so on* hide the decision that hasn't been made. Replace each with the specific thing.
- **No decoration.** No emoji, no bold on random phrases, no headers that aren't in the template. Tables are for the feature index and for mappings, not for prose.

## Wording by file

**Intent:** first person is fine. Describe the problem as people experience it.
- Weak: "Stakeholders require improved task collaboration capabilities."
- Better: "People can't hand a task to a teammate. They screenshot it, paste it into chat, and retype every change."

**Spec:** present tense, one checkable statement per requirement, using "can" for abilities and "must" for rules.
- Weak: "The system should handle errors gracefully when sharing fails."
- Better: "R6. If sharing fails, the owner sees the message 'Couldn't share this task. Try again.' and the task stays unshared."

**Plan:** imperative steps, each small enough to verify, with exact paths and exact commands.
- Weak: "Implement the backend."
- Better: "Add `backend/models/task_share.py` with owner, recipient and created_at, plus a migration. Verify with `make migrate && make test`."

## Length

Intent: about one page. Spec: one to three pages. Plan: about one page. `AGENTS.md`: under one page. If a file runs well past these, the feature is probably too big or the writing is padded. Cut the padding first.

## Using the write skill

The user has a `write` skill that removes the marks of machine-written prose: inflated importance, stock vocabulary, tidy summaries bolted onto every section, hedging, and rhythm that never varies. When it's available, run it over the *prose* in each file after drafting: the intent as a whole, the spec's Summary and Design, the plan's Approach and Risks.

Keep it away from the parts where precision matters more than style:

- Requirement, success-criterion and decision IDs (R1, S1, D1) and their exact wording
- Code, file paths, commands, test names
- Tables and the header line

After the pass, check that requirement IDs still exist, no meaning changed, and nothing got vaguer. A pass that turned "within 5 seconds" into "quickly" has made the file worse. If the `write` skill isn't available, apply the principles above by hand.

## Final checklist

Before showing a file to the user:

1. Every `<placeholder>` from the template is replaced and no guidance text is left over.
2. A reader who wasn't in the conversation can follow it.
3. Each requirement is testable and numbered.
4. Terms are consistent.
5. Nothing is vague that could be specific.
6. It's within the length guide.
