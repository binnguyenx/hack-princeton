# Preflight: fake-model end-to-end confirmation

Owner coordinator. Date: 2026-11-14. Status: complete for the current authorized tool inventory. Goal: Confirm fake-model tools end-to-end.

Current authoritative state: PR #31 head 7cd2b53 is open; main 61189d7. Bound chat capability is workspace.describe_selection only (R64–R69, R90–R95). Sandbox reconstruction/operation-service fixtures are separate library capabilities (R50–R57), not chat tools. Measurement/placement/restore/generation must not be enabled for AI by this verification. Preserve UI recovery, original apiPlugin, source workspace and live storage. No merge, provider, cutover or new push.

Acceptance and proof:
- A1 source UI→JSON→graph→validated metadata→grounded explanation, prior screenshot prompts and scoped history: existing browser journey, transport/panel tests.
- A2 candidate current restored pointer plus explicit rejection of mutation language, no-write manifest/files, stale input rejected before proposal: new HTTP tool audit and candidate browser journey.
- A3 unknown tool, invalid arguments, unavailable capability, tool failure and fabricated output: HTTP-to-graph audit, exact terminal codes and byte-for-byte storage checks.
- A4 sandbox mock/service: full existing deterministic suites; do not claim these library operations run through the UI.
- A5 actual browser in both retained Vite SQLite dev routing and built FastAPI serving, fresh disposable roots and isolated ports.

New changes are regression proof/documentation only and remain uncommitted pending a separate publication instruction. Run Python/app suites, browser dev/built journeys, feature checker and diff checks. Final evidence/status follows below.

## Completion audit

- A1 proven: actual Chrome browser source conversation sends the screenshot prompts/history through the real API, traverses the metadata-only graph and renders distinct grounded explanations. Existing identity/transport/reset/context-change regressions all pass.
- A2 proven: candidate browser setup creates R0/R1 manually, restores R0, then checks all five graph nodes, application-read observation and R0 identity in context/result/UI. A write-language prompt only reads metadata; manifest remains identical. A subsequent manual update makes the old UI request stale, surfaces an alert and preserves the manually changed manifest. HTTP audit also verifies byte-for-byte storage preservation and no model proposal after stale context.
- A3 proven at public HTTP boundary: unregistered mutation/measurement/generation tools, invalid/extra arguments, malformed proposals, unavailable registration, failing model/executor and fabricated metadata all produce explicit terminal errors; no tool output is falsely explained as successful. Caller-injected tool/provider/storage_root fields return 422. Error paths do not leak injected private exception strings.
- A4 proven only as a library: the full backend suite includes deterministic reconstruction adapter, sandbox service claims/concurrency/reconciliation, spatial context and invalid-output checks. This is not evidence that reconstruction is exposed through chat; it remains unbound.
- A5 proven: 2 browser journeys pass in dev (/private/tmp/hp-chat-e2e-eOTE8h) and the same 2 pass in built serving (/private/tmp/hp-chat-e2e-FilSmX), all on fresh disposable storage. No live server was selected.

Final deterministic evidence: 143 backend tests and 104 app tests pass; feature checker has 0 errors/warnings; diff/whitespace and protected UI/plugin checks pass. Earlier type/build/lint evidence for the unchanged runtime commit remains valid; this audit modifies only tests/documentation. Existing random-UUID test false positive was repaired by matching the fabricated measurement `999 mm3` rather than the unrelated substring `999`, with a positive assertion on the actual 2 × 3 × 4 grid.

Current supported chat tool: workspace.describe_selection. Geometry measurement, placement, restore, reconstruction and Bedrock are not enabled as AI tools. The fake model is deterministic metadata routing, not a general conversational model. No source/runtime changes, new commit, push, merge, cutover or AI live writes were performed by this audit. Goal confirmed within the complete current authorized inventory; no broader tool availability is claimed.

## Publication review follow-up

Owner now authorizes commit/push to the existing PR #31, without merge. Scope is exactly the two changed test files, the new HTTP fake-tool test file and this audit record. Review strengthened two checks: rejected tool proposals assert that the registered executor was never called; browser setup asserts a successful distinct R1 and an actual restored R0 pointer before testing the chat. This prevents a failed fixture transform from accidentally passing as a restoration test. No runtime/UI/plugin or live data changes are part of this publication. Verification is rerun on disposable storage before updating the PR.

Publication verification rerun: 143 backend tests, 104 app tests, 2 dev browser journeys (/private/tmp/hp-chat-e2e-jV6uz2) and 2 built browser journeys (/private/tmp/hp-chat-e2e-Rd9mFT) pass. Feature checker: 0 errors/warnings. Scope/diff review confirms only four audit/test files changed since 7cd2b53; runtime source, recovery UI, Vite apiPlugin/CRUD and samples are excluded.
