# Intent: Generate a predicted bone fix for a defective skull in the app

Author: Minh Triet Nguyen · Date: 2026-11-15 · Status: accepted

## Problem
We now have a model that is good enough. The frozen U-Net (`ml/cranial/manifests/freeze_v2.json`) predicts the missing bone on held-out SkullBreak parietotemporal cases. It reaches mean Dice 0.811 and median HD95 2.49 mm. But it only runs from a Python command line on a file you already have. Nobody using the app can get a fix from it.

Today a user imports a defective skull into the workspace and sees the hole. To get a candidate repair they would have to leave the app, run `predict.py` by hand, and bring the result back. Or they build the shape themselves. The agent can't do it either. Its reconstruction path is a labeled mock that produces no real geometry.

## Desired outcome
A user imports a defective skull, asks for a fix, and gets a predicted implant back as a new candidate on that case. What they see is a new model in the canvas: the same skull, with the fix filled in and highlighted in a different color. It sits in the same place as the skull and can be inspected with the tools we already have. The user can select the fix part on its own and get the key numbers about it: how big it is, how it sits against the surrounding bone, and so on. Next to those, I want numbers about the ML process that made it: which model, what it was trained on, how well it scored on held-out cases, and how long this prediction took.

For the demo the input is a segmented NRRD skull mask. I'd also like to know whether predicting straight from a CT scan is possible.

There are two ways to ask:

- A button in the canvas, something like "Generate fix". Waiting is fine. While it runs there's a progress bar and a short status line that changes as it goes (for example "Uploading skull", "Running model", "Building mesh"). The steps can be mocked at first. Then the candidate appears. If it fails, you see why.
- The agent. You ask in chat ("fill this defect"), and the agent calls the same prediction as a tool. Then it explains what came back, using only facts that are in the result.

I'd like the human and the agent to work on the fix together, so it fits the case better than one shot of the model. For example, the user marks the defect region, or tells the agent "too thick at the edge" or "smooth it out", and the agent re-runs or adjusts. The model itself does not understand text. So the tailoring has to come from inputs the model or the post-processing can actually take, or from the editing tools after prediction. If that isn't realistic in the time we have, it's fine to expose prediction as an agent tool plus the button, and leave tailoring to manual editing.

Every predicted fix says where it came from (model, checkpoint hash, freeze file) and that it is a geometry proposal from a model trained on synthetic data. It is not a clinical design.

## Affected users and systems
Biomedical engineers use it to get a starting candidate. Surgeons review it.

Parts touched, as far as I know:
- Model hosting and an inference service that wraps `ml/cranial/predict.py`. The ml-model spec D4 already says the candidate feature wraps that code rather than writing its own.
- Input conversion. The app stores samples as NRRD volumes with spatial metadata. The model wants a binary defective-skull mask, resampled to 2 mm / 128³ and mapped back afterwards. Users may also import meshes.
- The app's API and SQLite store. On `main` this is the FastAPI application under `backend/ai/` (Express was removed). The fix becomes a candidate and revision on the sample.
- Canvas UI: the button, progress, error states, and the result rendered in the viewport.
- The AI backend (`backend/ai/`). It has a reconstruction adapter seam where the mock sits today, and a tool registry. The real model should plug in there.

## Constraints
- Host the model on AWS SageMaker and call it as an API from our backend. No out-of-pocket cost: it has to fit free credits, so an endpoint can't sit on a paid instance around the clock.
- Use the frozen checkpoint and freeze file as they are. The weights come from S3 `cranial/checkpoints/run_1794725904/` and are checked against the hash in `freeze_v2.json`. No retraining or threshold changes in this feature: the test set has already been seen.
- Prediction, evaluation and serving share one preprocessing and inverse-transform path (`predict.py`), so the fix lands in the input's own coordinates.
- The predicted fix never overlaps existing bone and is never empty. An empty or failed prediction is reported as a failure, not shown as a fix.
- The claim stays narrow. The model was trained on single parietotemporal defects on synthetic data. Inputs outside that are allowed, but are labeled as outside what was tested.
- UI follows `DESIGN.md` and `docs/design-conventions.md`.
- The agent can't make up geometry or numbers. It calls the tool and reports what the tool returned (AI spec R9, R14).
- No credentials in source files.

## Out of scope
- Retraining, new datasets, higher resolution (1 mm) or new defect categories. Those belong to `ml-model`.
- Clinical validation, implant thickness, fixation, screw positions, material and manufacturing export.
- CT scans, STL or GLB as inputs for the demo. Only the feasibility of CT input is in scope, as a written note.
- Biological or clinical judgments about the fix (healing, fit for a patient). The numbers on a selected fix are geometry measured from the result.
- Teaching the model to understand natural language.
- Multi-user or cloud hosting of the whole app.

## Open questions
- Which SageMaker inference type: real-time, serverless or async? This depends on payload size, timeout, cold start and cost. Does the endpoint run all of `predict.py`, or only the model forward pass?
- Which kind of tailoring do we do now? Candidates: a threshold or smoothing control the agent can change and re-run; marking the defect region; trimming the fix's edge; or the agent driving the existing edit tools after prediction.
- Which numbers do we show for a selected fix, and do they need an agreed measurement contract under the AI spec (R7)?
- Where does the mask-to-mesh step run, on the endpoint or in our backend?
- Can we predict from a CT scan? This needs a written answer, not a build.
- Does the button go through the AI backend's operation service, or straight to the app API? Do both paths share one operation, so a fix from the button and one from the agent are recorded the same way?
- The AI backend's real-adapter work needs an agreed contract (`docs/ai/contracts.md`). Does this feature write that contract for reconstruction?

## Amendments
