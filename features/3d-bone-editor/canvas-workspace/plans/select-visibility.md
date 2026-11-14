# Plan: Object Select and rendered Visibility

Spec: [spec.md](../spec.md) · Status: done · Date:2026-11-14

> Historical: describes how this change was built. For current behavior, read spec.md.

## Approach

Connect validated view ops to the actual single active Three.js object. Use canonical source/candidate ids, a small pointer-gesture gate plus real raycasting, and a separate bounding outline. Visibility is session-only view state with explicit recovery. Owner explicitly authorized this scoped implementation and routine choices without extra approval questions; this does not accept other deferred feature requirements.

## Files that change

- ops/session.ts and ops/index.ts; debug/bridge.ts: identity/hidden validation, stale selection clearing, Show All and selection/visibility diagnostics (R69,R71,R73,R75).
- viewport/objectInteraction.ts and Viewport.tsx: gesture gate, real-camera raycasting, isolated highlight lifecycle, visible roots, hidden recovery and fresh refs (R69,R70,R72–R74).
- App.tsx: canonical identity, mesh ownership/readiness, shared handlers, geometry-only rebuild dependencies (R69–R75).
- ui/ViewController.tsx, ui/Inspector.tsx (distinct document/selected ids), canvasFeatureHints.ts, commands/registry.ts and App.css: compact hide/show controls/menu and visible recovery (R72,R73).
- Focused view ops, Three.js interaction, UI and actual browser tests: R69–R75.
- Canvas intent/spec/current gap report, README, setup/project/work summary/AGENTS and this task preflight: current capability and remaining limits.

## Order of work

1. Record requirements/preflight; write failing public view-op tests, implement guards and Show All.
2. Write real-Three raycast/gesture tests before the interaction module; wire the viewport and UI.
3. Prove actual source/candidate selection, miss/drag/modified/cancel behavior, rendered hide/show/recovery, tab lifecycle and unchanged HTTP manifest/volume bytes in Chrome.
4. Run backend regression, app suite, build/typecheck, lint, browser suite, feature checker and diff/scope review; update docs and Close.

## Proof

- R69,R70: tests/objectInteraction.test.ts plus real browser selectVisibility.e2e.ts (both camera types, hit/miss/drag/modifiers).
- R71,R73,R75: tests/selectionVisibility.test.ts shared ops tests and browser tab/recovery state with manifest/hash invariants.
- R72,R74: real browser renderer matrices/visible/highlight ids, screenshot differences, camera invariants and renderer rebuild; focused UI button checks.
- Commands: `.venv/bin/python -B backend/ai/tests/run_checks.py`; from app `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test`, `npm run build`, `npm run lint`, `SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser`; feature checker and diff check.

## Risks

Sample document id differs from its canonical source object id. Async old meshes cannot inherit a new tab's identity. Selection/visibility refresh must not rebuild geometry or cached materials. OrbitControls and custom roll retain pointer navigation; drag or modified clicks must not select. Hidden state needs recovery without a selected mesh. View state is intentionally not backend persisted. Keep existing dirty code and all prior tests intact.

## Deviations

Added explicit mesh document ownership and geometry-only rebuild dependencies so view refresh cannot relabel stale geometry or rebuild it. Added OpsContext.onViewChange for the shared selection/visibility debug path without changing legacy domain-mutation semantics. Inspector distinguishes document id from canonical selected object id. Camera diagnostics now update each rendered frame: end/change-event snapshots were stale during OrbitControls damping and failed the visibility camera oracle; the final test waits for actual camera rest and keeps its1e-8 comparison. These changes support R69–R75 and introduce no backend or data mutation capability.

## Close evidence

- Backend regression:117 tests/OK, `/tmp/hp-select-backend.log`; backend/AI registry sources, data and dependency files have identical task-start hashes.
- App suite:99 tests across40 files passed, `/tmp/hp-select-app-final.log`. Includes six new tests for shared view identity/hidden guards/tab state, real-Three raycasting/gesture gating, UI hide/show controls and distinct inspector identities.
- Build/typecheck passed, `/tmp/hp-select-build-final.log`. Lint exit0 with8 inherited warnings and no added warnings, `/tmp/hp-select-lint-final.log`.
- Full actual Chrome suite:10 passed in40.2s, `/tmp/hp-select-browser-close.log`; no skipped tests. Stronger final Select/Visibility scenarios also passed2/2 in19.4s, `/tmp/hp-select-browser-race-final.log`, including holding a pointer across a tab/mesh swap and cancellation.
- Real-browser assertions cover canonical source/candidate ids, perspective/orthographic hits, miss/Escape, drag/modifier rejection, screenshot/outline change, no backend writes, exact source bytes/manifest/matrices, hidden recovery without selection, Show All across tabs, debug view notification and selected WebGL rebuild.
- Screenshots inspected at /private/tmp/hp-select-visible.png and /private/tmp/hp-object-hidden.png. Existing local FastAPI health/frontend GETs return200; no restart/live test writes were needed.
- Reds before implementation: unknown visibility target, missing raycast module, missing visibility controls and missing selected-object inspector label. Initial HTTP app tests could not bind sockets in the restricted shell; the same suite passed in the permitted local-server environment. No test was weakened, skipped or configured for retries.
- Feature checker:4 features,0 errors,0 warnings. git diff --check and scoped diff review pass. Intent amendment → R69–R75 → plan → code/tests trace is complete; no unrelated capability accepted.

No reconstruction, physical measurement, face/region picking, persisted view settings, provider, chat widget or AI live mutation. No commit/push. Existing uncommitted work is preserved.
