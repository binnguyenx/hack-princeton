# Preflight: UI/backend contract alignment

Responsible agent: main agent. One editor at a time.

1. **Scope:** Inspect pulled app, fix AI contract drift with typed read-only context, guard against duplicate app storage, and update docs/tests. No UI redesign or graph/model implementation.
2. **Read:** AGENTS.md, PRODUCT.md, app domain/types, API client/router/storage, mechanical operations, app-model/business-ui specs, AI docs/specs/plans and skills.
3. **Requirements:** R58–R63; S43–S47.
4. **Classification:** Owner-authorized integration correction.
5. **Intent:** Append the live app authority and isolated-demo distinction.
6. **Spec/contracts:** Record existing UI types and missing atomic mutation/publication capabilities; do not pretend a bridge creates them.
7. **Acceptance:** The current request authorizes fixes using UI behavior as canonical. No broader operation, model or recovery acceptance is inferred.
8. **Dependencies:** Existing Pydantic, Python standard library HTTP reader and app locked dependencies. No geometry imports, raw SQL reads of the app by AI, or external model.
9. **Verification:** Vertical TDD; fixture/real Node manifest contract tests, sandbox guard, Python regressions, app tests/build/lint, feature checker, diff check.
10. **Conclusion:** Proceed with this bounded alignment. Graph and app mutations remain separate future tasks.

## Outcome

Completed the read adapter, real UI schemas, sandbox guard, and cross-language proof. Python: 64 tests pass. App: 42 tests pass; build passes; lint has three existing warnings. No UI runtime code was changed. Live AI mutation remains deliberately unavailable because the app API lacks the required atomic request/revision contract. The feature checker has no errors and retains two inherited editor warnings.
