# Plan: Align AI context with the shipped app backend

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

The owner requests conflict resolution using the UI contract as the source of truth. No graph, model, or UI redesign is authorized by this slice.

> Historical: describes this UI contract-alignment slice. Current behavior is recorded in spec.md and docs/ai/app-integration.md.

## Approach

Keep the existing app Express API and SQLite store authoritative. Add a read-only Python workspace adapter with typed models for the real ProjectManifest hierarchy and preserve the independent Python mock/storage as a sandbox. Do not publish synthetic JSON as NRRD or simulate missing app mutation guarantees.

## Files that change

- schemas/workspace.py and schemas exports: app-facing project/case/sample/candidate/revision and spatial/pose contracts. R58, R59.
- integrations/workspace/: injected manifest reader, GET-only HTTP reader, ownership/freshness/context checks, explicit mutation rejection. R58, R59, R60, R61.
- storage/sqlite.py: reject opening app metadata databases with the sandbox initializer. R58, R62.
- Python workspace and guard tests, app/tests/aiWorkspaceContract.test.ts: fixture cases, restored current pointer, raw spatial/pose preservation, and the actual Node backend manifest. R58, R59, R60, R61, R62.
- docs/ai/, intent/spec/plan/preflight, assignment briefs, AGENTS.md and project index: correct authority, demo versus app scope, live capability gaps, commands and LangGraph readiness. R63.

## Proof

- R96: plans/gemini-read-only-chat.md; test_gemini_chat.py configuration/transport/failure checks.
- R97: plans/gemini-read-only-chat.md; test_gemini_chat.py strict tool/grounding/current-pointer checks.
- R98: plans/gemini-read-only-chat.md; aiChatClient.test.ts and ui/aiChatPanel.test.tsx provider policy/badge checks.
- R99: plans/gemini-read-only-chat.md; UI reset/remount and disposable dev/built browser checks.

- R90: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.
- R91: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.
- R92: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.
- R93: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.
- R94: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.
- R95: plans/read-only-chat-recovery.md; test_chat_context.py, aiChatClient.test.ts, aiChatContext.test.ts, ui/aiChatPanel.test.tsx and read-only-chat.spec.ts.

- R64: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.
- R65: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.
- R66: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.
- R67: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.
- R68: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.
- R69: read-only chat follow-up in plans/read-only-chat.md; test_chat.py, chatClient.test.ts and chat.e2e.ts.

- R70, R71, R72, R73, R74, R75, R76, R77, R78, R79: contract-only fold-in; decision record [plans/t1c-measurement-contract.md](plans/t1c-measurement-contract.md); canonical text in spec.md and docs/ai/contracts.md. No runtime/measurement implementation authorized.

- R58, R59, R60, R61, R62: Python workspace integration tests and real app storage-to-Python contract tests.
- R63: manual contract/code trace, offline tests, feature checker and git diff --check.
- Regression context: prior requirements remain scoped to their documented demo/foundation or future behavior. This slice does not implement R35–R39, model execution, API mutation CAS/idempotency, or a common cross-runtime operation writer.
- Run PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py.
- Run npm test, npm run build and npm run lint from app/; HTTP tests need a localhost listener.
- Run python3 -B .agents/skills/intent-spec-plan/scripts/check_features.py . and git diff --check.

- Earlier requirement context: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49, R50, R51, R52, R53, R54, R55, R56, R57. Existing schema/sandbox/storage regressions run, but this alignment does not claim complete behavior coverage or acceptance of the pending retry proposal. The archived plans retain their original proof.

## Risks

The UI store uses project/case/sample ownership, NRRD volumes, flat row-major pose, and pointer restore. Never infer parent revisions or manufacture source revision ids. Existing mutation routes lack expected revision and idempotency contracts; keep AI mutation disabled. HTTP context is a point-in-time read, not an execution lock.

## Close result

Python offline suite: 64 tests passed. App suite: 42 tests passed including Python-over-HTTP app contract proof. npm run build succeeded; its existing asset sync repaired the public demo manifest to match the canonical data fixture. npm run lint exits zero with three pre-existing warnings. The feature checker has zero errors; two inherited 3d-bone-editor warnings remain (runtime debug bridge mistaken for a filesystem path, and compressed/missing proof IDs in that draft plan). git diff --check passes.

## Deviations

No app runtime source or UI styling changed. The app build regenerated app/public/fixtures/demo-project/manifest.json, replacing its stale flattened source metadata with the canonical nested spatial shape. A cross-language test was added to prove the actual endpoint, not only a Python fixture. No live AI writer, API CAS/idempotency extension, graph, model, or real reconstruction was implemented.

## Read-only chat follow-up proof

R64,R65,R66,R67,R68,R69: scoped implementation plan [plans/read-only-chat.md](plans/read-only-chat.md); backend HTTP regression test_chat.py, typed client chatClient.test.ts and actual browser chat.e2e.ts. Earlier proof above remains historical app alignment.

## Gemini read-only scope
The owner's Gemini/session-only-history implementation is tracked in [plans/gemini-read-only-chat.md](plans/gemini-read-only-chat.md), with its own preflight and English implementation prompt. R96–R99 extend the fake transport without authorizing geometry or AI writes.
