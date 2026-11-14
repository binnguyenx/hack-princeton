# Historical plan: Demo fixtures and acceptance scenarios

Status: done · Date: 2026-11-14

This historical record preserves the fixture/evaluation work that previously occupied `../plan.md`. The later schema plan is archived beside it; the current plan records the completed storage slice.

## Delivered

- Deterministic patient-free cases, source and selection references, mock artifacts, representative requests/results, and artifact hashes under `backend/ai/evaluation/fixtures/`.
- Acceptance-scenario index at `backend/ai/evaluation/README.md`.
- Focused fixture integrity validation at `backend/ai/tests/integration/workflows/test_demo_fixtures.py`.
- Loading, fixture-local coordinate, provenance, and limitation documentation.

## Verification recorded

- Fixture validation: `Ran 10 tests`, `OK`.
- Existing missing-contract test: `Ran 1 test`, `OK`.
- Feature-document checker: 2 features, 0 errors, 0 warnings.
- `git diff --check`: clean.

These checks prove fixture integrity only. They do not prove application operations, persistence, SSE, geometry, retry behavior, or real measurement behavior.
