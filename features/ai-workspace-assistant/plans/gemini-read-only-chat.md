# Gemini read-only chat plan

Status: done (scoped implementation authorized in chat, 2026-11-14; whole draft intent/spec remain unchanged in acceptance status)

## Approach
Use Gemini generateContent structured JSON for registry proposals and result-grounded conversational explanations. Keep the graph and metadata-only execution boundary; do not implement mutation or geometry. A per-request adapter holds bounded history transiently. Use backend environment configuration, fixed provider origin, no retries and bounded HTTP reads. Browser state keeps history only in memory.

## Files that change
- `backend/ai/src/skullfix_ai/agent/gemini.py` (new): configuration, transport, typed output and grounding (R96–R97/R99).
- Existing `agent/workflow.py` and `api/routes/chat.py`: model explanation hook, safe errors and explicit provider envelope (R96–R98).
- Existing `app/src/ai/langGraphClient.ts` and `app/src/ui/AiChatPanel.tsx`: read-only envelope, truthful badge and welcome (R98–R99).
- API and existing frontend chat tests: provider failures, history, strict tools, grounding, reset and no-write proof (R96–R99).
- Feature intent/spec/plan/preflight/prompt, setup, project index and work summary: scope and verified commands (R96–R99).

- `backend/ai/.env.example` and `.gitignore`: backend-only configuration template and local credential exclusion (R96).
- Dedicated chat browser config explicitly pins fake mode and clears its key to prevent paid provider calls during regression runs (R99).

## Proof
- R96/R97/R99: disposable API integration tests with Gemini transport doubles, followed by full `backend/ai/tests/run_checks.py`.
- R98/R99: app chat tests, full npm test, build/lint and guarded dev/built read-only-chat browser journeys.
- All: feature checker, diff whitespace and hashes of recovery CSS/viewport/slices/plugin/server against PR #31 dependency.
- Optional real provider smoke on synthetic disposable context; no live datasets or transcript persistence.

## Dependencies and risks
This checkout starts at origin/main 61189d7 with an uncommitted PR #31 e73798d dependency overlay. That is not a merge or a publication. Dependency hashes are recorded externally. Keep all work isolated; no running app restart. Explicit model IDs avoid guessing an account's available model. Provider prose remains probabilistic; structured fact rendering and numeric checks reduce fabricated metrics, not certify semantic correctness.

## Deviations
None yet.


## Close evidence
- Backend: 151 tests passed (`/private/tmp/hp-llm-python-final.log`), including seven new provider API tests.
- App: 115 tests passed across 39 files (`/private/tmp/hp-llm-app-escalated.log`); build/TypeScript passed; lint no errors, inherited warnings.
- Browser: 3/3 dev and 3/3 built; dedicated canonical disposable roots, explicit fake mode/key cleared. These browser journeys verify transport/recovery integration; provider wire is covered by backend doubles and a real synthetic Gemini smoke, not a claim that browser regression used paid Gemini calls.
- Real Gemini: exact text key authenticates; `gemini-3.5-flash-lite` completed all five graph nodes; all disposable storage hashes unchanged. Earlier image OCR credential returned 401; earlier 3.8 model smoke timed out. Result at `/private/tmp/hp-gemini-smoke-result.json` contains synthetic output only.
- Protected recovery CSS, viewport, slices, SQLite plugin and server files match the PR #31 dependency byte-for-byte. Private env mode 0600, ignored, no actual credential in publishable files. Feature checker and whitespace checks pass.
- No commit/push/merge, live runtime changes, geometry capability binding or AI writes.

## Implementation notes
Provider proposals use the registry's concrete argument schemas rather than a recursive arbitrary-JSON argument schema. Explanations run inside the existing graph explain node and never use the scripted fake override. Each request always performs the permitted metadata read before composing an answer or clarification; this slice adds no general multi-tool agent loop or new terminal-status enum.

## Deviations (resolved)
The generated sample catalog/folder from build/browser sync was removed/restored after verification; no sample change is part of this slice. Existing env template and ignore entries were retained. Socket-based app tests required execution outside the sandbox; the initial sandbox attempt failed to bind local test servers and is not counted as passing. The selected configured model is the account-listed, smoke-verified Flash-Lite model, rather than the slower model first tried.


## Publication review — 2026-11-14
The owner authorizes reviewed commit/push and a separate PR, not merging or runtime activation. Publication is isolated on `feat/gemini-metadata-chat`, based on PR #31 head `e73798d`; only the Gemini delta is copied, and no private env is copied to this checkout. Original implementation workspace and its ignored env remain intact.

Review found and repaired frontend error reporting: missing backend Gemini configuration must show `model-config-invalid`, and explanation-stage errors retain their typed provider code. Two client regressions demonstrated the failures before repair. App inventory is now 117 tests. The running app remains the main-workspace fake model; resetting its chat cannot activate unpublished provider code or env. This PR does not change that runtime.


Publication checkout verification: 151 Python tests and 117 app tests pass; build/typecheck and lint exit zero (inherited warnings only); dev 3/3 and built 3/3 browser journeys pass. Feature checker: four features, zero errors/warnings. Recovery CSS/viewport/slices, App/CanvasWorkspace wiring, Vite config, original apiPlugin and server CRUD have no delta against PR #31. Only the existing chat badge/copy/client state changes. Named staging and secret scan cover the entire staged tree. Generated sample copies/catalog are excluded. This review found no remaining release-blocking defect within the read-only scope; quantitative prose remains guarded and qualitative model correctness is not certified.
