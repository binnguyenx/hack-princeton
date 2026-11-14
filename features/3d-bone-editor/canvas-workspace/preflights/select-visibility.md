# Preflight: Select and Visibility

Owner: coordinator. Date:2026-11-14. Status: complete.

Read AGENTS/workflow skills, PRODUCT/DESIGN, current canvas intent/spec and reconciled mechanics README, current dirty diff, App/viewport/canonical ids/session ops/debug and existing view/browser tests. The owner explicitly requests R69–R75 implementation with intent/spec → plan → code → test. Earlier dirty source is snapshotted by hashes at /private/tmp/hp-select-visibility-before.json; no reset/cleanup/commit/push. Tests use disposable application storage. No backend route, reconstruction or AI registry changes. Selection and visibility are view-only, not an accepted general agent mutation facade.

Before coding: separate intent/spec updated; scoped plan written. Main risks: sample/source-id mismatch, stale async mesh identity, mutable cached materials and view refresh rebuilding geometry. Real browser proof is required, not just handler/state tests. Update this record with evidence at Close.

## Verification and Close

R69–R75 implemented and reviewed.117 backend tests,99 app tests,10 full browser journeys plus2 strengthened final focused scenarios passed. Build/typecheck passed; lint0 errors/8 inherited warnings. Feature checker0 errors/0 warnings; diff check clean. Source/hidden screenshots inspected. Current code and setup agree on whole-object selection, per-session visibility and remaining face/region/persistence/AI boundaries. Camera snapshot regression was resolved through frame-current diagnostics, with strict stable-camera tests retained. All HTTP/browser tests used disposable roots; no live mutation was executed. Backend/AI registry/data/dependency hashes unchanged. Detailed commands/logs/deviations are in plans/select-visibility.md.
