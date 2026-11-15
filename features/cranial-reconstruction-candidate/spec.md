# Spec: Generate a predicted bone fix for a defective skull in the app

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-15 (build)

## Summary
A user selects an imported defective skull (a binary NRRD mask) and presses "Generate fix", or asks the agent for one. The backend sends the skull to the frozen cranial U-Net, which is hosted on a SageMaker async inference endpoint. The predicted implant comes back on the skull's own grid and is saved as a new candidate: the skull plus the fix. The canvas shows the fix in the accent color as its own selectable part. Selecting it shows geometry numbers for the fix and the ML record that produced it. The user can tighten or loosen the fix (threshold) and keep only a marked region without calling the model again.

## Requirements

Hosting and inference
- R1. The model runs on an AWS SageMaker async inference endpoint that serves the checkpoint pinned in `ml/cranial/manifests/freeze_v2.json`. At startup the container checks the checkpoint's sha256 against the freeze file and refuses to serve on a mismatch.
- R2. The endpoint runs `predict.py`'s existing path: preprocess, forward pass, inverse to the source grid, and bone exclusion. It reads the input NRRD from S3 and writes three outputs to S3: the binary implant at the freeze threshold, a probability volume on the source grid (uint8, 0–255), and a metadata JSON. Each output has the input's shape, spacing, origin and direction.
- R3. The backend calls the endpoint through the AWS SDK. Credentials come from the environment or an AWS profile, never from source files. The endpoint name, bucket and prefix come from config. If any of these is missing, the operation returns `unavailable` / `model-endpoint-unconfigured` and writes nothing.
- R4. The endpoint is configured to scale to zero instances when idle. The repo documents the command that warms it before a demo and the one that deletes it.

Input
- R5. The operation accepts only a sample whose source volume is a binary NRRD with verified spatial metadata and an orthogonal grid. Anything else is rejected with a message before upload. CT, STL and GLB inputs are rejected with the message "Only segmented skull masks (NRRD) are supported".

Operation and commit
- R6. One application operation, `reconstruct.model`, serves both the button and the agent. Each run creates a new candidate named "Predicted fix" on the sample. Revision 0 is the source copy. Revision 1 has the volume source ∪ implant on the source grid. Existing candidates on the sample are not changed.
- R7. The commit is atomic and checked against the expected state, like the voxel operations: the source volume hash and the case are checked again inside the transaction. A failure leaves no candidate, no revision and no volume file behind.
- R8. These results are failures, and nothing is committed: an empty implant, a non-finite or non-binary output, a grid that doesn't match the source, any implant voxel on source bone, or no result within 15 minutes. The user sees which one happened.
- R9. Each fix revision stores provenance: operation, model name, checkpoint hash, freeze run id, threshold used, whether the threshold is the frozen default, the region kept (if any), source volume hash, implant voxel count, endpoint inference seconds, and total seconds.

Progress
- R10. While a run is active, the canvas shows a progress bar and one status line from this fixed sequence: "Checking skull", "Uploading skull", "Waking model", "Predicting missing bone", "Mapping fix onto skull", "Building mesh", "Saving candidate". The backend reports the stages it can observe (checking, uploading, waiting on the endpoint, saving). The stages within the endpoint wait may be advanced on a timer. Success and failure are always the real result. (added: stage list)
- R11. Starting a second run on the same sample while one is active is refused with "A fix is already being generated for this skull".

Viewing the fix
- R12. After success, the viewport opens the new candidate. Source bone renders in the normal bone color. The fix (candidate voxels not in the source) renders as a separate mesh in the Accent token from `DESIGN.md`. Both stay in the source coordinate frame.
- R13. The fix mesh can be selected, hidden and shown as its own part. Selecting it opens a fix panel.

Fix statistics (geometry only)
- R14. The fix panel shows numbers computed deterministically from the stored fix revision and source volume. Each has its unit and a one-line method:
  - fix volume (mL)
  - outer surface area (mm²)
  - bounding box (mm)
  - mean and minimum thickness (mm)
  - share of the fix's border voxels that touch source bone (%)
  - largest gap between the fix border and the source bone rim (mm)
  - side (left/right) and centroid in patient coordinates

  The panel labels these as geometry measured from a model proposal, not clinical assessments.
- R15. If verified mm spacing is missing, each affected number shows "Not available" with the reason. No number is estimated.

ML process record
- R16. The fix panel has a "How this was made" section with these items:
  - model: 3D U-Net, 4.8M parameters, 2 mm / 128³ input
  - training data: SkullBreak parietotemporal, 91 training subjects, synthetic defects
  - held-out results: test mean Dice 0.811 (95% CI 0.778–0.840), median HD95 2.49 mm, 20 cases, 0 failures; validation mean Dice 0.835
  - checkpoint hash and run id
  - threshold, marked as default or adjusted
  - this run's inference time and total time

  The values are read from the freeze file and `ml/cranial/reports/eval_v2/` summaries through the backend, not typed into UI code.
- R17. The section always shows this limitation: "Trained on synthetic parietotemporal defects. Other defect types and real patient scans have no measured accuracy. Not a clinical design."

Tailoring
- R18. The user can change the fix threshold within 0.10–0.90. The new fix is computed from the stored probability volume, without calling the endpoint, and committed as a new revision of the same fix candidate. A non-default threshold is labelled "Adjusted threshold, not the evaluated setting".
- R19. The user can mark a box region with the existing ROI tool. Fix voxels outside the box are dropped, and the result is a new revision. An empty result is refused.

Agent
- R20. The agent has a tool that stages a fix proposal: generate, or re-threshold, or keep a region, with typed parameters. It goes through the existing stage-only proposal path (AI spec R109). Nothing runs or commits until the user clicks Accept. Accept then runs the same `reconstruct.model` operation as the button.
- R21. The agent has a read-only tool that returns the R14 statistics and R16 record for a fix revision. Agent replies about a fix may only state numbers present in that tool's result (AI spec R9).

Feasibility note
- R22. `ml/cranial/` gains a short written note on predicting from CT: the threshold and cleanup steps, the domain-shift risk, and what would have to be measured before claiming it works. Nothing is built for CT. (added: placed as a doc deliverable)

## Success criteria
- S1. Given a checkpoint whose hash doesn't match `freeze_v2.json`, when the inference container starts, then it exits with an error and serves nothing.
- S2. Given a verified binary skull NRRD and a fake endpoint that returns a valid implant, when `reconstruct.model` runs, then one new candidate exists with revision 1 = source ∪ implant, the source and other candidates are unchanged, and the provenance has every R9 field.
- S3. Given a fake endpoint that returns an empty implant, or one voxel on source bone, or a wrong grid, when the run finishes, then it fails with that reason and the project manifest is byte-identical to before.
- S4. Given no endpoint config, when the button is pressed, then the user sees "model-endpoint-unconfigured" and nothing is uploaded.
- S5. Given a run in progress, when the canvas is watched, then the status line moves through the R10 stages in order and ends on success or the real failure message.
- S6. Given a committed fix, when the canvas opens it, then the fix mesh uses the Accent token, the skull uses the bone color, and both line up in the source frame (no mesh offset more than half a voxel).
- S7. Given a synthetic skull and a synthetic fix of known size (for example a 10×10×4 mm slab), when the fix panel opens, then volume, area, bounds and thickness match the known values within one voxel's tolerance.
- S8. Given a committed fix, when the threshold moves from the default to 0.7, then a new revision appears with no endpoint call, fewer or equal fix voxels, and the "Adjusted threshold" label.
- S9. Given an agent request "generate a fix", when the turn ends, then a staged proposal exists and no candidate was created. After Accept, exactly one fix candidate exists.
- S10. Given the agent describes a fix, when its reply has a number that is not in the stats tool result, then the reply is rejected under the existing AI guard.
- S11. Given the real endpoint and a SkullBreak parietotemporal test case, when a fix is generated end to end, then it commits and the total time is recorded. This is a manual demo check, not a CI test.

## Design
Flow: canvas or agent → FastAPI `reconstruct.model` operation → validate the sample → upload the NRRD to `s3://<bucket>/cranial/inference/<run_id>/input.nrrd` → `InvokeEndpointAsync` → poll the S3 output location → validate the three outputs → commit candidate and revisions → client loads the candidate and builds meshes.

The operation sits next to `reconstruct.mirror-roi` in `application/voxel_operations.py` and uses the same commit and provenance table (`revision_operations`). The provenance validator gains a schema for `reconstruct.model`. The probability volume is stored as a volume asset linked from the fix candidate, so threshold and region changes can be made locally. A fix revision volume is always source ∪ implant. Main's measurement tools already define the fix as "voxels the candidate adds to the source", so R14 builds on `tools/geometry_measurements.py` instead of a second implementation.

Run state (stage, start time, result) lives in an in-memory run registry keyed by `run_id`. The client polls `GET /api/reconstructions/{run_id}`. Runs don't survive a backend restart. The S3 output stays, but the run is reported as lost.

The inference container is the SageMaker PyTorch inference image with `ml/cranial/` code and `requirements.txt`. The model is loaded once per instance. Instance type: a CPU instance first (for example ml.m5.xlarge), since a 128³ forward pass on 4.8M parameters should be seconds on CPU. That isn't measured yet. Switch to ml.g4dn.xlarge if S11 is too slow.

Mesh: the client builds the skull and fix meshes from the candidate and source volumes with the existing MarchingCubes path (`app/src/geometry/volumeIsoMesh.ts`). The fix mask is computed client-side as candidate AND NOT source.

UI: a "Generate fix" button in the canvas tool rail, enabled only when the selection is a sample or candidate whose sample passes R5. The disabled state carries the reason as a tooltip. Progress and status appear in a compact floating card over the viewport. The fix panel is a side panel with three sections: Fix, Adjust (threshold slider, keep-region) and How this was made. All tokens come from `DESIGN.md`. Signal is used only for failure.

CT feasibility (for R22): SkullBreak masks were themselves made by thresholding CQ500 CT. A CT path is threshold at about 300 HU or more, keep the largest connected skull component, remove the table and mandible, then run the model. Expected risks: noisier masks, real rather than synthetic defect edges, and other anatomy in the field of view. Accuracy would be unknown until scored on real cases (for example MUG500+ B, ml-model R15).

## Where it lives
On branch feat/cranial-reconstruction-candidate, cut from `main` with `ml-model-design` merged in.
- Inference container: `ml/cranial/serve/inference.py`, `ml/cranial/serve/requirements.txt`. Source-grid probability output: `ml/cranial/predict.py`.
- Deploy, warm, status and delete: `ml/cranial/serve/deploy_endpoint.py`, `ml/cranial/serve/README.md`
- Model card for the ML record: `ml/cranial/manifests/model_card_v2.json`
- Operation, runs, tailoring, report: `backend/ai/src/skullfix_ai/application/model_reconstruction.py`, `backend/ai/src/skullfix_ai/application/fix_report.py`. Provenance validation: `backend/ai/src/skullfix_ai/application/voxel_operations.py`
- SageMaker client: `backend/ai/src/skullfix_ai/integrations/geometry/sagemaker_endpoint.py`, `backend/ai/src/skullfix_ai/integrations/geometry/model_endpoint.py`
- Routes: `backend/ai/src/skullfix_ai/api/routes/reconstructions.py`. Wiring: `backend/ai/src/skullfix_ai/api/app.py`, `backend/ai/src/skullfix_ai/api/__main__.py`
- Agent: `backend/ai/src/skullfix_ai/tools/fix_tools.py`, `backend/ai/src/skullfix_ai/agent/staging.py`, `backend/ai/src/skullfix_ai/api/routes/chat.py`
- Canvas UI: `app/src/ui/FixGeneration.tsx`, `app/src/ui/FixPanel.tsx`, `app/src/ui/fixRun.ts`, `app/src/geometry/fixMesh.ts`, `app/src/App.tsx`, `app/src/api/client.ts`
- Tests: `backend/ai/tests/integration/api/test_reconstruction_routes.py`, `backend/ai/tests/integration/api/test_fix_report.py`, `backend/ai/tests/integration/api/test_fix_agent_tools.py`, `backend/ai/tests/unit/integrations/geometry/test_sagemaker_endpoint.py`, `ml/cranial/tests/test_serve.py`, `app/tests/fixMesh.test.ts`, `app/tests/ui/fixGeneration.test.tsx`, `app/tests/ui/fixPanel.test.tsx`
- CT note: `ml/cranial/CT_FEASIBILITY.md`. Proposed contract: `docs/ai/contracts.md`, section "Proposed contract: model fix generation and fix report".

## Decisions
- D1. SageMaker async inference with S3 input and output. Why: it handles source NRRDs larger than the real-time and serverless payload limits, can scale to zero to save credits, and keeps all of `predict.py` in one place. Alternatives: real-time or serverless with a 128³ payload, which splits preprocessing between the backend and the endpoint; or local CPU inference, which doesn't meet the "host on SageMaker" constraint.
- D2. Each generate run creates a new candidate. Tailoring makes new revisions on that candidate. Why: earlier candidates stay comparable, and revision history shows each adjustment. Alternatives: write onto the user's selected candidate, which mixes model output with manual edits.
- D3. The endpoint returns a probability volume, and threshold and region changes run locally. Why: tailoring takes seconds and costs no endpoint call. Alternatives: re-invoke for each change.
- D4. The agent stages proposals, and the user accepts them. Why: live AI writes are disabled under the AI spec, and the user stays in control of each fix. Alternatives: let the agent commit directly, which the AI spec forbids.
- D5. Fix statistics reuse main's geometry measurement core. Why: there's one definition of "fix voxels" and one method per number. Alternatives: a separate stats module.

## Flagged concerns
- Open (build): R14's "largest gap" can't be measured with the existing rim-fit method, which always gives 0 mm for a fix predicted in place. The report shows "Not available". Decide on a defect-rim definition, or drop the number. See plan Deviations 4.
- Open (build): S10 assumed a code-enforced number guard on agent replies. The live Bedrock/Gemini graph enforces it only through the system prompt, so S10 isn't testable as written. The describe tool returns the report (R21 is tested).
- Resolved (build): the branch was cut from `main`, with `ml-model-design` merged into it locally.
- Branch: the build must start from `main`. `ml-model-design` must be merged first, or its `ml/cranial/` changes brought over, because main has FastAPI, the agent and the measurement tools, and this branch doesn't.
- R14's numbers are "real measurements" under AI spec R7. That spec requires an agreed contract in `docs/ai/contracts.md`. This feature has to write and get that contract agreed before the agent may report them.
- Cost: an async endpoint at zero instances has a cold start of several minutes. A demo needs a warm-up step and a guaranteed shutdown afterwards (R4).
- Payload sizes and timeouts for async inference come from memory. Confirm them against AWS docs in the plan.
- Accuracy outside synthetic parietotemporal defects is unmeasured. R17's label is the only guard. The app can't detect defect type.
- The status steps within the endpoint wait (R10) are partly timer-driven. They must not be presented as measured progress.
- Thickness and rim-gap methods depend on main's `geometry_measurements.py`. If its definitions don't fit a model fix, R14 needs a decision.

## Open questions
- CPU or GPU instance for the endpoint? This depends on S11 timing.
- Should the probability volume be kept forever, or deleted when the fix candidate is deleted?
- Smoothing the fix surface was offered as optional tailoring. Is it wanted later?

## Out of scope
- Retraining, threshold re-tuning on test data, new datasets, 1 mm resolution, other defect categories.
- CT, STL or GLB input (only the R22 written note).
- Clinical validation, implant thickness design, fixation, screws, material, manufacturing export.
- Biological or clinical judgments in the fix panel.
- Natural-language control of the model itself.
- Multi-user or cloud hosting of the whole app.
- Model-side region guidance (telling the model where the defect is before it predicts).
