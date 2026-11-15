# Plan: Generate a predicted bone fix for a defective skull in the app

Spec: [spec.md](spec.md) · Status: accepted · Date: 2026-11-15

Build status (2026-11-15): steps 0–11 and 13 are done on `feat/cranial-reconstruction-candidate`, all against the fake endpoint. Step 12 (live SageMaker deploy and the S11 end-to-end run) has not run, so the plan isn't `done`.

## Approach
Build backend first, behind a fake endpoint, so every rule in the spec is tested without AWS. Then add the real SageMaker container and client, then the canvas UI, then the agent tools. The model operation reuses the voxel-operation commit path on `main` (`application/voxel_operations.py`): staged write, a transaction that checks the expected state, and provenance in `revision_operations`. That way a model fix is saved the same way as a mirror fix. The endpoint returns a probability volume, so threshold and region changes are local, small and fast to test.

## Files that change
All paths are on a feature branch cut from `origin/main` after `ml-model-design` is merged.

Inference (`ml/cranial/serve/`, new)
- `ml/cranial/serve/inference.py` (new): SageMaker `model_fn` / `input_fn` / `predict_fn` / `output_fn`. It verifies the hash against the freeze file at load, calls `predict.predict_single`, and writes the implant, a uint8 probability volume and the metadata. (R1, R2)
- `ml/cranial/predict.py` (modified): `predict_single` also returns the source-grid probability image. It already computes it before thresholding, so the CLI behavior is unchanged. (R2)
- `ml/cranial/serve/deploy_endpoint.py` (new): packages `model.tar.gz` from the S3 checkpoint and freeze file, creates the model, the async endpoint config (S3 output path) and the endpoint, and registers autoscaling with min 0 / max 1. It also has `warm` and `delete` subcommands. (R4)
- `ml/cranial/serve/README.md` (new): deploy, warm, smoke-test and delete commands, plus cost notes. (R4)
- `ml/cranial/tests/test_serve.py` (new): hash refusal, output grids and probability range, using a tiny random-weight checkpoint. (R1, R2)
- `ml/cranial/CT_FEASIBILITY.md` (new). (R22)

Backend (`backend/ai/`)
- `src/skullfix_ai/integrations/geometry/sagemaker_endpoint.py` + `model_endpoint.py` (new; see Deviations 6): a `ModelEndpoint` protocol with `submit(input_bytes) -> handle` and `poll(handle) -> pending | outputs | error`. `SageMakerAsyncEndpoint` implements it with boto3 (S3 put, `invoke_endpoint_async`, S3 head/get). `FakeEndpoint` is used in tests. The config is read from env (`CRANIAL_ENDPOINT_NAME`, `CRANIAL_INFERENCE_BUCKET`, `CRANIAL_INFERENCE_PREFIX`, `AWS_PROFILE`/`AWS_REGION`). (R3)
- `src/skullfix_ai/application/model_reconstruction.py` (new): `ModelReconstructionService`. It validates the input (R5), keeps the run registry and stages (R10, R11), validates the outputs (R8), commits a new candidate with revisions 0 and 1 plus provenance (R6, R7, R9), runs threshold/region adjustments (R18, R19) and builds the fix report (R14–R17).
- `src/skullfix_ai/application/voxel_operations.py` (modified): pull the staged-commit block out of `VoxelService._commit` into a shared helper that both services call. Add a `reconstruct.model` / `reconstruct.model-adjust` branch to `validate_provenance`. (R7, R9)
- `src/skullfix_ai/application/sqlite.py` (modified): a `fix_assets` table (candidate_id, probability_volume_id, freeze_threshold, model_record_json). Candidate delete cascades to it. (R18)
- `src/skullfix_ai/application/packages.py` (modified): include `fix_assets` and probability volumes in ZIP Save/Open. (R18)
- `src/skullfix_ai/application/fix_report.py` (new): fix statistics on top of `tools/geometry_measurements.py` (`implant_from_candidate`, `volume_summary`, `implant_rim_fit`), plus surface area, bounds, thickness, side and centroid. The ML record is read from the freeze file and `ml/cranial/reports/eval_v2/summary_*.json`. (R14–R17)
- `src/skullfix_ai/api/routes/reconstructions.py` (new): `POST /api/samples/{id}/reconstructions` → `{runId}`, `GET /api/reconstructions/{runId}` → `{stage, elapsedS, status, result|error}`, `POST /api/candidates/{id}/fix-adjustment`, `GET /api/candidates/{id}/fix-report`. (R3, R5, R10, R11, R14–R19)
- `src/skullfix_ai/api/app.py` (modified): include the router and inject the endpoint (fake in tests, real from env, `None` when unconfigured). (R3)
- `src/skullfix_ai/agent/staging.py` (modified): proposal kind `model_fix` with payload `generate | threshold | region`. Accept calls `ModelReconstructionService`. (R20)
- `src/skullfix_ai/tools/fix_tools.py` (new) + registration: `propose_predicted_fix` (stage-only) and `describe_predicted_fix` (read-only report). (R20, R21)
- `src/skullfix_ai/agent/preflight.py` (modified): a capability entry for model fix, available only when the endpoint is configured and the selection's sample passes R5. (R3, R5, R20)
- `docs/ai/contracts.md` (modified): the fix-report measurement contract (methods, units, limitations), so R21 may be advertised. (R14, R21)
- Tests (new): `tests/unit/integrations/geometry/test_sagemaker_reconstruction.py`, `tests/integration/application/test_model_reconstruction.py`, `tests/integration/api/test_reconstruction_routes.py`, `tests/unit/tools/test_fix_tools.py`, `tests/integration/application/test_fix_report.py`.

App (`app/`)
- `app/src/api/client.ts` (modified): start, poll, adjust and report calls. (R10, R14, R18, R19)
- `app/src/ui/ToolRail.tsx` (modified): a "Generate fix" button that is enabled or disabled with a reason. (R5, R11)
- `app/src/ui/FixProgressCard.tsx` (new): progress bar and status line. It shows the server stage and fills the timer-driven stages within the endpoint wait. (R10)
- `app/src/geometry/fixMesh.ts` (new): fix mask = candidate AND NOT source, then a mesh through the existing `derivedMesh.ts` path in the same frame as the skull. (R12)
- `app/src/viewport/Viewport.tsx` (modified): a selectable, hideable fix part in the Accent token. (R12, R13)
- `app/src/ui/FixPanel.tsx` (new): Fix / Adjust / How this was made, with the limitation text. (R14–R19)
- Tests (new): `app/tests/fixMesh.test.ts`, `app/tests/ui/fixProgressCard.test.tsx`, `app/tests/ui/fixPanel.test.tsx`, plus toolRail additions.

## Order of work
0. Merge `ml-model-design` into `main` (or open a PR and wait for it), then cut `feat/cranial-reconstruction-candidate` from `origin/main`. Confirm the baseline: `python3 -B backend/ai/tests/run_checks.py` and `cd app && npm test`.
1. Write the fix-report contract in `docs/ai/contracts.md` and get owner approval. Steps 7 and 9 depend on it.
2. Change `predict.py` to return the probability volume. Add `serve/inference.py` and `test_serve.py`, driven by tests. Verify with `pytest ml/cranial/tests`.
3. Add the `ModelEndpoint` protocol and `FakeEndpoint`, with a config test for the unconfigured case.
4. Extract the shared commit helper from `VoxelService._commit`. Existing `test_voxel_operations.py` must stay green before anything else uses the helper.
5. Write `ModelReconstructionService` in vertical TDD slices, in this order: input rejection, run start and registry, output validation failures, successful commit with provenance, duplicate-run refusal, timeout. Each slice uses `FakeEndpoint`.
6. Add the routes and app wiring, then route tests.
7. Add the fix report on a synthetic slab skull with known dimensions, then the ML record from the real freeze and eval files.
8. Add threshold and region adjustment, then `fix_assets` and package round-trip.
9. Agent: the `model_fix` staging kind, the two tools, preflight, and an eval-harness golden case for "generate a fix" (stages, doesn't commit).
10. App: client calls, button, progress card, fix mesh, panel. Tests use mocked API responses.
11. Add `SageMakerAsyncEndpoint` with a stubbed-boto3 unit test (`botocore.stub.Stubber`) for call shapes. Then `deploy_endpoint.py` and the README.
12. Live: deploy, warm, run S11 on one SkullBreak test case in the running app, record the timing in the README, then delete the endpoint.
13. Write `CT_FEASIBILITY.md`. Then Close.

## Risks
- Step 0 is the riskiest. This branch and `main` both changed `features/ml-model/` and `docs/project.md`, so expect merge conflicts in docs. Resolve them by keeping both sides' facts.
- SageMaker async details (payload cap, autoscaling to zero, the `ApproximateBacklogSizePerInstance` scaling metric, cold-start time) come from memory. Check the AWS docs before step 11. If scale-to-zero doesn't work, set min 1 for the demo window and delete the endpoint afterwards.
- Inference needs `torch`, `monai` and `SimpleITK` in the container, which the stock PyTorch inference image may not have at the pinned versions. Build `requirements.txt` into `model.tar.gz` (`code/requirements.txt`) and smoke-test with a local-mode deploy if possible.
- Cost: an instance left at min 1 burns credits. The README's last step is `delete`, and step 12 isn't done until it has run.
- Refactoring `VoxelService._commit` could break mirror and box edits. Mitigation: refactor only after green, with the existing voxel tests as the guard.
- Mesh alignment between the skull and fix meshes. Mitigation: build both from the same grid and normalization, and test with an off-centre fixture, like `aiOverlayAlignment.test.ts`.
- Runs are kept in memory, so a backend restart loses them. This is accepted for the demo (spec Design).
- Not chosen: real-time or serverless endpoints, local inference, model-side region guidance, smoothing. See spec D1 and Out of scope.

## Proof
Python commands run from the repo root. `$PY` is the env with torch and MONAI for `ml/cranial` tests.
- R1: `$PY -m pytest ml/cranial/tests/test_serve.py -k hash_mismatch` (S1)
- R2: `$PY -m pytest ml/cranial/tests/test_serve.py -k outputs_on_source_grid`, and existing `test_pipeline.py` stays green.
- R3: `pytest backend/ai/tests/unit/integrations/geometry/test_sagemaker_reconstruction.py` (unconfigured → `model-endpoint-unconfigured`, stubbed boto3 call shapes) (S4)
- R4: `ml/cranial/serve/README.md` commands, run once in step 12. Manual.
- R5: `test_model_reconstruction.py::test_rejects_non_mask_inputs`
- R6, R7: `test_model_reconstruction.py::test_commit_creates_fix_candidate`, `::test_failure_leaves_manifest_unchanged` (S2, S3)
- R8: `test_model_reconstruction.py::test_invalid_outputs_fail` (parametrized: empty, non-binary, grid mismatch, bone overlap, timeout) (S3)
- R9: `test_model_reconstruction.py::test_provenance_fields`
- R10: `test_reconstruction_routes.py::test_stage_sequence` and `app/tests/ui/fixProgressCard.test.tsx` (S5)
- R11: `test_reconstruction_routes.py::test_duplicate_run_refused`
- R12, R13: `app/tests/fixMesh.test.ts` (alignment within half a voxel, accent material) and `app/tests/ui/fixPanel.test.tsx` (select/hide) (S6)
- R14, R15: `test_fix_report.py::test_slab_dimensions`, `::test_missing_spacing_not_available` (S7)
- R16, R17: `test_fix_report.py::test_ml_record_from_freeze_and_eval` and the fixPanel limitation-text test.
- R18, R19: `test_model_reconstruction.py::test_threshold_adjust_no_endpoint_call`, `::test_region_keep`, package round-trip test (S8)
- R20: `test_fix_tools.py::test_propose_stages_only` and the eval-harness golden case (S9)
- R21: `test_fix_tools.py::test_describe_returns_report` and the existing number-guard test on a fix reply (S10)
- R22: `ml/cranial/CT_FEASIBILITY.md` exists and is reviewed.
- Suites: `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py`, `cd app && npm test && npm run build`.
- S11: a manual live run in step 12, with the timing recorded in `ml/cranial/serve/README.md`.

## Deviations
1. **Step 0:** `ml-model-design` was merged into the feature branch, not into `main`. Nothing was pushed. Conflicts in `.gitignore` and `docs/project.md` were resolved by keeping both sides.
2. **Step 4 not done as written:** the staged commit wasn't extracted from `VoxelService._commit`. `ModelReconstructionService._publish` uses the same discipline instead: staged files, one transaction, hard links, cleanup on failure. `voxel_operations.py` changed only in `validate_provenance`, which gained a `reconstruct.model` branch so ZIP save and open accept model provenance.
3. **Packages:** `fix_assets` and probability volumes aren't included in ZIP Save/Open. An opened copy keeps the fix and its provenance, but `fix-adjustment` returns `not-a-model-fix` there. Deleting a fix candidate cascades its `fix_assets` row, but its probability volume file isn't cleaned up.
4. **Thickness:** `geometry_measurements.py` wasn't reused for thickness, contact or gap. `implant_rim_fit` defines the rim as bone touching the implant, so a fix predicted in place always scores a 0 mm gap. `fix_report.py` uses its own distance-transform methods, and `largest_rim_gap` reports "not available". This needs a decision (spec R14).
5. **Endpoint output:** one ZIP (`implant.nrrd`, `probability.nrrd`, `metadata.json`), because async inference writes a single output object. Probability is `round(p*255)`, so a local re-cut at the frozen threshold can differ from the endpoint's implant at boundary voxels.
6. **New files not in the plan:** `ml/cranial/serve/requirements.txt`, `ml/cranial/manifests/model_card_v2.json` (model and training facts the eval files don't hold), `app/src/ui/fixRun.ts`, `app/src/ui/FixGeneration.tsx` (the plan named `FixProgressCard.tsx`). The SageMaker client is `integrations/geometry/sagemaker_endpoint.py` plus the `model_endpoint.py` protocol.
7. **Staging:** `StagedProposal.candidate_id` / `base_revision_id` are now optional, plus `sample_id` and `resolved_run_id`. A `model_fix` generate proposal is bound to the skull until it's accepted. The proposal tool is registered only when the endpoint is configured, so the default agent's tool set is unchanged.
8. **UI (R13):** the fix part is shown and hidden from the fix panel, not by clicking it in the viewport. The panel opens whenever the open candidate is a predicted fix. The keep-region box takes typed IJK corners, not the ROI gizmo.
9. **Test runner:** app tests need Node 22. Under the default Node 20.20.2, 18 UI test files never start (`vitest-pool ... reading 'bind'`), yet vitest still reports "passed". This was already true before this feature.
10. **No `preflight.py` change:** the capability gate is the endpoint config plus the server-side input checks.
