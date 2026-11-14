# Preflight: T2 live foreground-volume measurement

Owner: main agent. Status: verified (T2 Close). Date: 2026-11-14.

1. **Task and file scope.** Implement live `ForegroundVolumeService` over `ApplicationRepository`, mechanical `POST /api/candidates/{id}/measurements` and `GET …/revisions/{revision_id}/measurements`, additive reservation + `candidate_measurement_results` persistence, NRRD/grid/hash/idempotency semantics per R70–R79 / S51–S58. Files: `application/foreground_volume.py` (new), `application/sqlite.py` (additive tables/methods), `api/routes/measurements.py` (new), `api/app.py` (router), integration tests, docs (plan/preflight/spec Where-it-lives/contracts runtime note/work-summary/project index). Preserve all existing working-tree changes. No LangGraph bind, Chat UI, Bedrock, AWS, AI mutation, or geometry-revision/volume-byte writes from measurement.

2. **Documents read.** `AGENTS.md`, `docs/ai/workflow.md`, `docs/ai/contracts.md` (T1C section), `docs/ai/work-summary.md`, `features/ai-workspace-assistant/{intent,spec,plan,preflight}.md`, `plans/t1c-measurement-contract.md`, PlacementService/route/tests, `binary_nrrd.py`, ApplicationRepository DDL, sandbox OperationService claim patterns, existing untracked `test_measurements.py` stub.

3. **Requirement IDs.** R70–R79, S51–S58 (and foundation R8/R10/S1/S4/S5/S14–S16 as exercised by the live mechanical path). Sandbox `measure.candidate` remains unbound (R7/S6 / missing-contract slice unchanged).

4. **Classification.** New capability (live mechanical binding of an already-accepted contract).

5. **Intent.** Minor amendment only: record that T2 live mechanical implementation is owner-authorized; overall file stays draft; no new product outcome beyond the accepted measurement milestone path.

6. **Spec and contracts.** Update Where-it-lives / Last updated / runtime-bound note. `docs/ai/contracts.md` runtime line for foreground-volume → live mechanical bound; sandbox/AI still unbound. No new contract decisions; no scope expansion.

7. **Acceptance.** Foundation accepted (limited). T1C contract (R70–R79 / S51–S58) accepted. Parent intent/spec remain `draft`. Owner separately authorized T2 implementation within that measurement scope (this turn). No whole-draft acceptance inferred.

8. **Dependencies and assumptions.** Reuse ApplicationRepository, PlacementService patterns, NRRD header parsing ideas from `binary_nrrd` (measurement allows any `>0` uchar foreground; contract types are `unsigned char`/`uchar` only). Disposable temp roots only. Authoritative calculation stays in backend. Do not point sandbox storage at live `app-model.sqlite`. Capability gate: contract + live route/service composition + verified sample/mm checks inside the service.

9. **Verification.** Expand HTTP integration tests for AT-01–AT-18 / S51–S58 on disposable storage. Focused measurement suite; relevant API/application regressions; `run_checks.py`; documentation checker; `git diff --check`. No live storage, no AWS.

10. **Conclusion.** T2 coding completed and verified (15 focused + 157 full Python OK). Outstanding outside scope: LangGraph `measure.candidate` binding, Chat UI, AI mutations, Bedrock, edit/inspect/compare contracts, sandbox OperationService enablement.
