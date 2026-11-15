# Gemini read-only chat preflight

Date: 2026-11-14. Owner: coordinator. Status: completed; proof and limits recorded in the scoped plan.

Authorization: owner requested prompt plus implementation, selected Gemini and supplied a key. The key is private runtime configuration, never a repository artifact. No commit/push/merge/live restart.

Read: AGENTS, PRODUCT/DESIGN, AI workflow/integration, separate intent/spec and previous PR #31 repairs, intent-spec-plan/TDD and verification guidance. Scoped authorization permits this implementation without marking the whole draft accepted.

Authority: ApplicationRepository read-only snapshot; metadata tool only; ownership/current pointer/spatial metadata remain authoritative. Keep Vite SQLite CRUD and recovered shell untouched.

Isolation: `/private/tmp/hp-llm-read-only` branch `feat/llm-read-only-chat`, uncommitted PR #31 dependency overlay. Main workspace/user modifications/live root/processes are untouched. Tests allocate disposable roots and exclusive browser profiles.

Acceptance: R96–R99; bounded history in memory, provider errors explicit, no fake fallback, typed validated metadata execution and observation-grounded explanation. No geometry tool, Bedrock or live mutation. Proof commands/evidence are in the scoped plan.


Publication authorization: owner explicitly requests review → commit → push → separate PR, without merge. PR base is the still-open PR #31 branch; dependency code is not duplicated. Publication tests run in a separate checkout, with no real key/env file copied and only disposable storage. Named paths are staged after protected-file and staged-tree secret checks.
