# Preflight: Express-to-FastAPI migration planning

Date: 2026-11-14 · Responsible agent: main migration-planning agent · Classification: documentation-only new capability planning

## 1. Task and file scope

Create migration intent, spec, preflight, and plan documents. Add minimal Markdown-only context to the project index, AI architecture/integration/setup/work summary, and agent guidance. Do not change code, tests, fixtures, schemas, databases, configuration, dependency manifests, or lockfiles.

## 2. Documents and source inspected

- `AGENTS.md`
- `.agents/skills/intent-spec-plan/SKILL.md`, its format/writing references and templates
- `.agents/skills/tdd/SKILL.md`
- `docs/project.md`
- `docs/ai/workflow.md`
- `docs/ai/architecture.md`
- `docs/ai/contracts.md`
- `docs/ai/app-integration.md`
- `docs/ai/setup.md`
- `docs/ai/work-summary.md`
- Existing `features/ai-workspace-assistant/` intent, spec, current/archived plans, preflight template, and task preflights
- Existing `features/3d-bone-editor/` intent, spec, and plan conventions
- `.agents/assignments/ai/`
- `app/server/api.ts`
- `app/server/storageSqlite.ts`
- `app/vite-api-plugin.ts`
- `app/vite.config.ts`
- `app/src/api/client.ts`
- `app/src/domain/types.ts`
- `app/src/io/projectPackage.ts`
- Existing `app/tests/` HTTP, repository, ownership, revision, failure, package, mechanical, and cross-language tests
- `backend/ai/src/skullfix_ai/` schemas, storage, workspace adapter, operation service, reconstruction adapter/mock, package configuration, and tests

All requested paths exist. There is no FastAPI entrypoint, live Python application repository, backend-neutral dual-server contract harness, or LangGraph checkpoint implementation.

## 3. Requirement IDs

Planning covers R1–R26 and S1–S12 in `spec.md`. No implementation requirement is marked complete by this task.

## 4. Current implementation facts and mismatches

- Source contains 13 Express routes mounted below `/api`.
- Live authority is `data/storage/app-model.sqlite` plus `data/storage/volumes/`, configurable as one root with `HACK_STORAGE_ROOT`.
- The live schema has seven tables: users, projects, cases, volume_assets, samples, candidates, and candidate_revisions.
- Live JSON uses camelCase ProjectManifest fields, raw SHA-256 hex, nested source spatial metadata, and flat 16-element poses.
- Restore moves the current pointer to an existing revision and may point below maximum order.
- The Python sandbox uses a different schema, identifiers, artifact representation, immutable-child semantics, run ownership, and synthetic JSON output.
- `AppWorkspaceAdapter` is read-only and models the live manifest. It is reusable for contract vocabulary, not as a mutation repository.
- The sandbox initializer rejects live database paths/schemas. That protection is required during and after migration.
- FastAPI, application HTTP routes, separate checkpoint storage, LangGraph, Bedrock, SSE, and live AI mutation are not implemented.
- Existing docs disagree on historical Python test totals (`59` versus `64`). This planning task does not restate either as a newly verified result.

## 5. Ownership and contract boundaries

- Current live writer: Express routes → `storageSqlite.ts` → app database/NRRD root.
- Planned live writer after cutover: FastAPI routes → Python application services/repository → the same accepted schema/layout.
- Sandbox owner: `SQLiteApplicationStorage`, local synthetic artifact store, operation runs, and reconstruction mock under separate configured paths.
- Future workflow owner: LangGraph checkpoint database, separate from both application and sandbox state.
- Frontend ownership: temporary view/selection state and the existing typed `/api` client contract.

Only one backend may write the live application root during parity or cutover. Contract tests may run both backends only against separate disposable roots.

## 6. Reusable Python components and required adaptation

Reusable:

- Workspace Pydantic models and aliases for live ProjectManifest vocabulary.
- `AppWorkspaceAdapter` ownership/freshness read logic as reference behavior.
- Standard-library SQLite, hashing, path-containment, and explicit transaction patterns.
- Dependency injection patterns from the reconstruction adapter and operation service.
- Sandbox database guard tests and source-preservation principles.

Requires a new live adaptation:

- Application repository/service matching all seven current tables and NRRD layout.
- FastAPI transport, lifecycle, multipart, file response, and public error mapping.
- Live application Pydantic request/response models rather than sandbox command/result schemas.
- Restore and transform semantics matching current pointer/order behavior.
- Contract fixtures and launch adapters shared across Express and FastAPI.
- Backup, cutover, and rollback tooling/procedure.

Must not be reused as live behavior:

- Sandbox cases/source anatomy/candidate schema.
- Sandbox immutable parent revisions and expected-revision commits.
- Run/request ownership and retry interpretation.
- `/api/artifacts/...` synthetic references.
- Synthetic JSON reconstruction output.

## 7. Data preservation and compatibility risks

- Opening live data with the sandbox initializer would corrupt or reject the wrong schema; keep the guard.
- SQLite schema drift, foreign-key differences, JSON omission/null behavior, boolean parsing, and FastAPI's default `422` errors can break UI compatibility.
- Filesystem writes/deletes are not atomic with SQLite commits.
- Case/project deletion currently has ownership and orphan-file defects; copying or fixing them silently would both be unsafe.
- Node and Python SQLite concurrency must not target the same live root.
- Generated ids/timestamps make naive response snapshots unstable.
- Backup must pair database and volumes from one write-quiesced point.
- The working tree already contains unrelated changes; implementation slices must preserve them.

## 8. Unresolved decisions and blocking effect

- Error/validation decisions D1–D5 in `spec.md` block final Phase A expected assertions and the corresponding Phase C handlers, but do not block building the baseline capture harness.
- Development process/port choice blocks Phase C composition and Phase D proxy wiring, not repository work.
- Schema-version choice blocks only a versioning change; unchanged-schema compatibility work can proceed.
- File-delete reconciliation policy blocks the affected delete service implementation, not read/create/transform/restore slices.
- No unresolved decision authorizes expected-revision, idempotency, recovery, AI mutation, or revision-model changes.

## 9. Checks for this documentation task

- Verified the route count from source with a router-method search.
- Traced route handlers to repository methods and frontend client calls.
- Traced live types, manifest serialization, schema DDL, transactions, file paths, fault hooks, and relevant tests.
- Compared live contracts with workspace schemas, sandbox storage/service, and mock adapter.
- Run the feature-document checker and `git diff --check` after edits.
- Inspect the final changed-file list and confirm this task added or modified Markdown only.

## 10. Conclusion

The migration is ready for documentation review, not implementation. The intent/spec/plan remain draft. No coding may begin until the owner reviews the proposed compatibility decisions and approves the applicable implementation phase.

## Reusable implementation-slice checklist

1. Read this migration intent/spec and applicable existing contracts.
2. Identify affected requirement IDs and ownership boundaries.
3. Create a task-specific preflight and update the relevant plan.
4. Define or update the failing contract/regression tests first.
5. Implement only the scoped slice.
6. Run the focused and surrounding checks.
7. Update documentation with verified behavior and remaining gaps.

A preflight records readiness. It does not grant acceptance or authorize unrelated implementation.
