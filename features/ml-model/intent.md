# Intent: Train and evaluate a model that predicts missing cranial bone

Author: unknown · Date: 2026-11-14 · Status: accepted

## Problem
The 3D workspace can show a segmented skull with a hole in it, but nothing in the app can propose the bone that fills the hole. Someone planning a cranial repair has to build that shape by hand.

A trained model could propose it. Right now we have no audited data, no train/validation/test split, no checkpoint and no measured results. We also can't yet say which defects the model handles and which it doesn't. Until we can, the app has nothing safe to build on.

## Desired outcome
A frozen model that takes a prepared defective-skull mask (NRRD) and predicts the missing-bone volume in the input's own coordinates. It predicts geometry only: no treatment label, material, screw positions or manufacturing design.

Next to the model, a report anyone can read without the training logs. It says how good the model is, on which defect types, and where it fails. It contains:

- Results on a held-out synthetic test set, case by case and by defect category.
- Results on the 29 real MUG500+ B defect cases, reported separately and labeled as a domain-shift test.
- A comparison with a mirror-based baseline and an empty-patch baseline.
- Every failure, counted, not dropped.

The work is done when the frozen checkpoint, its preprocessing and postprocessing config, a published split manifest and the report exist, and the candidate feature can load the checkpoint without asking us what we meant.

## Affected users and systems
The people who run it are the engineers training and evaluating the model. The people who depend on it are the team building the follow-on feature, `cranial-reconstruction-candidate` (service, mesh, app integration), which consumes the checkpoint.

Systems touched: dataset downloads (SkullBreak, SkullFix, MUG500+), a GPU platform (AWS SageMaker with S3 preferred, then an MLH-provided Vultr VM, then Kaggle), and new Python scripts for data preparation, training and evaluation. This feature does not touch Express or SQLite.

Training uses SkullBreak, SkullFix and healthy MUG500+ skulls with synthetic defects. The formulation is direct prediction of the missing volume with a small 3D U-Net. That choice was recorded on 2026-11-14.

## Constraints
- No out-of-pocket cost. Free credits are a finite budget, and account eligibility and GPU quota are not yet confirmed.
- Every derivative of one source skull (defect variants, crops, augmentations, meshes) stays in one partition. Original subject IDs are stored, not just file names.
- The 29 MUG500+ B cases, and the Mendeley dataset derived from them, never enter training, validation or model selection.
- Checkpoint, threshold, preprocessing and postprocessing are frozen before anyone opens test results. If test results then drive a change, those cases are reported as development data from that point on.
- Acceptance targets (mean implant Dice of at least 0.80, median HD95 of at most 5 mm on the predefined supported synthetic subset) are provisional project choices, not medical thresholds. They are not changed after the test set has been seen.
- Dataset licenses are recorded separately from code licenses. SkullBreak carries CC BY-NC-SA 4.0 plus the CQ500 EULA.
- Every run is reproducible: commit, environment lock, config, seed and split hashes are saved with it.
- No credentials in source files.

## Out of scope
- Serving the model, latency targets, mesh generation and app integration. These belong to `cranial-reconstruction-candidate`.
- Clinical validation, implant thickness, fixation, clearance or material.
- Predicting the complete skull and subtracting (the completion formulation), a refinement stage, diffusion models and cross-case registration augmentation. We revisit these only if direct prediction proves to be the bottleneck.
- Raw CQ500 or MedShapeNet expansion.
- Natural-language control of the model. It does not understand text or free-form constraints.

## Open questions
- How many days are left before the demo? This sets the size of the pilot and the training budget.
- Does the team have confirmed GPU access: an existing AWS account or a new one, or an MLH gift code that covers GPUs?
- Which defects does the first claim cover? The research proposes single cranial-vault defects, starting with parietotemporal, with other SkullBreak categories reported as stress tests.
- Does this feature own `predict.py` (candidate NRRD plus mesh with deployment preprocessing), or does the candidate feature?
- Is a self-trained checkpoint required, or is a pretrained model with recorded provenance acceptable as a fallback? A pretrained model may have seen the test subjects, so its scores would be demo results, not clean evidence.
- Exact dataset versions, split manifests and checkpoint initialization are not yet audited.
- The research lists 29 MUG500+ B cases but 31 base pairs in the Mendeley derivative. Which subjects are in the reserved set?

## Amendments
- 2026-11-14: The deadline is one day. The GPU platform is AWS SageMaker. Training and evaluation should fit a window of about 2 to 3 hours of GPU time. A pretrained model is an acceptable fallback if its source and license are recorded and its scores are labeled as demo results, not held-out evidence.
