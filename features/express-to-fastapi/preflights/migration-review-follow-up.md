# Preflight: Migration review follow-up

Date: 2026-11-14 · Responsible agent: main migration-planning agent · Classification: documentation-only requirement correction

## 1. Task and file scope

Correct rollback data preservation and define routing outside Vite development. Update only Markdown. Preserve `preflights/migration-planning.md` as the original planning record and preserve unrelated working-tree changes.

## 2. Documents and source inspected

- `AGENTS.md` and the intent-spec-plan/TDD workflow guidance
- `features/express-to-fastapi/intent.md`, `spec.md`, `plan.md`, and `preflights/migration-planning.md`
- `docs/project.md`
- `docs/ai/architecture.md`
- `docs/ai/app-integration.md`
- `docs/ai/setup.md`
- `docs/ai/work-summary.md`
- `app/vite.config.ts`
- `app/vite-api-plugin.ts`
- `app/package.json`
- `backend/ai/pyproject.toml`
- `app/server/storageSqlite.ts`

## 3. Requirement IDs

This correction revises R18–R20 and R26, adds R27–R32, revises S9–S12, and adds S13–S15.

## 4. Classification

Documentation defect correction. The prior rollback sequence could discard acknowledged post-cutover writes, and the prior routing plan covered Vite development but not a supported built-frontend launch.

## 5. Intent

The intent needs an amendment clarifying one final FastAPI application backend, two rollback stages, Vite's frontend-only role, and post-write data preservation.

## 6. Spec and contracts

The spec must:

- Separate pre-write snapshot rollback from post-write code/runtime rollback.
- Require preservation and verification of FastAPI-era acknowledged writes.
- Treat any acknowledged-data loss as destructive and separately approved.
- Define development, preview, and production-style local routing.
- Keep the API route precedence and SPA fallback boundary explicit.
- Direct future AI integration to the same FastAPI application-service boundary.

Current UI API, schema, NRRD layout, hashes, poses, revision order, and restore semantics remain unchanged.

## 7. Acceptance

The migration intent, spec, and plan remain draft. This requested correction authorizes documentation edits only; it does not accept D1–D5 or authorize implementation.

## 8. Dependencies and assumptions

- The first migration retains the existing SQLite schema and NRRD layout, so a verified Express runtime can be tested against FastAPI-produced data.
- Compatibility must be proved before code/runtime rollback is declared safe.
- Database and volume files form one durable set even though filesystem work is not transactionally atomic.
- The existing Python AI sandbox remains an isolated library/test environment.
- No event log, dual-write system, automatic recovery service, schema redesign, reverse proxy, or hosting platform is introduced.

## 9. Verification

- Trace revised requirements through Phase D/E rollback and routing steps.
- Verify proof mappings include R27–R32.
- Run the feature-document checker.
- Run `git diff --check`.
- Confirm this follow-up modifies Markdown only.

## 10. Conclusion

Documentation correction may proceed. Implementation remains blocked on draft review, phase-specific preflights, contract tests, and unresolved compatibility decisions.

## Reusable implementation-slice checklist

1. Read the migration intent/spec and applicable existing contracts.
2. Identify affected requirement IDs and ownership boundaries.
3. Create a task-specific preflight and update the relevant plan.
4. Define or update the failing contract/regression tests first.
5. Implement only the scoped slice.
6. Run appropriate checks.
7. Update documentation with verified behavior and remaining gaps.

A preflight records readiness. It does not grant acceptance or authorize unrelated implementation.
