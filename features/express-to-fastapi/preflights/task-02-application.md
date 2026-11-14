# Preflight: Task 02 authoritative application repository

Date: 2026-11-14 · Owner: application_repository agent · Status: implementation authorized by the nine-task queue

## Scope and requirements

Port the live seven-table Node repository as a separate Python application boundary. Requirements R3, R5–R13, R15, R17, R21–R24. Preserve current contracts and D1–D5 baselines; none of those proposed changes is accepted by this task. Explicit-root construction prevents silent live-data access. No sandbox repurposing, real geometry, model, cutover, or dependency changes.

## Sources inspected

AGENTS.md, migration intent/spec/plan, AI workflow, Node storage/API and shared HTTP contracts, workspace models, TDD and harness guidance.

## Plan and ownership

Own application/ and tests/integration/application/ only, plus this record. Coordinator owns cross-runtime Vitest integration and shared configuration. Repository has synchronous methods returning current camelCase records. Each call owns its connection, enables foreign keys, and closes deterministically. Write transactions and file parking match the characterized Node baseline, with injectable faults for before/after-commit boundaries. Unapproved cleanup-policy improvements remain blocked; baseline is retained and explicitly tested.

## Behavior inventory and proof

- Exact manifest omission, ownership, raw hashes, flat poses, restored pointers.
- Node-created copied database readable/mutable by Python and Node reads Python writes (coordinator cross-runtime test).
- Atomic sample/candidate/transform writes, fault rollback and restart.
- Candidate deletion preserves source volume; sample/case/project cascades.
- Characterize failed post-commit file cleanup without claiming filesystem/SQLite atomicity.
- Sandbox guard continues rejecting live schema.

Commands: Python unittest discovery for integration/application; coordinator Node/Python integration suite; existing sandbox regression runner. Red/green evidence and final results appended after execution.

## Evidence

- Red: new application manifest/restart test failed because ApplicationRepository did not exist.
- Green: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B -m unittest discover -s backend/ai/tests/integration/application -v` → 14 tests OK.
- Existing sandbox regression runner → 64 tests OK; sandbox initialization against an application database also has a new unchanged-byte regression assertion.
- Diff review: only owned new application/test/preflight files; no Node behavior changes. DDL remains the existing seven-table schema; no schema-version, parent-revision, request/run, or AI-result fields added.
- Coordinator owns execution/evidence for the Node-created disposable-copy → Python mutation → Node read/write test. Task acceptance requires that proof in addition to the Python suite.
- Current cleanup defects remain explicit baselines. D4/D5 improvements remain proposed, rather than being inferred as approved.
