# Historical nine-task development verification evidence

Date: 2026-11-14. Overall draft documents were not marked accepted. This record is actual local evidence, not a claim of live deployment.

## Scope and preservation

The coordinator inspected repository instructions, migration and AI intent/spec/plan, actual D1–D5 proposals, current diff, work summary and Phase A contracts. Three subagents owned disjoint repository, transport and graph paths; the coordinator owned shared integration, dependencies, routing and final review. Snapshot of pre-existing dirty/untracked work: /private/tmp/hp-nine-task-snapshot. No commit, push, PR, merge, live backup or live data handoff was performed.

## Task status

- T01 done: decision sheet records unapproved proposals and baseline-preservation strategy under owner delegation. Actual Express router inventory is checked, not just a handwritten count.
- T02 done: application repository and bidirectional Node/Python copied-data verification.14 repository tests include precommit transaction/file rollback, postcommit orphan-cleanup baselines, ownership, restart and sandbox separation.
- T03 done for baseline compatibility: real FastAPI process passes same16 shared contracts; exact13 real route inventory verified for both backends.10 additional API/static tests cover parser/serving/errors. No hardening proposal silently applied.
- T04 done: actual Chrome development proxy and builtFastAPI UI checks; frontend-only preview verified. Default dev backend remains Express until cutover.
- T05 blocked only for live cutover: disposable S13 succeeded in the exact required order with closed prior writer, copied Node data, both-era integrity and continued writes after each handoff. No approved concrete live root/procedure or verified live backup exists; read live-cutover-runbook.md.
- T06 blocked: no agreed/satisfied observation or rollback-support window and no authorized live cutover. Express/Multer remain installed; no Express-free clean-install result is asserted.
- T07/T08 done: genuine StateGraph compiled with load_context→propose→validate→execute→explain. Authoritative repository context, restored pointers, typed registry, capability gating, unknown/invalid proposals, failed adapters, fabricated output and model context mutation are tested. Mock reconstruction delegates to existing OperationService with separately bound sandbox identities. No live writes/provider/checkpoint/SSE implementation.
- T09 done for available-scope acceptance/handoff: docs/setup reflect verified implementation and blocked live/removal steps. Full migration completion is not claimed.

## Commands and results

The local interpreter was /private/tmp/hp-implementation-venv/bin/python; docs/ai/setup.md gives portable .venv commands.

```sh
PYTHONDONTWRITEBYTECODE=1 /private/tmp/hp-implementation-venv/bin/python -B backend/ai/tests/run_checks.py
# Ran 99 tests; OK (64 existing +14 application +10 API/static +11 graph)

cd app
SKULLFIX_PYTHON=/private/tmp/hp-implementation-venv/bin/python npm test
# 22 files; 74 tests passed

npm run build
# TypeScript and Vite production build passed; existing bundle-size warning

SKULLFIX_PYTHON=/private/tmp/hp-implementation-venv/bin/python npm run test:browser
# 3 actual Chrome tests passed (development, builtFastAPI, frontend-only preview)

npm run lint
# Exit0; two existing warnings: nrrdImport unused mkdir and App useMemo tick dependency
```

Focused evidence: app/tests/applicationCompatibility.test.ts creates Node state, copies DB+volumes, compares Python reads/writes, reopens/writes via Node and invokes the real graph over the restored copied pointer without mutation. app/tests/backendContract/handoff.test.ts is the actual four-stage S13. Browser tests use prepared NRRD through UI, not mocked API responses: project→case→import→candidate→transform→restore→reload, backend restart, binary bytes/SHA256, API JSON errors and SPA refresh/assets.

A separate temporary npm ci install passed (250 packages, audit0 vulnerabilities) with Express retained; this validates the updated lockfile, not T06 removal. Editable Python install with the test extra passed. Original app dependency versions/platform metadata were preserved; only pinned Playwright entries were added.

## Reviews and repair evidence

- Registered-router inventory initially failed against missing enumeration, then passed against actual Express router.stack. FastAPI inventory reads the actual generated OpenAPI methods/paths. Shared scenario inventory remains a separate coverage map.
- Independent reviewer reproduced multipart filename path fallback and compressedJSON incompatibilities using real Express HTTP. Transport owner wrote failing regressions, then matched basename fallback, gzip/deflate/br/zstd, malformed400HTML, unsupported415HTML and decoded10MiB413. Final10 API/static tests passed.
- Graph negative-output test exposed an invalid observation crash; graph now fails closed and never manufactures successful explanation. Contour-guided generation is unsupported rather than advertised available.
- Browser initial test grep selected no cases; corrected to actual discovered tests. Vite callback TypeScript inference was corrected. These setup failures were not reported as passing behavioral checks.
- Manual Python discovery without PYTHONPATH failed imports; after proper editable installation the shared runner passed99. No required check was replaced by a mock or unit test.
- No unresolved failure reached three repair cycles; no tests weakened or ignored to pass.

## Current writer and residual limits

No task-created test server is retained after the harness cleanup. A read-only check found no listeners at the documented local ports5173/8000/4173 at verification time. Alternate operator-managed processes were not inferred absent. The default dev configuration still mounts Express; HACK_API_ORIGIN explicitly selects FastAPI for a particular dev process. No live root was opened or changed by the queue. Final target remains one FastAPI backend, not two deployed authorities.

D1–D5 hardening remains proposed; baseline defects are explicit limitations. Bedrock/model API calls, checkpoint resume, SSE, real geometry, generatedNRRD publication, pre-model recovery and live AI mutation remain unimplemented. Live cutover and observation/removal require the specific evidence in the runbook; an artificial observation period was not invented.

## Final documentation checks

Feature checker:0 errors,2 pre-existing 3d-bone-editor warnings (window.__hackPrincetonDebug treated as path; missing proof IDs in editor plan). git diff --check passed. Current setup/architecture/spec evidence, task board and preflights were updated; historical summary was preserved separately. No acceptance of a full draft spec was inferred.

## Subsequent authorized live completion

The earlier live/removal blockers were explicitly resolved by owner approval. Actual full30-minute monitoring, backup/restore, post-cutover snapshot, current-data rollback-copy proof and Express removal now pass. Current105 Python/45 app/3 actual Chrome checks, clean Express-free npm installation, build/type/lint and docs/whitespace checks are recorded in cutover-completion.md. Earlier counts remain historical development evidence. No commit/push.
