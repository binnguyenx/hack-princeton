# Plan: Cranial Reconstruction ML Pipeline

Spec: [spec.md](spec.md) · Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14

## Architecture & Data Flow

```
Raw SkullBreak Archives (S3 / Studio /tmp)
                   │
                   ▼
       ml/cranial/prepare_data.py
  (LPS→RAS, resample ~1mm, pad 256³, uint8, subject split)
                   │
                   ├──► manifests/split_v1.csv + manifests/audit_v1.json
                   └──► s3://<bucket>/cranial/processed/v1/{train,val,test}
                                  │
                                  ▼
                        ml/cranial/audit_data.py
           (integrity checks, overlap test, slice visualizations)
                                  │
                                  ▼
                     ml/cranial/launch_training.py
         (submits PyTorch SageMaker Training Job to ml.g5.2xlarge)
                                  │
                                  ▼
                         ml/cranial/train.py
       (pilot overfit check, 3D U-Net, soft Dice + BCE, AMP, early stop)
                                  │
                                  ▼
                   checkpoints/best.pt + freeze_candidate.json
                                  │
                                  ▼
                      Review & Freeze (freeze_v1.json)
                                  │
                                  ▼
                        ml/cranial/evaluate.py
   (source grid inversion, Dice, HD95 mm, ASSD, Boundary Dice, Mirror Baseline)
                                  │
                                  ▼
                   reports/summary_test.json + slice overlays
```

## Files Implemented

1. **Data Preparation & Validation**:
   - [`ml/cranial/prepare_data.py`](../../ml/cranial/prepare_data.py): Automated manifest generation, subject-exclusive splitting, LPS→RAS flip (applied once), 1mm isotropic resampling, 256³ padding, uint8 NRRD export, landmark round-trip test, and S3 synchronization.
   - [`ml/cranial/audit_data.py`](../../ml/cranial/audit_data.py): Verifies physical frames, binary values, non-empty implants, ensures zero overlap with source skull, checks subject exclusivity, and saves orthogonal PNG slice overlays.
   - [`ml/cranial/configs/prepare.yaml`](../../ml/cranial/configs/prepare.yaml): Unified configuration for data paths, filters, splits, and S3 versioning.
   - [`ml/cranial/configs/s3_lifecycle.json`](../../ml/cranial/configs/s3_lifecycle.json): Protects raw, processed, and manifest assets with bucket lifecycle policies.
   - [`ml/cranial/tests/test_preprocessing.py`](../../ml/cranial/tests/test_preprocessing.py): Unit tests for binary checks, coordinate transformations, resampling, and padding.

2. **Training & Platform Orchestration**:
   - [`ml/cranial/train.py`](../../ml/cranial/train.py): SageMaker training container entry point. Implements MONAI 3D U-Net (channels: 16, 32, 64, 128, 256), combined Soft Dice + BCE loss, AdamW optimizer, mixed precision (AMP), and automatic `latest.pt` / `best.pt` checkpointing with `metrics.jsonl`.
   - [`ml/cranial/launch_training.py`](../../ml/cranial/launch_training.py): Local orchestrator using the SageMaker Python SDK to submit pilot and full training jobs to `ml.g5.2xlarge` instances.
   - [`ml/cranial/requirements.txt`](../../ml/cranial/requirements.txt): Pinned dependencies for reproducible training and inference environments.

3. **Inference & Evaluation**:
   - [`ml/cranial/predict.py`](../../ml/cranial/predict.py): Verified inference pipeline that inverts preprocessing (unpadding and linear resampling back to patient origin/spacing/direction) and eliminates source bone collisions.
   - [`ml/cranial/evaluate.py`](../../ml/cranial/evaluate.py): Strict held-out evaluation enforcing freeze verification (R9), physical distance metrics in millimeters (R10), failure preservation in denominators (R11), project targets verification (R12), empty-patch & mirror baseline comparisons (R13), and slice visualizations (R14).

## Operational Milestones

- [x] Phase 1: Preprocessing pipeline, audit tool, and unit tests written.
- [x] Phase 2: SageMaker training entry point and launch script written.
- [x] Phase 3: Prediction engine with source-space coordinate inversion implemented.
- [x] Phase 4: Held-out evaluation suite with baseline comparators implemented.
- [ ] Phase 5: Execute data download and preprocessing in SageMaker Studio.
- [ ] Phase 6: Run `ml.g5.2xlarge` pilot job to confirm Dice ≥ 0.90 overfit check.
- [ ] Phase 7: Execute full 50-epoch training and freeze `best.pt`.
- [ ] Phase 8: Run `evaluate.py` on held-out test split and publish summary report.

## Proof

| Req | Verification |
|---|---|
| R1 | `python ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml` creates manifest with metadata, rejects invalid |
| R2 | `python ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv` validates subject exclusivity |
| R3 | `audit_data.py` asserts MUG500+ B IDs are excluded from train/val splits |
| R4 | `prepare_data.py` standardizes to 1mm isotropic 256³ and logs inverse transform |
| R5 | `python ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml --round-trip-only` landmark check within 0.01mm |
| R6 | `train.py` respects `--epochs 50` and early stopping patience 15 |
| R7 | `train.py --pilot` reaches implant Dice >= 0.90 on 2-4 training cases |
| R8 | `train.py` saves commit, seed, config, scaler, and `metrics.jsonl` |
| R9 | `evaluate.py` verifies `freeze_v1.json` checkpoint hash before running |
| R10 | `evaluate.py` maps prediction to source grid and outputs Dice, HD95 mm, ASSD mm, and boundary Dice |
| R11 | `evaluate.py` flags empty or invalid predictions as failures in denominators |
| R12 | `evaluate.py` writes `summary_test.json` evaluating mean Dice >= 0.80 and median HD95 <= 5.0 mm |
| R13 | `evaluate.py` outputs empty-patch and mirror-based baseline metrics |
| R14 | `evaluate.py` saves orthogonal slice PNGs for failures, min, median, and max cases |
| R15 | `evaluate.py --split mug500b` runs domain-shift evaluation separately |
| R16 | `predict.py` executes source grid reconstruction and zero-overlap bone enforcement |
| R17 | Provenance metadata stored in freeze and run metadata records |
| R18 | `launch_training.py` sets `max_run` ceiling and profiles step time/memory |
