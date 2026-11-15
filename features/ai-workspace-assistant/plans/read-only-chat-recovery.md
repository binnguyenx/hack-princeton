# Plan: Restored read-only chat integration

Spec: ../spec.md R90–R95. Status: done (authorized recovery chat slice). Owner: coordinator. Date: 2026-11-14.

Preflight: read AGENTS, project/product/design, AI workflow/intent/spec, current diff and existing recovery tests. User authorizes this scoped build; whole draft acceptance is unchanged. Preserve sample asset work using task-start hashes in /private/tmp/hp-chat-integration-before.json. No old stashed UI replay.

1. C1 context/client and backend reply (R90–R91): red HTTP/client regressions, implement typed JSON transport and bounded history. Owner coordinator; done.
2. C2 panel lifecycle/wiring (R92/R94): preserve all classes/styles; regression scope switch/reset/error; depends C1; done.
3. C3 AI-only dev bridge (R93): exact route before unchanged apiPlugin; test failure and CRUD separation; independent; done.
4. C4 integration/Close (R95): full Python/app tests, type/build/lint, actual browser with disposable shared root, feature checker and diff/hash review. Depends C1–C3; done.

Files: agent/read_only_reply.py, api/routes/chat.py and regression tests; app/src/ai/{langGraphClient,chatContext}.ts, AiChatPanel, thin CanvasWorkspace/App props; new app/vite-ai-chat-plugin.ts and Vite plugin registration; chat unit/browser tests; setup/work summary/project index. Proof commands: .venv/bin/python -B backend/ai/tests/run_checks.py; npm --prefix app test; npm --prefix app run build; npm --prefix app run lint; isolated Playwright chat integration; feature checker; git diff --check.

Risks: fake model is metadata-only, not a general conversational model; client history is untrusted and never authority. Both processes must share storage. No backend outage fallback. UI geometry and live data are not test targets.

## Close evidence

- R90/R91: first HTTP regression failed against the former metadata-only generic explanation; client regression failed because no fetch occurred under the canned mock. Both now pass. Canonical source object/current restored pointer tests, forged history/foreign case/stale revision and history limits pass. No geometry/provider/write tool is bound.
- R92/R94: panel tests cover absent selection, immediate send gate, reset and context-change aborts/late replies. Original recovery classes/styles remain; protected App.css, Viewport, SliceViewport, apiPlugin and Node CRUD source hashes match task start. Existing modified sample catalog and NRRD files also match task-start hashes.
- R93: exact-path proxy test confirms CRUD/unrelated paths call next; failed upstream returns 502. Original app test failures were sandbox loopback restrictions; rerun with loopback permission passes all tests without weakening them.
- R95: 139 Python tests, 104 app tests, TypeScript/build pass. Lint exits zero with existing unrelated warnings (App/Viewport hooks, dialog effect, unused test imports); no new warnings in the added files. Feature checker 4 features/0 errors/0 warnings; whitespace/diff checks pass.
- Actual browser: installed Chrome, fresh disposable shared SQLite roots. Development Vite→FastAPI and built FastAPI serving each pass one end-to-end journey: manual project/sample CRUD, open source, two screenshot prompts with distinct grounded responses, bounded history, API error remains JSON, unchanged manifest after chat. Artifacts under /private/tmp/hp-chat-e2e-3SV8IK and /private/tmp/hp-chat-e2e-sCKCIz.
- No live root/server was selected for verification. No Bedrock, AI application writes, new dependency, commit, push or cutover command.

## Deviations

Existing numeric/clinical frontend mock expectations were replaced with assertions on explicit server-returned metadata/unavailability; preserving invented measurements would contradict the read-only contract. Scoped forwarding is a new middleware registered before the unchanged apiPlugin, because its global JSON parser consumes bodies before a later proxy could forward them. Browser setup uses installed Chrome when bundled Playwright Chromium is absent; no browser capability was fabricated. An incorrect initial browser expectation of 405 was corrected to the established unknown-API JSON 404 contract, with exact response-body assertion. No broader specification acceptance is inferred.
