# Plan: Storage fixes, operation service, and reconstruction mock

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

The owner authorized this slice and waived separate plan approval. The completed storage plan and its verification history are preserved in [plans/storage-foundation.md](plans/storage-foundation.md).

> Historical: describes how this change was built. For current behavior, read spec.md.

## Approach

Use vertical TDD to reproduce both confirmed storage defects, add the smallest durable coordination and migration changes, then define the adapter boundary before implementing the synchronous operation service. Exercise the service through public storage and artifact interfaces with existing fixtures and replaceable deterministic adapters.

## Files and requirements

- `backend/ai/src/skullfix_ai/storage/interfaces.py`, `storage/sqlite.py`, `storage/artifacts.py`, and `storage/__init__.py`: cleanup claims, schema-v2 migration, lifecycle eligibility, direct stale termination, atomic canonical run claim, and persisted outcomes. R50–R52, R56, R57; S35–S37, S40, S41.
- `backend/ai/src/skullfix_ai/integrations/geometry/reconstruction.py` and `mock.py`: pre-commit adapter contracts, structured failures, and deterministic synthetic output. R53, R54; S38, S42.
- `backend/ai/src/skullfix_ai/operations/service.py` and operation exports: canonical validation, capability checks, run/artifact lifecycle, initial candidate commit, result translation, and duplicate handling. R55–R57; S38–S42.
- Storage, adapter, and service tests: defect reproduction, cleanup/commit competition, migration, terminal states, service integration, duplicate/conflict behavior, failures, reopen persistence, and adapter substitution.
- Feature preflight/spec/plan, `docs/ai/`, `setup.md`, `work-summary.md`, `AGENTS.md`, assignment briefs, and evaluation index: public imports, configuration, transaction/crash boundaries, commands, and partial scenario status.

## Implementation order

1. Add failing tests showing deleted artifacts can be committed and accepted runs cannot terminate stale; confirm each expected cause.
2. Introduce cleanup claims and schema version 2, migrate version-1 databases in place, enforce commit eligibility, and replace snapshot-authorized deletion.
3. Permit `accepted` to `stale` only with matching terminal status and preserve terminal immutability.
4. Define and test the reconstruction adapter contract, then add the deterministic synthetic mock.
5. Add an atomic canonical-operation run claim and persisted result representation without adopting R35–R39.
6. Implement service validation, capability handling, adapter execution, artifact recording, initial candidate commit, completed-result persistence, and stable failure translation.
7. Add duplicate, conflict, controlled competing-owner, crash-gap, reopen, and second-adapter tests.
8. Synchronize documentation and run every listed verification command.

## Transaction boundaries and dependencies

- Cleanup claims, authority changes, canonical run claims, and run transitions are SQLite transactions. Filesystem deletion/write remains outside them.
- Initial candidate/revision/current pointer/artifact authority commit atomically. Completed result bookkeeping follows that mutation; failure in the gap leaves `ready-to-commit` for explicit reconciliation and never triggers blind replay.
- Adapter execution is an external side effect and is not described as exactly-once.
- Keep Python 3.11+, Pydantic, and standard-library SQLite/filesystem/hash facilities. Continue using `SKULLFIX_AI_DB_PATH` and `SKULLFIX_AI_ARTIFACT_DIR`.
- R35–R39 and S21–S24 remain proposed. No API server, HTTP retrieval, graph/model dependency, scheduler, broker, checkpoint database, or geometry library is introduced.

## Proof

- R50–R52 and S35–S37: local artifact and SQLite storage tests.
- R53, R54 and adapter portions of S38/S42: reconstruction-mock unit tests.
- R55–R57 and S38–S42: operation-service integration tests.
- Regressions: shared-schema tests, fixture validation, and missing-contract tests.
- R35–R39 and S21–S24 remain proposed. API/SSE, LangGraph/Bedrock, HTTP artifact retrieval, real geometry, and interrupted-owner recovery are not verified.
- Documentation: `python3 .agents/skills/intent-spec-plan/scripts/check_features.py .` and `git diff --check`.

- Existing contract regression context: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49. The offline suite runs existing schema/fixture/storage regressions; this slice does not claim full behavior coverage of those requirements. R35, R36, R37, R38, R39 remain proposed and excluded.
- Slice coverage: R50, R51, R52, R53, R54, R55, R56, R57 are verified by the storage, adapter, and operation-service suites.

## Risks

- A stale artifact snapshot can race with publication: deletion requires a live storage claim token.
- Migration could lose version-1 data: use `ALTER TABLE`, verify the prior version, and test reopen.
- Duplicate external effects can occur after process interruption: block known active owners and persist completed outcomes without promising exactly-once execution.
- Mutation commit can precede run-result persistence: expose reconciliation-required without claiming no mutation occurred.
- Synthetic output can be overinterpreted: persist explicit mock provenance and limitation.

## Verification result

`PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py`: 59 tests passed. Documentation checker and git diff --check passed. No configured lint command exists.

- Existing contracts referenced for regression context, without claiming full application coverage: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49.
- Slice verification: R50, R51, R52, R53, R54, R55, R56, R57 are exercised through storage, mock, and operation-service tests.

## Deviations

The handoff contained partial service code without integration tests or the referenced R50–R57 definitions. The continuation recorded the authorized requirements and completed their tests. Additional regressions rejected invalid adapter provenance before commit, protected source publication from deleted artifacts, sanitized source I/O errors, retained unrecorded artifact identity, and preserved uncertain commit outcomes. A deterministic suite runner was added at backend/ai/tests/run_checks.py. No graph/API/model work was added.
