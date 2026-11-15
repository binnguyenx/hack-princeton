# Plan: Cranial Reconstruction ML Pipeline

Spec: [spec.md](spec.md) · Intent: [intent.md](intent.md) · Status: done · Last updated: 2026-11-15

## Architecture & Data Flow

```
Raw SkullBreak Archives (S3 / Studio /tmp)
                   │
                   ▼
       ml/cranial/prepare_data.py
  (optional RAS reindex, resample ~1mm, pad 256³, uint8, subject split)
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
       (pilot overfit check, 3D U-Net, soft Dice default, AMP optional, early stop)
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
   - [`ml/cranial/prepare_data.py`](../../ml/cranial/prepare_data.py): Automated manifest generation, subject-exclusive splitting, optional LPS→RAS reindex (default off), 1mm isotropic resampling, 256³ padding, uint8 NRRD export, landmark round-trip test, and S3 synchronization.
   - [`ml/cranial/audit_data.py`](../../ml/cranial/audit_data.py): Verifies physical frames, binary values, non-empty implants, ensures zero overlap with source skull, checks subject exclusivity, and saves orthogonal PNG slice overlays.
   - [`ml/cranial/configs/prepare.yaml`](../../ml/cranial/configs/prepare.yaml): Unified configuration for data paths, filters, splits, and S3 versioning.
   - [`ml/cranial/configs/s3_lifecycle.json`](../../ml/cranial/configs/s3_lifecycle.json): Protects raw, processed, and manifest assets with bucket lifecycle policies.
   - [`ml/cranial/tests/test_preprocessing.py`](../../ml/cranial/tests/test_preprocessing.py): Unit tests for binary checks, coordinate transformations, resampling, and padding.
   - [`ml/cranial/tests/test_pipeline.py`](../../ml/cranial/tests/test_pipeline.py): Inference/preprocess agreement, freeze checks, pilot guards, checkpoint restore.

2. **Training & Platform Orchestration**:
   - [`ml/cranial/train.py`](../../ml/cranial/train.py): SageMaker training container entry point. MONAI 3D U-Net (16–256 channels), default pure soft Dice, AdamW, optional AMP, pilot best-Dice gate with patience, `latest.pt` / `best.pt`, `metrics.jsonl`.
   - [`ml/cranial/launch_training.py`](../../ml/cranial/launch_training.py): Local orchestrator for pilot/full jobs on `ml.g5.2xlarge` with runtime caps.
   - [`ml/cranial/requirements.txt`](../../ml/cranial/requirements.txt): Pinned dependencies for training and inference containers.
   - [`ml/cranial/load_skullbreak_s3.py`](../../ml/cranial/load_skullbreak_s3.py), [`ml/cranial/upload_processed.py`](../../ml/cranial/upload_processed.py): S3 raw/processed helpers.

3. **Inference & Evaluation**:
   - [`ml/cranial/predict.py`](../../ml/cranial/predict.py): Inference with freeze-driven preprocessing, source-grid inversion, source-bone exclusion.
   - [`ml/cranial/evaluate.py`](../../ml/cranial/evaluate.py): Freeze-gated held-out evaluation (Dice, HD95 mm, ASSD, boundary Dice, empty/mirror baselines, failure retention, slice overlays).

## Operational Milestones

- [x] Phase 1: Preprocessing pipeline, audit tool, and unit tests written.
- [x] Phase 2: SageMaker training entry point and launch script written.
- [x] Phase 3: Prediction engine with source-space coordinate inversion implemented.
- [x] Phase 4: Held-out evaluation suite with baseline comparators implemented.
- [x] Phase 5: Data preparation / processed cache available (manifest audit 134/134; processed `v1` on S3 used by SageMaker jobs).
- [x] Phase 6: GPU pilot reaches Dice ≥ 0.90 on 3 training cases (R7 / S3). Passed on **v2** in `cranial-pilot-run-1794717579` (best 0.9043 @ ep 89). Recipe locked as spec **D7** / investigation log §9.
- [ ] Phase 7: Full 50-epoch training and freeze `best.pt`. First attempt `…7924` with full `lr=0.0002` → best val ≈ **0.12** (D9) — do not freeze. Retry with `--lr 0.005 --no-amp` after the D10 training-loop fixes (flip axis, warmup + cosine LR, patience 30, train Dice logging).
- [ ] Phase 8: `evaluate.py` on held-out test + published summary (blocked on a freeze-worthy Phase 7).

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
| R9 | `evaluate.py` verifies freeze checkpoint hash before running |
| R10 | `evaluate.py` maps prediction to source grid and outputs Dice, HD95 mm, ASSD mm, and boundary Dice |
| R11 | `evaluate.py` flags empty or invalid predictions as failures in denominators |
| R12 | `evaluate.py` writes `summary_test.json` evaluating mean Dice >= 0.80 and median HD95 <= 5.0 mm |
| R13 | `evaluate.py` outputs empty-patch and mirror-based baseline metrics |
| R14 | `evaluate.py` saves orthogonal slice PNGs for failures, min, median, and max cases |
| R15 | `evaluate.py --split mug500b` runs domain-shift evaluation separately |
| R16 | `predict.py` executes source grid reconstruction and zero-overlap bone enforcement |
| R17 | Provenance metadata stored in freeze and run metadata records |
| R18 | `launch_training.py` sets `max_run` ceiling and profiles step time/memory |

## Deviations

1. **Close scope was pipeline code + local proofs.** Phase 6 (R7) later passed on v2 (D7). Phases 7–8 and held-out S5/S7 remain open. Pilot pass ≠ demo model.
2. **Default loss is pure soft Dice**, not the spec’s original equal-weight Dice+BCE. `dice_bce` remains selectable. Recorded after BCE-driven all-zero collapse on imbalanced 256³ volumes.
3. **Accepted pilot recipe (D7):** AMP off, **`pilot-lr=0.005`**, best-Dice gate with patience 40, processed **v2**. Launcher CLI default `pilot-lr` may still show 0.001 — pass `--pilot-lr 0.005` explicitly for full runs until the default is bumped. Full-run `--lr` / AMP unchanged unless overridden.
4. **Preprocessing default `convert_to_ras: false`** so prepare and predict stay aligned; spec text implied LPS→RAS always-on.
5. **First-pass data is SkullBreak parietotemporal only** (D2), not the intent’s full SkullBreak+SkullFix+healthy MUG500+ set. Spec already flagged this; still needs explicit owner accept/reject.
6. **Extra files not in the original plan sketch:** `LIVE_INVESTIGATION_LOG.md`, `LEARNING_FAILURE_POSTMORTEM.md`, `WORKFLOW.md`, `README.md`, `load_skullbreak_s3.py`, `upload_processed.py`, research note under `features/ml-model/`, audit PNGs/JSON under `reports/`. Kept as operational/investigation artifacts.
7. **R15 MUG500+ B evaluation** not run; allowed “not run” outcome remains available.
8. **D10 training-loop fixes (2026-11-15):** flip augmentation axis corrected (z → x), warmup + cosine LR schedule, full-run patience 30, per-epoch train Dice / LR logging. Launcher `--early-stop-patience` / `--warmup-epochs` pass through; launcher itself is not unit-tested (needs `sagemaker`).
8. **Local CPU pytest does not prove CUDA/AMP convergence.** Env: `app/cranial-env/` with optional `PYTHONPATH=/tmp/cranial-verify-deps` for NumPy 1.26.4 when the env’s NumPy 2.x breaks MONAI 1.3.0.
9. **Processed cache for the accepted first train path is v2 (2 mm isotropic, 128³)** per D7. Spec R4 still states ~1 mm / 256³ (v1); amend R4 to match D7 or document v1 as a deferred higher-res revisit.
10. **Local Proof regression at Close:** `test_real_augmentation_preserves_pair_alignment` fails in `app/cranial-env/` with MONAI 1.3.0 `OverflowError` when building `RandAffined`. Other local unit tests pass; aug-on full training is not locally proven.
11. **Pilot-only SageMaker jobs are not freeze/eval inputs.** After R7 pass, next step is `--mode full` with D7 settings; then freeze val-selected `best.pt` before test.
12. **Pilot is a fuse, not a training ingredient (D8).** Full train does not reuse pilot weights. Default remains run-pilot; `--skip-pilot` is an explicit operator choice after D7. See `LIVE_INVESTIGATION_LOG.md` §10.
13. **Full run `…7924` not shippable (D9).** best val Dice ≈ 0.116. Do not treat “91 cases is too few” as the first explanation; raise full `--lr` toward 0.005 next. Details: `LIVE_INVESTIGATION_LOG.md` §11.
