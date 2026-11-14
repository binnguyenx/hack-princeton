# Preflight record: shared-schemas

Responsible agent: main agent. Template: [../preflight.md](../preflight.md). One editor at a time.

1. **Task and file scope.** Correct artifact and validated-selection fixture shapes; separate S10 adapter substitution from AF-12; replace the active fixture plan with a shared-schema implementation plan while preserving fixture history; add focused Pydantic schema modules, package metadata, schema tests, and fixture deserialization through those models.
2. **Documents read.** `AGENTS.md`, the intent-spec-plan and TDD skills and their update/test-harness references, all AI docs, intent/spec/plan and preflights, assignment briefs, schema scaffold, operation seam, fixtures, scenario index, and existing tests.
3. **Requirement IDs.** R1, R2, R5, R12, R13, R14, R20, R22, R24, R25, R26, R27, R29, R31, R34, R40, R41; S9, S10, S11, S17, S18, S19, S25, S26. R35–R39 and S21–S24 remain proposed and are not implemented.
4. **Classification.** Authorized contract correction and new shared-schema foundation implementation. No application operation, route, workflow, model call, persistence, or adapter behavior is added.
5. **Intent.** Add an amendment recording the authorized canonical artifact and selection-reference corrections. No change to the product goal.
6. **Spec and contracts.** Append explicit requirements and scenarios for `retrieval_url` and full revision-bound selection references. Keep retry lifecycle requirements proposed and unresolved.
7. **Acceptance.** The owner explicitly authorizes these two corrections and shared-schema implementation within the accepted foundation scope. This does not accept unresolved real mechanical contracts or the proposed retry lifecycle.
8. **Dependencies and assumptions.** Use Pydantic 2.12 APIs already available locally and pin `pydantic==2.12.5`. There was no existing Python package configuration. Shared models validate structure only; case membership, capability, freshness, idempotency, persistence, and geometry correctness remain application checks.
9. **Verification.** Use vertical TDD for public schema seams. Run schema unit tests, fixture validation, the existing missing-contract unit test, feature-doc checker, lints, and `git diff --check`. No network, AWS, or live integration is required.
10. **Conclusion.** Coding may begin for canonical shared schemas and fixture reuse only. Do not implement R35–R39, FastAPI, LangGraph, Bedrock, storage, operation execution, reconstruction adapters, or unresolved operation schemas.
