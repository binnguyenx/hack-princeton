# Preflight: S13 rehearsal ordering correction

Date: 2026-11-14 · Responsible agent: main migration-planning agent · Classification: documentation-only plan correction

## 1. Task and file scope

Move S13 from the live cutover sequence to a pre-cutover disposable rehearsal. Separate successful live migration from conditional rollback. Update Markdown only and preserve earlier preflights as historical records.

## 2. Documents inspected

- `AGENTS.md` and intent-spec-plan workflow guidance
- Migration intent, spec, plan, `preflights/migration-planning.md`, and `preflights/migration-review-follow-up.md`
- Migration sections in `docs/project.md`, `docs/ai/architecture.md`, `docs/ai/app-integration.md`, `docs/ai/setup.md`, and `docs/ai/work-summary.md`

## 3. Requirement IDs

This correction revises R18 and R30, adds R33–R34, revises S13, and adds S16. Existing requirements and proposed D1–D5 remain otherwise unchanged.

## 4. Classification

Documentation defect correction. The previous Phase D order performed the rollback rehearsal on live data after enabling writes, so the nominal successful path incorrectly ended on Express.

## 5. Intent

Append an amendment: S13 uses disposable storage before live cutover, and successful live migration ends with FastAPI running.

## 6. Spec and contracts

- Parity: separate disposable roots for Express and FastAPI.
- S13: one disposable database/volume dataset handed sequentially Express → FastAPI → Express → FastAPI.
- Live success: Express stops, paired backup is verified, FastAPI becomes sole writer, and FastAPI remains running.
- Live rollback: separate and conditional, retaining the existing pre-write/post-write/reconciliation rules.

No UI API, schema, file layout, revision, restore, or unresolved compatibility decision changes.

## 7. Acceptance

The owner authorized this documentation correction only. The migration documents remain draft; no implementation or rehearsal is accepted as complete.

## 8. Dependencies and assumptions

- Express and FastAPI retain compatible schema/file formats as planned.
- S13 uses temporary or disposable copied data, never live storage.
- One backend writes the rehearsal dataset at a time.
- No dual writes, automatic recovery, schema redesign, or data migration is introduced.

## 9. Verification

- Trace S13 before all live shutdown/backup/cutover steps.
- Confirm the nominal live sequence ends with FastAPI running.
- Confirm Express appears in live steps only under a conditional rollback heading.
- Verify proof mappings for R33–R34.
- Run the feature-document checker and `git diff --check`.

## 10. Conclusion

The documentation correction may proceed. No backend process, rehearsal, live-data operation, or implementation is authorized.

A preflight records readiness. It does not grant acceptance or authorize unrelated implementation.
