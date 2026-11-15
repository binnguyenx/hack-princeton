"""
launch_training.py — Submit a SageMaker Training Job from your laptop or Studio
=================================================================================
Run this locally (not inside a training container):

    python ml/cranial/launch_training.py --mode pilot
    python ml/cranial/launch_training.py --mode full
    python ml/cranial/launch_training.py --mode full --spot

Requirements:
    pip install sagemaker boto3

Your AWS credentials must be configured:
    aws configure  (or use an IAM role if running in Studio/EC2)

No credentials in this file. Use env vars, ~/.aws/credentials, or IAM roles.
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from pathlib import Path

import boto3
import sagemaker
from sagemaker.pytorch import PyTorch

log = logging.getLogger(__name__)

# Ensure .env is loaded
try:
    from dotenv import load_dotenv, find_dotenv
    env_file = find_dotenv(filename=".env", usecwd=True)
    if not env_file:
        env_file = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_file)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Configuration — edit these for your account
# ---------------------------------------------------------------------------

# S3 paths (set via env vars or edit below)
S3_BUCKET  = os.environ.get("S3_BUCKET", "")           # e.g. "my-hackathon-bucket"
S3_PREFIX  = os.environ.get("S3_PREFIX", "cranial")

# IAM role with SageMaker + S3 permissions
SAGEMAKER_ROLE = os.environ.get("SAGEMAKER_ROLE", "")  # full ARN

# Instance choice — ml.g5.2xlarge: 1x A10G 24GB, $1.515/hr on-demand
# Use g5.4xlarge ($2.03/hr) if you need more CPU RAM for data loading
INSTANCE_TYPE = "ml.g5.2xlarge"

# How long to let the job run before SageMaker kills it (seconds)
# Pilot: 20 min | Full training: 4 hrs (buffer above the 3-hr target)
MAX_RUN_PILOT = 20 * 60
MAX_RUN_FULL  = 60 * 60


def assert_config() -> None:
    missing = []
    if not S3_BUCKET:
        missing.append("S3_BUCKET (env var or edit launch_training.py)")
    if not SAGEMAKER_ROLE:
        missing.append("SAGEMAKER_ROLE (env var or edit launch_training.py)")
    if missing:
        raise RuntimeError(
            "Missing required config:\n" + "\n".join(f"  - {m}" for m in missing)
        )


def s3_path(*parts: str) -> str:
    return "s3://" + S3_BUCKET + "/" + "/".join(p.strip("/") for p in parts)


# ---------------------------------------------------------------------------
# Job definitions
# ---------------------------------------------------------------------------

def make_estimator(
    run_id: str,
    hyperparameters: dict,
    max_run: int,
    use_spot: bool,
) -> PyTorch:

    checkpoint_s3 = s3_path(S3_PREFIX, "checkpoints", run_id)

    kwargs = dict(
        entry_point="train.py",
        source_dir=str(Path(__file__).parent),   # ml/cranial/
        role=SAGEMAKER_ROLE,
        instance_type=INSTANCE_TYPE,
        instance_count=1,
        output_path=s3_path(S3_PREFIX, "training-output"),
        framework_version="2.1.0",
        py_version="py310",
        hyperparameters=hyperparameters,
        max_run=max_run,
        checkpoint_s3_uri=checkpoint_s3,
        checkpoint_local_path="/opt/ml/checkpoints",
        # Dependencies installed inside the container from requirements.txt
        # SageMaker auto-installs requirements.txt if it's in source_dir
    )

    if use_spot:
        kwargs["use_spot_instances"] = True
        kwargs["max_wait"] = max_run + 60 * 60   # max_wait must be >= max_run

    return PyTorch(**kwargs)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Launch SageMaker training job")
    parser.add_argument(
        "--mode", choices=["pilot", "full"], required=True,
        help="pilot: overfit 3 cases (confirms pipeline works) | full: full training run"
    )
    parser.add_argument("--spot", action="store_true", help="Use Spot instances (saves ~70%% but may be interrupted)")
    parser.add_argument("--run-id", default="", help="Run identifier (default: auto timestamp)")
    parser.add_argument("--epochs", type=int, default=0, help="Override epoch count")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate for full training (default: 2e-4)")
    parser.add_argument(
        "--pilot-lr", type=float, default=0.001,
        help="Learning rate for the pilot (default 0.001; 0.005 NaN'd under AMP, 0.0005 stalled)",
    )
    parser.add_argument(
        "--pilot-amp", action="store_true",
        help="Enable AMP during pilot (default: off)",
    )
    parser.add_argument(
        "--pilot-patience", type=int, default=40,
        help="Stop pilot if best Dice does not improve for this many epochs",
    )
    parser.add_argument(
        "--no-amp", action="store_true",
        help="Disable AMP for the full training loop (needed with lr≈0.005; pilot AMP stays separate)",
    )
    parser.add_argument("--skip-pilot", action="store_true", help="Skip the pilot overfit check in full mode")
    args = parser.parse_args()

    assert_config()

    run_id = args.run_id or f"run_{int(time.time())}"
    session = sagemaker.Session()

    # -- Pilot mode: overfit 3 cases, aug off, confirms the whole pipeline works --
    if args.mode == "pilot":
        hp = {
            "pilot": True,
            "pilot-cases": 3,
            "pilot-epochs": 200,
            "pilot-lr": args.pilot_lr,
            "pilot-target-dice": 0.90,
            "pilot-patience": args.pilot_patience,
            "pilot-amp": args.pilot_amp,
            "loss": "dice",
            "no-aug": True,
            "no-amp": args.no_amp,
            "epochs": 0,     # stop after the pilot
            "seed": 42,
        }
        max_run = MAX_RUN_PILOT
        print(f"\n[PILOT] run_id={run_id}")
        print(f"  Instance:     {INSTANCE_TYPE}")
        print(f"  Max runtime:  {max_run // 60} minutes")
        print(f"  pilot-lr:     {args.pilot_lr}")
        print(f"  pilot-amp:    {args.pilot_amp}")
        print(f"  no-amp:       {args.no_amp}")
        print(f"  patience:     {args.pilot_patience}")
        print(f"  Checkpoints:  {s3_path(S3_PREFIX, 'checkpoints', run_id)}")
        print(f"  Spot:         {args.spot}")

    # -- Full training run --
    else:
        n_epochs = args.epochs if args.epochs > 0 else 50
        run_pilot_check = not args.skip_pilot
        hp = {
            "epochs": n_epochs,
            "lr": args.lr,
            "weight-decay": 1e-5,
            "batch-size": 1,
            "seed": 42,
            "threshold": 0.5,
            "early-stop-patience": 15,
            "loss": "dice",
            # Run pilot overfit check first, then continue to full training
            "pilot": run_pilot_check,
            "pilot-cases": 3,
            "pilot-epochs": 200,
            "pilot-lr": args.pilot_lr,
            "pilot-target-dice": 0.90,
            "pilot-patience": args.pilot_patience,
            "pilot-amp": args.pilot_amp,
            "no-aug": False,
            "no-amp": args.no_amp,
        }
        max_run = MAX_RUN_FULL
        print(f"\n[FULL TRAINING] run_id={run_id}")
        print(f"  Instance:     {INSTANCE_TYPE}  (~$1.52/hr)")
        print(f"  Epochs:       {n_epochs} (early stop patience=15)")
        print(f"  Pilot check:  {run_pilot_check}")
        print(f"  no-amp:       {args.no_amp}")
        print(f"  Max runtime:  {max_run // 3600} hours")
        print(f"  Checkpoints:  {s3_path(S3_PREFIX, 'checkpoints', run_id)}")
        print(f"  Spot:         {args.spot}")

    estimator = make_estimator(run_id, hp, max_run, use_spot=args.spot)

    # Data channels — SageMaker copies these from S3 before the job starts.
    # Bump PROCESSED_VERSION if you rerun prepare_data.py with new settings.
    # This ensures a new training run is always traceable to the exact processed cache it used.
    # Default v2 = 128³ cache after 256³ pilots stalled. Override with PROCESSED_VERSION=v1 if needed.
    PROCESSED_VERSION = os.environ.get("PROCESSED_VERSION", "v2")
    data_channels = {
        "training":   s3_path(S3_PREFIX, "processed", PROCESSED_VERSION, "train"),
        "validation": s3_path(S3_PREFIX, "processed", PROCESSED_VERSION, "val"),
    }
    log.info(f"  Processed version: {PROCESSED_VERSION}")

    print(f"\n  Processed ver:   {PROCESSED_VERSION}")
    print(f"  Training data:   {data_channels['training']}")
    print(f"  Validation data: {data_channels['validation']}")
    print(f"\nSubmitting job... (this takes ~2 min to provision the instance)")

    estimator.fit(
        inputs=data_channels,
        job_name=f"cranial-{args.mode}-{run_id}".replace("_", "-"),
        wait=True,          # stream logs to your terminal; set False to submit and return
        logs="All",
    )

    print(f"\nJob complete. Artifacts at: {s3_path(S3_PREFIX, 'checkpoints', run_id)}")
    print(
        f"\nNext steps:\n"
        f"  1. Download best.pt:\n"
        f"     aws s3 cp {s3_path(S3_PREFIX, 'checkpoints', run_id, 'best.pt')} ml/cranial/checkpoints/\n"
        f"  2. Review freeze_candidate.json and set frozen=true\n"
        f"  3. Run evaluate.py on the test split"
    )


if __name__ == "__main__":
    main()
