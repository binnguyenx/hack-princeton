# Preflight: reviewed feature publication against latest main

Date:2026-11-14. User authorized diff review, feature splitting, commit/push and PR creation without merge, followed by pulling latest code. Prior autonomous-choice/no-question instruction remains applicable. Source snapshot preserves the original dirty/untracked workspace outside the repo. Live data, virtualenv and independent recovery runtime are excluded.

## Upstream integration

Base: latest fetched main d9bd21d (PR10/11 Radix management and Cross-reference Workbench). Previous published AI baseline6c065f9 is an ancestor. Three-way integration preserves all upstream production UI/design files and Radix Themes dependency. Only shared package/config/docs/test conflicts were resolved. The standalone new upstream app/server/storage.ts helper is untouched and is not registered by the live API.

## Review findings and repairs

- P1: concurrent FastAPI transform calls read pointer/order before BEGIN and could create [0,1,1]. Existing transaction now encloses reads/allocation; public concurrent-call regression proves [0,1,2], immutability, both poses/hashes and current pointer.
- Cascade capture: concurrent import before delete lock could escape the pre-transaction volume list. Case/project list reads now occur inside the same transaction. Deterministic import/delete regressions prove no uncaptured asset/file. Proposed D4/D5 public error/recovery behavior is unchanged.
- Browser config previously covered only migration tests; merged config retains both upstream canvas journeys plus3 migration checks. All5 use actual Chrome and disposable FastAPI roots. Canvas assertions are unchanged; fixture setup and UI selectors follow latest UI.
- Focused source/test ownership split: application repository and backup; API/migration/browser; graph/tool registry; final docs/agent/handoff records. No credential, live DB, backup/runtime directory or generated clinical data is staged. The only SQLite fixture is checksum-locked synthetic Node-created test data.

## Verification

Python107 tests pass. App87 tests/33 files pass. Chrome5 tests pass, including WebGL loss/rebuild. Build/type pass. Lint exit0 with8 inherited latest-main warnings; new fixture callback lint errors were repaired by renaming callback, not disabling rules. Feature checker0 errors/0 warnings. Whitespace clean.

## Publication scope

PR1 Python application repository/backup and19 application tests. PR2 FastAPI13 routes, Express removal, real shared contracts, latest UI/browser integration. PR3 genuine fake-model LangGraph/tools and11 graph tests. PR4 final docs/agent/cutover/publication handoff. Dependent branches expose coherent intermediate setup/runner scope; final documentation restores the complete reviewed snapshot.

Do not merge PRs or push main. Pull after publication on a local integration branch while preserving live data and the pre-publication snapshot/stash. Rebuild and verify before resuming the sole FastAPI process. No new live cutover/recovery behavior is introduced by these transaction fixes.
