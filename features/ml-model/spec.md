# Spec: Cranial reconstruction model

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-15

## Summary
This feature trains and evaluates a small 3D U-Net that predicts the missing bone volume from a segmented defective skull. The first pass uses SkullBreak parietotemporal cases only, so it fits one day and a GPU window of about 2 to 3 hours. It produces a frozen checkpoint, a published split manifest, a `predict` entry point that writes a candidate volume in the input's coordinates, and a report of per-case results.

## Requirements
- R1. A manifest lists every case with dataset version, original subject ID, defect category, partition, source path, checksum, shape, voxel spacing, origin, direction matrix and label source. Data preparation stops a case with missing metadata, non-binary values or an empty target.
- R2. Subjects are split by original subject ID: 91 training and 23 validation from the 114 SkullBreak training subjects, and the 20 official evaluation subjects as test. Counts are re-checked against the downloaded data. A check fails if any subject ID appears in two partitions.
- R3. No MUG500+ B subject and no case from the Mendeley derivative appears in a training or validation manifest.
- R4. Preprocessing reads spacing, origin and direction from the file and applies the LPS/RAS conversion exactly once. It resamples to about 1 mm isotropic on a padded 256³ grid, and the crop is chosen from the defective input only. A case that does not fit is rejected, not cut off. Each case keeps its inverse transform.
- R5. A known mask and landmark pushed through the preprocessing transform and its inverse return to within 0.01 mm before any voxel resampling.
- R6. Training runs on one GPU for at most 50 epochs and within a runtime cap. Early stopping with patience of 15 validation evaluations may end it sooner. It saves best and latest checkpoints and resumes from the latest.
- R7. Before the full run, an overfit run on 2 to 4 training cases with augmentation off reaches implant Dice of at least 0.90 on those cases. If it doesn't, the full run doesn't start. (added: the research gives no number.)
- R8. Each run saves the Git commit, environment lock, config, seed, split hash, model and optimizer state, `metrics.jsonl` and a plain log.
- R9. A freeze file records the checkpoint hash, threshold, preprocessing config, postprocessing config and Git commit. It is written from validation results. `evaluate` refuses to run on the test split or on MUG500+ B without it.
- R10. `evaluate` maps predictions back to the source grid before measuring. It reports, per case and per defect category, implant Dice, HD95 in mm (symmetric, using voxel spacing), average symmetric surface distance in mm, and boundary Dice labeled as this project's own definition. It does not report full-skull Dice as repair quality.
- R11. An empty, non-finite, truncated or wrongly framed prediction is a failure. Failures stay in every denominator and are listed in the report.
- R12. The report states whether the provisional targets were met on the synthetic test set: mean implant Dice of at least 0.80 and median HD95 of at most 5 mm. It lists every case either way.
- R13. The report includes two baselines on the same cases: an empty-patch baseline, and a mirror-based baseline on the unilateral cases where the opposite side is intact. The mirror baseline uses a documented midsagittal plane.
- R14. The report includes orthogonal-slice overlays and 3D views for every test failure and for three cases chosen by a rule fixed before the test run: highest, median and lowest implant Dice.
- R15. The 29 MUG500+ B cases are evaluated once, after the freeze, and reported in a separate table labeled as expert-design references and a domain-shift test. Expert STL implants are voxelized onto each defective NRRD's exact grid. Cases that fail conversion are listed. If the day runs out, the report says "not run" and gives the reason.
- R16. `predict` takes a prepared defective-skull NRRD, a checkpoint and the freeze file. It writes a candidate NRRD with the input's shape, spacing, origin and direction, plus metadata (checkpoint hash, preprocessing config, input hash). It rejects an empty result and sets no voxel where the source has bone. `evaluate` uses the same code path. (added: the intent left ownership open.)
- R17. If a pretrained model is used instead of or beside the self-trained one, the report records its source, license and known training data. Its scores are labeled demo results.
- R18. Every GPU job has a runtime cap and stays within confirmed credits. The report records instance type, step time, peak GPU memory and total GPU hours.

## Success criteria
- S1. Given the downloaded SkullBreak archives, when `prepare_data` runs, then it writes the manifest and an audit report with counts per partition, and the subject-overlap check passes.
- S2. Given a synthetic mask with three known landmarks, when it goes through the transform and back, then each landmark is within 0.01 mm of the original.
- S3. Given 3 training cases and no augmentation, when `train` runs to its cap, then implant Dice on those cases is at least 0.90.
- S4. Given no freeze file, when `evaluate` is run on the test split, then it exits with an error and writes no metrics.
- S5. Given a frozen checkpoint, when `evaluate` runs on the 20 test subjects, then the output has one row per case, including failures, and a summary by defect category.
- S6. Given a test input, when `predict` runs, then the candidate NRRD matches the input's grid, is non-empty, and has zero voxels inside the source bone.
- S7. Given the report, when a reader looks for the real-case results, then they are in a separate table with the limitation text, or the report says "not run" and why.

## Design
The model learns f(D) → I. D is the segmented defective skull, one binary channel. I is the missing-bone volume. The output is one logit per voxel. A validation-selected threshold turns it into a binary candidate.

The first pass trains on SkullBreak parietotemporal pairs only. That is one defect per skull, so 91 training pairs. SkullFix and healthy MUG500+ with synthetic defects are added in a second run only if the first finishes with time left. Parietotemporal defects are mostly one-sided, which also makes the mirror baseline usable.

Starting settings come from the research and are engineering choices, not published optima: PyTorch with MONAI; U-Net channels 16, 32, 64, 128, 256; instance normalization; default loss is pure soft Dice (`--loss dice`; `dice_bce` and `dice_focal` remain available); AdamW; batch size 1; pilot defaults to float32 with `--pilot-lr 0.001` and AMP off unless `--pilot-amp`; full training may still use AMP; small paired rotations, translations and scales when augmentation is on. Binary masks resample with nearest-neighbor, and predicted scores resample linearly before thresholding. The deterministic preprocessing is cached as uint8 and augmentation runs after the cache. Live default preprocessing keeps `convert_to_ras: false` so prepare and predict share the same axis setting.

The first run is capped at 50 epochs. At 91 training pairs that is 4,550 steps, plus validation. Run a timed pilot first and measure seconds per step and peak GPU memory. If a step takes about 2 seconds or less, 50 epochs fit in a 3 hour window. If it takes longer, stop and choose: extend the window, accept fewer epochs (the best checkpoint so far is kept), use a coarser grid, which blurs thin bone, or use a pretrained model. That is a decision for the team, not a silent change.

The platform is AWS SageMaker with S3 for data, checkpoints and reports. Kaggle's free GPU sessions are the fallback for training. Neither is a serving option. Serving belongs to `cranial-reconstruction-candidate`.

## Where it lives
Confirmed under `ml/cranial/`:
- Scripts: `ml/cranial/prepare_data.py`, `ml/cranial/audit_data.py`, `ml/cranial/train.py`, `ml/cranial/launch_training.py`, `ml/cranial/evaluate.py`, `ml/cranial/predict.py`, `ml/cranial/load_skullbreak_s3.py`, `ml/cranial/upload_processed.py`
- Configs and manifests: `ml/cranial/configs/` (live prepare default is v2: 2 mm / 128³), `ml/cranial/manifests/split_v1.csv`, `ml/cranial/manifests/split_v2.csv`, `ml/cranial/manifests/audit_v1.json`, `ml/cranial/manifests/audit_v2.json`
- Reports / investigation: `ml/cranial/reports/`, `ml/cranial/LIVE_INVESTIGATION_LOG.md`, `ml/cranial/LEARNING_FAILURE_POSTMORTEM.md`
- Tests: `ml/cranial/tests/`
- Local Python env used for CPU checks: `app/cranial-env/`

## Decisions
- D1. Direct prediction of the missing volume. Why: the output matches the candidate object. Alternatives: predict the full skull and subtract. Revisit only if direct prediction fails on unfamiliar defects.
- D2. The first run trains on SkullBreak parietotemporal only. Why: one day and a 2 to 3 hour GPU window cannot cover three sources and a defect generator. Alternatives: all three sources from the start, as the intent states.
- D3. The first claim covers single parietotemporal cranial-vault defects. Why: it matches the training data and the mirror baseline. Other SkullBreak categories, if run, are reported as stress tests and never dropped quietly.
- D4. This feature owns the core of `predict`, and the candidate feature wraps it as a service. Why: training, evaluation and serving then share one preprocessing and inverse-transform path, which prevents mismatches. Alternatives: let the candidate feature write its own.
- D5. A pretrained model is an acceptable fallback with recorded provenance and demo-only scores. Why: it may have seen the test subjects.
- D6. The first run is capped at 50 epochs, and a timed pilot confirms it fits the window before the full run starts. Why: the research warns that hours can't be assumed from dataset size, and 50 epochs at 91 pairs is an estimated 1.3 to 3.8 hours. Alternatives: the research's 100-epoch ceiling, which needs about twice that.
- D7. First accepted training recipe (2026-11-14): processed **v2** (2 mm isotropic, 128³), pure soft Dice, pilot with **AMP off** and **`pilot-lr=0.005`**, best-Dice gate with patience 40. Evidence: SageMaker job `cranial-pilot-run-1794717579` reached best implant Dice **0.9043** at epoch 89 on 3 unaugmented train cases (R7). Why: v1 256³ and v2@`pilot-lr=0.001` peaked ~0.23–0.31 then collapsed; this recipe is the first full pipeline overfit pass. Alternatives rejected for the first full run: stay on v1, or keep pilot-lr≤0.001. The pilot checkpoint is **not** the product model; full train → val-selected `best.pt` → freeze → test. See `ml/cranial/LIVE_INVESTIGATION_LOG.md` §9–§10.
- D8. Keep the pilot gate by default even after D7. Why: the pilot does not feed weights into full train; it is a cheap fuse against silent no-learning failures (all-zero BCE collapse, AMP NaNs, soft/hard Dice mismatch). Full train is the real generalization run (91 train / 23 val); test after freeze is the presentable held-out claim. `--skip-pilot` is allowed only when the operator explicitly accepts removing that fuse. Transparency write-up: `LIVE_INVESTIGATION_LOG.md` §10 and `ml/cranial/WORKFLOW.md` §3.
- D9. Full run `cranial-full-run-1794717924` (v2, pilot 0.005, **full `lr=0.0002`**) reached **best val Dice ≈ 0.116** (epoch 5) — not acceptable to freeze/demo. Why it is bad is **not** primarily “too few data”: the same stack overfit 3 cases at 0.90 with `pilot-lr=0.005`, so capacity/labels work; 91 skulls can limit a high ceiling later but do not explain stalling at ~0.12 with soft loss ~0.99. Leading hypothesis: full-run LR ~25× below the only LR that moved learning. Next experiment: `--mode full --pilot-lr 0.005 --lr 0.005` before collecting more datasets. See `LIVE_INVESTIGATION_LOG.md` §11.
- D10. Training-loop fixes before the D9 retry (2026-11-15): (a) the left-right flip augmentation used `spatial_axis=0` on `[C, z, y, x]` tensors, so half of all training samples were upside down — corrected to `spatial_axis=2` (x, the same sagittal axis as the mirror baseline); (b) full-run LR now warms up linearly for `--warmup-epochs` (default 5) then cosine-decays to 1% of `--lr`; (c) full-run early-stop patience default 30 instead of 15; (d) each epoch logs train hard Dice and the epoch LR next to val Dice. Why: the flip mismatched train vs val/test geometry and is the most likely reason the unaugmented pilot passed while augmented full train did not; patience 15 cut off …7924 after its epoch-5 peak; train Dice is needed to tell under-fitting from poor generalization before blaming data volume. Pilot (D7) is unchanged. See `LIVE_INVESTIGATION_LOG.md` §12.

## Flagged concerns
- The scope in D2 departs from the intent, which says training uses SkullBreak, SkullFix and healthy MUG500+. It is an amendment to accept or reject.
- GPU quota is the biggest schedule risk. New accounts may have a quota of zero for GPU instances, and AWS reviews increase requests. Check the quota for the instance type in Service Quotas now. If it is zero and an increase doesn't arrive, move training to Kaggle.
- The 2 to 3 hour window covers training only. Quota, downloads, preprocessing, the pilot and evaluation add time. Step-time and epoch figures are not measured yet.
- R15 depends on converting 29 expert meshes onto exact grids, which is likely the first thing to slip. The spec allows an explicit "not run".
- R7 pilot gate is met on v2 (D7); frozen checkpoint and held-out report still do not exist until full train + evaluate.
- Pretrained model scores may include test subjects. They can't be called held-out results.
- D7 / live defaults use processed **v2** (2 mm / 128³) while R4 still textually requires ~1 mm / 256³. R4 should be amended to match D7 or a later return to v1 — do not leave both as unspoken authority.
- Local unit Proof: `test_real_augmentation_preserves_pair_alignment` fails under MONAI 1.3.0 in `app/cranial-env/` (uint32 seed overflow).

## Open questions
- Which exact dataset versions and checksums are downloaded, and do the counts in R2 hold once the parietotemporal subset is filtered?
- Are the model weights initialized randomly or from a pretrained checkpoint?
- Which alignment method defines the midsagittal plane for the mirror baseline?
- Which 29 subjects form the reserved MUG500+ B set, given that the Mendeley derivative lists 31 base pairs?
- Is the GPU instance quota non-zero in the chosen region?

## Out of scope
- Serving, latency targets, mesh generation and app integration (`cranial-reconstruction-candidate`).
- Clinical validation, implant thickness, fixation, clearance and material.
- The completion formulation, refinement stage, diffusion models, cross-case registration augmentation and test-time ensembling.
- Raw CQ500 or MedShapeNet expansion.
- Natural-language control of the model.
- Training on SkullFix and healthy MUG500+ in the first run (second run, if time allows).
