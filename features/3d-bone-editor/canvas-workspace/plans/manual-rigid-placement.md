# Plan: Manual rigid placement

Spec: [spec.md](../spec.md) · Status: done · Date:2026-11-14

> Historical: describes how this change was built. For current behavior, read spec.md.

## Approach

Replace the fixed8mm demonstration with numeric rigid placement over the captured candidate revision. Keep source volumes unchanged and retain the existing UI contract. The owner authorized defining and implementing this bounded real mechanical tool; whole unrelated feature proposals are not accepted implicitly.

## Files that change

App.tsx, RigidPlacementControls.tsx, Inspector.tsx, App.css, geometry/rigidPlacement.ts and pose.ts: R63,R64,R67,R68. Application placement service/repository, API route/factory/client: R65,R66. Focused math/component/HTTP tests, browser placement and existing migration browser input: R63–R68. Existing canvas intent/spec and AI integration/setup/project/PRODUCT/AGENTS docs explain capability boundaries and current test counts.

## Order of work

1. Test rotation render/composition, then implement proper matrices (R63,R64).
2. HTTP success and stale/ownership/invalid-matrix/rollback/concurrency proofs before service/commit implementation (R65,R66).
3. Numeric controls and transient preview/guarded Apply; verify actual UI Apply/Cancel/Restore (R63,R64,R67,R68).
4. Full backend/app/build/lint/browser and feature/diff checks; Close.

## Proof

- R63,R64: app/tests/rigidPlacement.test.ts and app/tests/ui/rigidPlacementControls.test.tsx; actual browser numeric preview/cancel checks.
- R65,R66: backend/ai/tests/integration/api/test_placement.py with disposable SQLite/NRRD, invalid/ownership/stale/rollback and concurrent expected-revision tests.
- R67,R68: app/e2e/placement.e2e.ts plus existing migration journeys; verify hashes, immutable previous pose, restored pointer and persisted pose.
- Commands: `.venv/bin/python -B backend/ai/tests/run_checks.py`; from app `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test`, `npm run build`, `npm run lint`, `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser`; feature checker/diff check.

## Risks

Existing applyPoseToObject only translates and would misrender saved rotation. GLB/voxel root scale must survive. Preview clones cannot mutate cached committed mesh/materials. Snapshot identity must reject tab/revision drift. Persisted old poses may be invalid; reject them for new construction rather than silently repairing them. Editor-world axes are not promised patient coordinates. No clinical geometry claims.

## Deviations

The existing13 routes remain unchanged; a separate strict manual-placement endpoint supplies atomic expected-revision checks. Viewport.tsx also preserves camera on same-object mesh updates so preview does not silently navigate. The controls test uses effective :disabled semantics (fieldset inheritance); its original DOM property assertion did not represent actual disabled behavior. Browser camera comparisons use1e-8 tolerance for OrbitControls floating-point updates, while exact data/hash assertions remain unchanged. No geometry generation contract was invented.

## Close evidence

117 Python tests passed (including five manual HTTP tests and concurrent201/409 ownership).93 app tests passed across36 files. Full actual browser suite8/8 passed; strengthened placement journey also passed focused, including invalid input, screen navigation clearing drafts, controlled503 failure with retained draft, retry, source bytes, committed pose and restore. Build/typecheck passed; lint0 errors and8 inherited warnings. Feature checker0 errors/0 warnings; diff check clean. Initial math/HTTP reds showed untranslated rotation and missing placement route. Screenshot inspected at /private/tmp/hp-manual-placement-preview.png. One earlier canvas run missed a pointer click; unchanged focused canvas checks2/2 and subsequent full8/8 passed. No test retry configuration was introduced.

Trace: intent manual-construction amendment → R63–R68 → proof tests → scoped diff. No stray capability, automatic acceptance of unrelated specs, model integration, schema/dependency change or AI live mutation. The first real manual tool is rigid placement; voxel construction/reconstruction and measurements remain future contracts.
