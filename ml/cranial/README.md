# Cranial Reconstruction ML Subsystem

This directory contains the data preparation, training, and evaluation pipeline for predicting missing cranial bone geometry with a 3D model. Start with [WORKFLOW.md](WORKFLOW.md) for the run order, current handoff point, and commands that do not require the AWS CLI.

## Quick Links
- **[Onboarding & Architecture Guide (WORKFLOW.md)](WORKFLOW.md)**: Comprehensive guide on data flow, coordinate math, script descriptions, and execution sequence.
- **[Learning Failure Postmortem & Solution (LEARNING_FAILURE_POSTMORTEM.md)](LEARNING_FAILURE_POSTMORTEM.md)**: Deep dive on the pilot overfit failure (Dice 0.0087), gradient dynamics, and applied fixes.
- **[Feature Spec](../../features/ml-model/spec.md)**: Formal requirements (R1–R18) and success criteria.
- **[Implementation Plan](../../features/ml-model/plan.md)**: Proof table and milestone verification.
- **[Research Reference](../../features/ml-model/cranial_reconstruction_ml_research.md)**: Clinical context, AutoImplant benchmark comparisons, and architectural decisions.

## Script Index

| Script | Purpose |
|---|---|
| `load_skullbreak_s3.py` | Ingests raw archives from Zenodo to S3 and unpacks locally. |
| `prepare_data.py` | Resamples to 1mm, pads to 256³, splits by subject ID, generates `split_v1.csv`. |
| `audit_data.py` | Validates binary masks, asserts zero bone collision, exports slice overlays. |
| `upload_processed.py` | Uploads the already audited processed cache and manifests with boto3; no AWS CLI needed. |
| `train.py` | MONAI 3D U-Net container training script with AMP and early stopping. |
| `launch_training.py` | CLI to launch SageMaker managed jobs on `ml.g5.2xlarge`. |
| `predict.py` | Inverts predictions back to native patient coordinate space. |
| `evaluate.py` | Runs held-out benchmark scoring (Dice, HD95 mm, ASSD) and baseline comparisons. |

The current audit recorded 134 passing cases (91 train, 23 validation, 20 test). Continue at the upload step in **[WORKFLOW.md](WORKFLOW.md)** after reviewing the generated slice overlays.
