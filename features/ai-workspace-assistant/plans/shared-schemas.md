# Historical plan: Shared AI/backend schemas

Spec: [../spec.md](../spec.md) · Status: done · Date: 2026-11-14

> Historical: describes how this change was built. For how the feature works now, read spec.md.

The owner authorized this plan and waived separate plan approval. The completed fixture plan is preserved at [demo-fixtures.md](demo-fixtures.md).

## Approach

Correct the public fixture shapes first, then build seven focused Pydantic schema modules through vertical TDD slices. Production-shaped fixture sections deserialize through shared models; fixture-only ownership, path, hash, and parentage checks remain in the fixture harness. Structural validation stays separate from application capability, membership, freshness, idempotency, persistence, and geometry checks.

## Files that changed

- `backend/ai/pyproject.toml` — minimal Python package metadata and Pydantic dependency. R5, R20.
- `backend/ai/src/skullfix_ai/schemas/common.py` — identifiers, operations, lifecycle/status, provenance, limitations, and structured errors. R5, R20, R24, R26, R29.
- `backend/ai/src/skullfix_ai/schemas/spatial.py` — frames, units, finite 4×4 transforms, selection/region and revision references. R2, R19, R25, R41.
- `backend/ai/src/skullfix_ai/schemas/artifacts.py` — canonical public artifacts using `retrieval_url`, plus separate internal relative-path metadata. R14, R27, R34, R40.
- `backend/ai/src/skullfix_ai/schemas/requests.py` — direct and AI request envelopes with operation-dependent reference rules. R1, R4, R19, R25.
- `backend/ai/src/skullfix_ai/schemas/commands.py` — canonical mock-generation command and typed parameters; full revision-bound selection references. R5, R6, R20, R25, R41.
- `backend/ai/src/skullfix_ai/schemas/results.py` — mock-completed and unsuccessful result variants with status invariants. R7, R13, R14, R20, R22, R26, R27, R29.
- `backend/ai/src/skullfix_ai/schemas/events.py` — progress and terminal-result event variants. R13, R29.
- `backend/ai/src/skullfix_ai/schemas/__init__.py` — explicit public exports.
- `backend/ai/tests/unit/schemas/` — focused public-model behavior tests.
- `backend/ai/evaluation/fixtures/requests.json` and `expected-results.json` — canonical selection and artifact fields. R40, R41; S25, S26.
- `backend/ai/tests/integration/workflows/test_demo_fixtures.py` — deserialize production-shaped fixture portions through shared schemas while retaining fixture integrity checks.
- `backend/ai/evaluation/README.md` — separate AF-12 command convergence from planned S10 adapter substitution.
- `AGENTS.md`, `docs/ai/`, and assignment briefs — package, commands, validation boundary, and actual implementation state.

## Implementation order

1. Correct `retrieval_url`, full command selection references, and AF-12/S10 documentation.
2. Add package metadata and common/spatial schemas.
3. Add artifact schemas.
4. Add request schemas.
5. Add typed canonical mock command.
6. Add result schemas.
7. Add event schemas.
8. Refactor fixture validation and run surrounding checks.

## Dependencies and boundaries

- Python 3.11 or newer and `pydantic==2.12.5`.
- No FastAPI, LangGraph, LangChain, Bedrock, database, AWS, or network dependency.
- R35–R39 and S21–S24 remained proposed and excluded.
- `execute_operation` remained intentionally separate because no envelope ids were fabricated.

## Proof

- Shared schemas: 12 tests passed.
- Schema-backed fixture validation: 11 tests passed.
- Existing missing-contract regression: 1 test passed.
- Feature-document checker: 2 features, 0 errors, 0 warnings.
- `git diff --check`: passed with no output.

## Deviations

`references.py` was not needed; immutable references remain in `spatial.py`. The schema tests use the repository's direct-file `unittest` convention because the test tree is not packaged for discovery.
