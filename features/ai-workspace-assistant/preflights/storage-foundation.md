# Preflight record: storage-foundation

Responsible agent: main agent. Template: [../preflight.md](../preflight.md). One editor at a time.

1. **Task and file scope.** Add storage/artifact interfaces, standard-library SQLite application storage, contained local artifact handling, test-local fixture seeding, deterministic storage tests, and synchronized AI documentation. No API, graph, model, adapter, or operation-service implementation.
2. **Documents read.** `AGENTS.md`; intent-spec-plan and TDD skills including update/format/test-harness guidance; all `docs/ai/`; feature intent, spec, active and archived plans, preflights; assignment briefs; schemas; operation seam; package configuration; fixtures; scenarios; and existing tests.
3. **Requirement IDs.** R10, R11, R12, R23, R24, R27, R28, R29, R31, R33, R34, R42–R49; S12, S13, S16, S17, S20, S27–S34. R35–R39 and S21–S24 remain proposed and excluded.
4. **Classification.** Authorized foundation capability within the accepted backend authority, immutable-revision, artifact, run, and idempotency boundaries.
5. **Intent.** Append the owner-authorized storage slice and its exclusions. Do not rewrite the original intent or mark the overall draft accepted.
6. **Spec and contracts.** Append storage-specific requirements and success criteria; clarify storage guarantees, artifact authority, reconciliation, and the opaque request-reservation boundary. Do not define real operation contracts or AI retry/recovery.
7. **Acceptance.** The owner explicitly authorized this storage slice and waived separate plan approval. The overall intent/spec remain draft because unrelated operation contracts and R35–R39 are unresolved.
8. **Dependencies and assumptions.** Use Python 3.11+, Pydantic 2.12.5, and the standard library. Existing fixtures are synthetic test inputs. SQLite is authoritative application storage; future LangGraph checkpoints remain separate and unimplemented. A request identity token is supplied by future application code and is not a fingerprint implementation.
9. **Verification.** Use vertical red-green-refactor slices. Run new artifact/storage tests, shared-schema tests, fixture validation, missing-contract regression, feature-document checker, IDE lints, and `git diff --check`.
10. **Conclusion.** Coding may begin for interfaces, SQLite application records, local artifacts, and deterministic tests only. Do not implement R35–R39, LangGraph, Bedrock, FastAPI/SSE, operation orchestration, adapters, or geometry.
