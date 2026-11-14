# Cranial model workflow

Start here when taking over `ml/cranial/`. Run commands from the repository root. The [feature spec](../../features/ml-model/spec.md) defines the required behavior; the [plan](../../features/ml-model/plan.md) tracks operational milestones. This guide describes the scripts that currently exist and the order in which to use them.

## Goal and data flow

The model takes a binary NRRD mask of a skull with missing bone and predicts a binary mask of the missing piece. The first run uses SkullBreak **parietotemporal** cases only. Training and validation select the checkpoint and threshold; the official test partition stays held out until those choices are frozen.

```text
SkullBreak archives
  → load_skullbreak_s3.py       download, verify, unpack raw files
  → prepare_data.py             split subjects; create 1 mm, 256³ masks and metadata
  → audit_data.py               check pairs and create slice overlays
  → upload_processed.py         send the audited cache to S3 using boto3
  → launch_training.py pilot    test whether the model can learn three cases
  → launch_training.py full     train and select best.pt using validation
  → freeze_v1.json              record the selected checkpoint and settings
  → evaluate.py                 score the untouched test cases
```

S3 holds training inputs and job outputs; it is not a different processing pipeline. The upload command uses Python's `boto3` package, so the AWS CLI is not needed. SageMaker still needs an AWS account, an execution role, GPU quota, and enough credits before a job is submitted.

## What each file does

| File | Input → output | Why it exists |
|---|---|---|
| `load_skullbreak_s3.py` | Zenodo archives → verified raw copies in S3 and unpacked NRRDs in `/tmp/skullbreak/` | Gets the source data. Requires `curl`, `boto3`, and AWS credentials; it does not use the AWS CLI. `/tmp` may be cleared later. |
| `configs/prepare.yaml` | Paths, split seed, category filter, grid settings, optional S3 upload flag | Controls preparation. The current version filters to parietotemporal and writes `data/processed/v1/`. |
| `prepare_data.py` | Raw defect/implant pairs → processed NRRD pairs, metadata JSON, `manifests/split_v1.csv`, `manifests/audit_v1.json` | Splits by original subject, checks coordinate round trips, resamples to 1 mm, pads to 256³, and records how to return to the source grid. `--round-trip-only` checks the transform; `--dry-run` previews the split. |
| `audit_data.py` | Processed files and split manifest → `reports/audit_results.json` and optional PNGs in `reports/slices/` | Checks files, dimensions, spacing, binary masks, nonempty targets, bone overlap, and subject separation. `--n-vis 3` means three sampled cases **per partition**. Inspect the PNGs as well as the JSON. |
| `upload_processed.py` | Audited `data/processed/v1/` and manifests → `s3://<bucket>/cranial/processed/v1/` and `cranial/manifests/` | Uploads the existing cache with boto3. It requires an all-pass audit report and does **not** rerun preparation. |
| `launch_training.py` | S3 `train/` and `val/` channels → SageMaker job | Submits either the small pilot or the full GPU run. The launcher does not read the local NRRDs directly. |
| `train.py` | Training/validation NRRD pairs in the SageMaker container → `best.pt`, `latest.pt`, `metrics.jsonl`, `run_meta.json`, `freeze_candidate.json` | Trains a 3D U-Net; the pilot tries to overfit three training cases. Full training selects `best.pt` by validation Dice. |
| `predict.py` | Prepared defective-skull NRRD, checkpoint, freeze file → candidate NRRD | Runs inference, maps the result to the input's grid, and removes predicted voxels that overlap source bone. `evaluate.py` uses this inference path. |
| `evaluate.py` | Frozen checkpoint and manifest → per-case CSV, summary JSON, comparison slices | Measures implant Dice and distance metrics on the source grid and compares empty and mirror baselines. Test results must not drive a silent change to the frozen model. |
| `tests/test_preprocessing.py` | Synthetic test cases → pass/fail | Checks the data and coordinate helper functions without a GPU job. |

## Current handoff point

As of 2026-11-14, `manifests/audit_v1.json` lists 134 prepared cases: 91 train, 23 validation, and 20 official test. `reports/audit_results.json` records 134 passed and 0 failed. The first report summarizes preparation; the second checks the saved processed files. The slice PNGs are under `reports/slices/{train,val,test}/`. These are **data checks**, not model scores. No pilot, full-run checkpoint, or test metrics are recorded in this repository yet.

Review the overlays for a missing-bone patch that follows the skull gap, then proceed with the upload. Keep the test labels out of model and threshold decisions.

## Run order

### 1. Prepare data (skip if continuing from the audited `v1` cache)

Install the Python packages needed by the scripts in your environment; `ml/cranial/requirements.txt` lists the pinned packages. The launcher also needs the SageMaker Python SDK, which is not in that file. `python-dotenv` is optional if you want the scripts to read a project `.env`. Configure AWS credentials through an IAM role, environment variables, or the usual AWS SDK credential files. Set `S3_BUCKET` and `SAGEMAKER_ROLE` for the upload and training steps. Do not put credentials in the repository.

```bash
python3 ml/cranial/load_skullbreak_s3.py
python3 ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml --round-trip-only
python3 ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml
python3 ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv --visualize --n-vis 3
```

`prepare_data.py` can also upload through boto3 when `s3.upload_after_prepare: true` is set in `configs/prepare.yaml`. For an already prepared and audited cache, use the next command instead; rerunning preparation rewrites the local cache and manifest.

### 2. Upload the audited cache without the AWS CLI

```bash
python3 ml/cranial/upload_processed.py --bucket YOUR_BUCKET_NAME
```

`--bucket` can be omitted when `S3_BUCKET` is set, including in the project `.env` if `python-dotenv` is installed. The script uploads `data/processed/v1/{train,val,test}/` under `cranial/processed/v1/` and the manifest files under `cranial/manifests/`. It stops if either audit report is missing, the preparation rejected cases, or the saved-file audit has failures. Confirm the uploaded `train/` and `val/` objects exist before launching SageMaker; the launcher expects those exact prefixes.

### 3. Pilot on the GPU

First confirm the selected AWS region has nonzero `ml.g5.2xlarge` training quota and that the job fits the available credits. The pilot tries to learn **three training cases**, with augmentation off, to implant Dice ≥ 0.90. This is a pipeline sanity check, not a generalization result. Record its Dice, step time, GPU memory, job ID, and artifact location. If it misses 0.90, inspect alignment, labels, loss, and model output before full training.

```bash
python3 ml/cranial/launch_training.py --mode pilot
```

The launcher writes SageMaker's training output under `s3://<bucket>/cranial/training-output/` so it does not try to create an account-default bucket. The AWS role still needs access to write to that existing bucket. The pilot runs with augmentation disabled. The script's printed checkpoint prefix is not proof of where SageMaker placed the final model artifact; record the actual artifact URI from the completed job.

### 4. Full training and freeze

After a passing pilot, run full training with a measured runtime budget. The configured maximum is 50 epochs with early stopping; the job has a separate wall-clock cap. Check the per-epoch `metrics.jsonl` and pick `best.pt` by **validation** Dice. Save the checkpoint, run config, dependency versions, split hash, and job metadata together.

```bash
python3 ml/cranial/launch_training.py --mode full
```

Review `freeze_candidate.json`, verify that its checkpoint hash matches the chosen `best.pt`, and write `manifests/freeze_v1.json` with `frozen: true`. Freeze the checkpoint, threshold, and preprocessing/postprocessing settings before opening test metrics. Do not assume the candidate file is sufficient just because training finished.

### 5. Evaluate and report

Once the freeze exists, run evaluation with the same local checkpoint and freeze file:

```bash
python3 ml/cranial/evaluate.py \
  --checkpoint ml/cranial/checkpoints/best.pt \
  --freeze ml/cranial/manifests/freeze_v1.json \
  --split test \
  --manifest ml/cranial/manifests/split_v1.csv \
  --report-dir ml/cranial/reports/eval_v1
```

Read `reports/eval_v1/per_case_test.csv` and `summary_test.json`, including failed cases and baseline scores. The [spec](../../features/ml-model/spec.md) calls for separate MUG500+ B domain-shift results; if those cases are unavailable, state "not run" and why. Report model scores as research/demo evidence, not clinical validation.

## Boundaries to keep intact

- Never move variants of one source subject across train, validation, and test.
- Do not train on the official test partition or the reserved MUG500+ B cohort.
- Do not overwrite a processed S3 version used by a training run. Change the version in the config and update the upload/launch paths together before reprocessing.
- The audit checks binary values and spacing but does not establish clinical correctness or prove the model works. Inspect overlays and measure held-out predictions.
- If test results lead to a code or threshold change, those cases have become development data; do not keep calling the resulting score held out.
