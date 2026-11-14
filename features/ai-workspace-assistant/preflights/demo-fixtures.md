# Preflight record: demo-fixtures

Responsible agent: main agent. Template: [../preflight.md](../preflight.md). One editor at a time.

1. **Task and file scope.** Add deterministic synthetic demo fixtures, an acceptance-scenario index, focused fixture validation, and loading documentation under `backend/ai/evaluation/` and `backend/ai/tests/integration/workflows/`. Add the concise fixture plan at `features/ai-workspace-assistant/plan.md`.
2. **Documents read.** `AGENTS.md`, `docs/project.md`, all `docs/ai/` documents, `features/ai-workspace-assistant/intent.md`, `spec.md`, and `preflight.md`, all AI assignment briefs, the existing backend source, unit test, evaluation scaffold, and artifact locations.
3. **Requirement IDs.** R1–R7, R10–R16, R19–R34 and S3–S20 where fixture inputs or expected observations can represent them. Fixtures do not prove application behavior.
4. **Classification.** Test and evaluation support inside the confirmed foundation scope. No application capability is added.
5. **Intent.** No update required. Backend state ownership, shared operations, immutable revisions, and mock reconstruction are already documented.
6. **Spec and contracts.** No update required for this task. Operation-specific measurement methods, physical units, real artifact formats, browser execution, and real edit/inspect/compare contracts remain unresolved.
7. **Acceptance.** The owner explicitly confirmed in the task request that the minimum UI/backend contracts and foundation intent/spec are agreed for this work. Per the same request, their Markdown status fields are not changed. This confirmation authorizes this fixture task only and does not agree unresolved mechanical operations.
8. **Dependencies and assumptions.** Assets are synthetic, patient-free, unitless fixture data. The coordinate frame and identity transforms are fixture-local metadata, not a proposed real geometry standard. The reconstruction result is labeled `mock`; behavior-only substitutes are labeled `test-double`.
9. **Verification.** Run the focused standard-library fixture validation test, the existing missing-contract unit test, the feature-document checker, and `git diff --check`. Confirm no patient data, inaccessible absolute artifact paths, or application implementation changes.
10. **Conclusion.** Fixture and evaluation work may proceed within this record. It does not authorize FastAPI, LangGraph, Bedrock, persistence, real geometry, or additional mock capabilities.
