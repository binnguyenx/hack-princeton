# Gemini read-only chat implementation prompt

## Task
Replace the scripted chat model with an explicitly configured Gemini adapter. Implement and verify the change using intent/spec → preflight/plan → code → tests. Keep fake mode available for deterministic verification. Do not commit, push, merge or restart the user's live application.

## Role
Act as the implementation coordinator. Preserve user changes and the restored frontend shell.

## Context and constraints
- Start with the reviewed PR #31 chat dependency. Keep the Vite SQLite apiPlugin and CRUD path unchanged.
- Chat history exists only in React memory. Send bounded turns with each request; never persist transcripts, checkpoints or provider conversation state. Reset aborts pending requests, clears turns and starts a new local ID. Reload loses history.
- Use Gemini through a replaceable backend adapter. Read the API key and explicit model ID from backend environment only. Never embed credentials in source, browser variables, URLs, logs or tests.
- Load authoritative selected-object context each turn. Gemini may propose only registered metadata reads; validate arguments and execute through the existing LangGraph registry. Do not expose measure/place/generate, sandbox operations or live writes.
- Let Gemini compose a context-aware answer or clarification grounded in actual observations. Never overwrite it with fake scripted text. Render requested metadata facts from authoritative observation values; reject fabricated numeric prose and unknown fact references. Explain unavailable geometry capabilities honestly.
- Return explicit provider identity and read-only policy. Validate this envelope in the frontend; update the existing badge without restyling.
- Bound provider timeouts and output, disable retries, surface configuration/auth/quota/timeout/invalid-output failures, and never silently fall back to fake.

## Verification and deliverables
Use disposable application storage and provider HTTP doubles. Cover history, reset, restored revisions, foreign ownership, tool/argument rejection, fabricated output, failures, no writes, backend-only secrets and unchanged recovery assets. Run backend/app suites, build, feature checks and dev/built browser journeys. An optional real Gemini smoke uses only synthetic context, a privately configured key and a bounded call budget. Record actual evidence and any unavailable live verification. Update setup, work summary and scoped plan; do not mark the whole draft intent/spec accepted.
