"""
train.py — SageMaker entry point for cranial reconstruction U-Net training
==========================================================================
Run this as a SageMaker PyTorch Training Job (see launch_training.py).
Can also run locally: python ml/cranial/train.py --data-dir ... --val-dir ...

SageMaker injects these environment variables automatically:
  SM_CHANNEL_TRAINING   → path to training NRRDs
  SM_CHANNEL_VALIDATION → path to validation NRRDs
  SM_MODEL_DIR          → where to save checkpoints (copied to S3 after job ends)
  SM_OUTPUT_DATA_DIR    → extra outputs (logs, metrics, non-model artifacts)

Hyperparameters are passed as CLI args by SageMaker (--epochs, --lr, etc.)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import random
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.cuda.amp import GradScaler, autocast
from torch.utils.data import DataLoader, Dataset

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)


# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------

def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class SkullDataset(Dataset):
    """
    Reads preprocessed defect/implant NRRD pairs from a directory.
    Expects files named: <subject_id>_<category>_defect.nrrd
                     and  <subject_id>_<category>_implant.nrrd

    Returns tensors of shape [1, D, H, W] (single channel, uint8→float32).
    """

    def __init__(self, data_dir: str, augment: bool = False, seed: int = 42):
        try:
            import SimpleITK as sitk
        except ImportError:
            raise ImportError("SimpleITK is required. pip install SimpleITK==2.3.1")

        self.sitk = sitk
        self.augment = augment
        self.data_dir = Path(data_dir)

        # Discover pairs
        defect_files = sorted(self.data_dir.glob("*_defect.nrrd"))
        self.pairs: List[Tuple[Path, Path]] = []
        for d in defect_files:
            impl = d.parent / d.name.replace("_defect.nrrd", "_implant.nrrd")
            if impl.exists():
                self.pairs.append((d, impl))
            else:
                log.warning(f"No implant found for {d.name}, skipping")

        log.info(f"Dataset: {len(self.pairs)} pairs in {data_dir}")
        if len(self.pairs) == 0:
            raise RuntimeError(f"No defect/implant NRRD pairs found in {data_dir}")

        self.preprocessing = None
        for defect, _ in self.pairs:
            meta_path = defect.with_name(defect.name.replace("_defect.nrrd", "_meta.json"))
            meta = json.loads(meta_path.read_text())
            preprocessing = {
                "target_spacing": meta["processed_spacing"],
                "target_shape": meta["final_shape"],
                "convert_to_ras": meta["reindexed_axes_ras"],
            }
            if self.preprocessing is not None and preprocessing != self.preprocessing:
                raise ValueError(f"Mixed preprocessing settings in {data_dir}")
            self.preprocessing = preprocessing

        # MONAI augmentation transforms (lazy import)
        if augment:
            self._aug = self._build_augmentation(seed)
        else:
            self._aug = None

    def _build_augmentation(self, seed: int):
        try:
            from monai.transforms import (
                Compose, RandAffined, RandFlipd, RandGaussianNoised,
                ToTensord,
            )
        except ImportError:
            log.warning("MONAI not available — augmentation disabled")
            return None

        return Compose([
            RandAffined(
                keys=["defect", "implant"],
                prob=0.8,
                rotate_range=(0.15, 0.15, 0.15),   # ~8.5 degrees
                translate_range=(8, 8, 8),           # voxels
                scale_range=(0.1, 0.1, 0.1),
                mode=("nearest", "nearest"),          # binary masks → nearest
                padding_mode="zeros",
            ),
            RandFlipd(
                keys=["defect", "implant"],
                spatial_axis=0,
                prob=0.5,
            ),
        ])

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        d_path, i_path = self.pairs[idx]

        d_img = self.sitk.ReadImage(str(d_path))
        i_img = self.sitk.ReadImage(str(i_path))

        import SimpleITK as sitk
        # sitk array is [z, y, x]; add channel dim → [1, z, y, x]
        d_arr = sitk.GetArrayFromImage(d_img).astype(np.float32)
        i_arr = sitk.GetArrayFromImage(i_img).astype(np.float32)

        d_tensor = torch.from_numpy(d_arr).unsqueeze(0)  # [1, D, H, W]
        i_tensor = torch.from_numpy(i_arr).unsqueeze(0)

        sample = {"defect": d_tensor, "implant": i_tensor}

        if self._aug is not None:
            sample = self._aug(sample)

        return sample


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

def build_model(device: torch.device) -> nn.Module:
    """
    Small 3D U-Net via MONAI.
    Channels: 16, 32, 64, 128, 256 (5 levels, 4 downsamples)
    Input:  [B, 1, 256, 256, 256] — defective skull mask
    Output: [B, 1, 256, 256, 256] — logit per voxel for missing bone
    """
    try:
        from monai.networks.nets import UNet
        from monai.networks.layers import Norm
    except ImportError:
        raise ImportError("MONAI is required. pip install monai==1.3.0")

    model = UNet(
        spatial_dims=3,
        in_channels=1,
        out_channels=1,
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
        norm=Norm.INSTANCE,     # instance norm works with batch size 1
    )
    return model.to(device)


# ---------------------------------------------------------------------------
# Loss
# ---------------------------------------------------------------------------

def build_loss(loss_type: str = "dice"):
    """
    Build loss function.
    Defaults to pure soft Dice loss ('dice'). Compute loss in float32 so large
    volume reductions and sigmoid gradients do not depend on half precision.
    Convergence must still be verified by the pilot.
    """
    try:
        from monai.losses import DiceLoss, DiceFocalLoss
    except ImportError:
        raise ImportError("MONAI is required for Dice losses")

    dice_loss = DiceLoss(
        sigmoid=True,       # applies sigmoid internally
        smooth_nr=1e-5,
        smooth_dr=1e-5,
        squared_pred=False, # linear denominator prevents gradient vanishing on small targets
        reduction="mean",
    )
    if loss_type == "dice":
        selected_loss = dice_loss
    elif loss_type == "dice_focal":
        selected_loss = DiceFocalLoss(sigmoid=True, squared_pred=False)
    elif loss_type == "dice_bce":
        bce_loss = nn.BCEWithLogitsLoss()
        selected_loss = lambda lg, tg: 0.5 * dice_loss(lg, tg) + 0.5 * bce_loss(lg, tg)
    else:
        raise ValueError(f"Unknown loss type: {loss_type}")

    def loss_fn(logits, targets):
        with autocast(enabled=False):
            return selected_loss(logits.float(), targets.float())

    return loss_fn


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@torch.no_grad()
def compute_implant_dice(
    logits: torch.Tensor,
    targets: torch.Tensor,
    threshold: float = 0.5,
) -> float:
    """Binary Dice on the implant (missing bone) region only."""
    preds = (torch.sigmoid(logits) > threshold).float()
    tgts  = (targets > 0.5).float()

    intersection = (preds * tgts).sum()
    denom = preds.sum() + tgts.sum()

    if denom < 1e-6:
        return 1.0 if intersection < 1e-6 else 0.0  # both empty → 1.0
    return float(2.0 * intersection / denom)


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------

def save_checkpoint(
    path: Path,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    scaler: GradScaler,
    epoch: int,
    best_dice: float,
    cfg: dict,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scaler_state_dict": scaler.state_dict(),
            "best_dice": best_dice,
            "config": cfg,
        },
        str(path),
    )


def load_checkpoint(
    path: Path,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    scaler: GradScaler,
    device: torch.device,
) -> Tuple[int, float]:
    """Returns (start_epoch, best_dice)."""
    ckpt = torch.load(str(path), map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    optimizer.load_state_dict(ckpt["optimizer_state_dict"])
    scaler.load_state_dict(ckpt["scaler_state_dict"])
    log.info(f"Resumed from epoch {ckpt['epoch']} (best dice={ckpt['best_dice']:.4f})")
    return ckpt["epoch"] + 1, ckpt["best_dice"]


def checkpoint_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    loss_fn,
    scaler: GradScaler,
    device: torch.device,
    use_amp: bool,
) -> Dict[str, float]:
    model.train()
    total_loss = 0.0
    n_steps = 0
    step_times = []

    for batch in loader:
        defect  = batch["defect"].to(device)   # [B, 1, D, H, W]
        implant = batch["implant"].to(device)

        t0 = time.time()
        optimizer.zero_grad()

        with autocast(enabled=use_amp):
            logits = model(defect)
            loss   = loss_fn(logits, implant)

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()

        step_time = time.time() - t0
        step_times.append(step_time)
        total_loss += loss.item()
        n_steps += 1

    return {
        "train_loss": total_loss / max(n_steps, 1),
        "mean_step_time_s": float(np.mean(step_times)),
        "peak_gpu_mb": torch.cuda.max_memory_allocated(device) / 1e6 if device.type == "cuda" else 0,
    }


@torch.no_grad()
def validate(
    model: nn.Module,
    loader: DataLoader,
    loss_fn,
    device: torch.device,
    use_amp: bool,
) -> Dict[str, float]:
    model.eval()
    total_loss  = 0.0
    total_dice  = 0.0
    n_steps = 0

    for batch in loader:
        defect  = batch["defect"].to(device)
        implant = batch["implant"].to(device)

        with autocast(enabled=use_amp):
            logits = model(defect)
            loss   = loss_fn(logits, implant)

        total_loss += loss.item()
        total_dice += compute_implant_dice(logits, implant)
        n_steps += 1

    return {
        "val_loss": total_loss / max(n_steps, 1),
        "val_dice": total_dice / max(n_steps, 1),
    }


# ---------------------------------------------------------------------------
# Pilot smoke test (R7: overfit 2-4 cases, Dice ≥ 0.90)
# ---------------------------------------------------------------------------

def make_pilot_loader(train_ds: SkullDataset, n_cases: int) -> DataLoader:
    from torch.utils.data import Subset
    train_ds = SkullDataset(str(train_ds.data_dir), augment=False)
    indices = list(range(min(n_cases, len(train_ds))))
    return DataLoader(Subset(train_ds, indices), batch_size=1, shuffle=False, num_workers=0)


def run_pilot(
    model: nn.Module,
    pilot_loader: DataLoader,
    loss_fn,
    optimizer: torch.optim.Optimizer,
    scaler: GradScaler,
    device: torch.device,
    use_amp: bool,
    max_epochs: int = 50,
    target_dice: float = 0.90,
) -> bool:
    """
    Deliberately overfit a tiny subset to confirm the model and loss work.
    Returns True if Dice ≥ target_dice is reached; False otherwise.
    """
    log.info(f"=== PILOT: overfitting {len(pilot_loader.dataset)} cases for ≤{max_epochs} epochs ===")
    for epoch in range(max_epochs):
        model.train()
        for batch in pilot_loader:
            defect  = batch["defect"].to(device)
            implant = batch["implant"].to(device)
            optimizer.zero_grad()
            with autocast(enabled=use_amp):
                logits = model(defect)
                loss   = loss_fn(logits, implant)
            if not torch.isfinite(logits).all() or not torch.isfinite(loss):
                raise RuntimeError(f"Non-finite pilot logits/loss at epoch {epoch + 1}")
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

        # Evaluate on the same cases
        dice = 0.0
        eval_loss = 0.0
        predicted_voxels = 0
        target_voxels = 0
        max_probability = 0.0
        model.eval()
        with torch.no_grad():
            for batch in pilot_loader:
                defect  = batch["defect"].to(device)
                implant = batch["implant"].to(device)
                with autocast(enabled=use_amp):
                    logits = model(defect)
                if not torch.isfinite(logits).all():
                    raise RuntimeError(f"Non-finite pilot evaluation logits at epoch {epoch + 1}")
                dice += compute_implant_dice(logits, implant)
                eval_loss += loss_fn(logits, implant).item()
                probabilities = torch.sigmoid(logits.float())
                predicted_voxels += int((probabilities > 0.5).sum().item())
                target_voxels += int((implant > 0.5).sum().item())
                max_probability = max(max_probability, probabilities.max().item())
        dice /= len(pilot_loader)

        if epoch == 0 or (epoch + 1) % 10 == 0 or dice >= target_dice:
            log.info(
                f"  Pilot epoch {epoch+1}/{max_epochs}: dice={dice:.4f} "
                f"loss={eval_loss / len(pilot_loader):.6f} "
                f"pred_voxels={predicted_voxels} target_voxels={target_voxels} "
                f"max_probability={max_probability:.6f} amp_scale={scaler.get_scale()}"
            )

        if dice >= target_dice:
            log.info(f"Pilot PASSED: Dice={dice:.4f} ≥ {target_dice} at epoch {epoch+1} ✓")
            return True

    log.error(
        f"Pilot FAILED: Dice={dice:.4f} < {target_dice} after {max_epochs} epochs. "
        "Check label alignment, loss target, gradient flow, and crop completeness."
    )
    return False


# ---------------------------------------------------------------------------
# Run metadata
# ---------------------------------------------------------------------------

def collect_run_meta(cfg: dict) -> dict:
    meta = {
        "config": cfg,
        "python_version": sys.version,
        "platform": sys.platform,
    }
    try:
        import torch, monai
        meta["torch_version"] = torch.__version__
        meta["monai_version"] = monai.__version__
        if torch.cuda.is_available():
            meta["cuda_device"] = torch.cuda.get_device_name(0)
            meta["cuda_version"] = torch.version.cuda
    except Exception:
        pass
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        meta["git_commit"] = result.stdout.strip()
    except Exception:
        meta["git_commit"] = "unknown"
    return meta


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()

    def parse_bool(value: str) -> bool:
        normalized = value.lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
        raise argparse.ArgumentTypeError(f"expected true or false, got {value!r}")


    # Directories (SageMaker injects via SM_CHANNEL_* env vars; CLI overrides for local runs)
    p.add_argument("--data-dir",  default=os.environ.get("SM_CHANNEL_TRAINING",  "data/processed/train"))
    p.add_argument("--val-dir",   default=os.environ.get("SM_CHANNEL_VALIDATION","data/processed/val"))
    p.add_argument("--model-dir", default=("/opt/ml/checkpoints" if "SM_MODEL_DIR" in os.environ else "ml/cranial/checkpoints/run_local"))
    p.add_argument("--output-dir",default=os.environ.get("SM_OUTPUT_DATA_DIR",   "ml/cranial/output"))

    # Hyperparameters
    p.add_argument("--epochs",        type=int,   default=50)
    p.add_argument("--lr",            type=float, default=1e-4)
    p.add_argument("--weight-decay",  type=float, default=1e-5)
    p.add_argument("--batch-size",    type=int,   default=1)
    p.add_argument("--seed",          type=int,   default=42)
    p.add_argument("--threshold",     type=float, default=0.5)
    p.add_argument("--early-stop-patience", type=int, default=15)
    p.add_argument("--no-amp",        action="store_true", help="Disable mixed precision")
    p.add_argument("--no-aug",        nargs="?", const=True, default=False, type=parse_bool,
                   help="Disable augmentation (use for pilot)")
    p.add_argument("--loss",          default="dice", choices=["dice", "dice_bce", "dice_focal"],
                   help="Loss function (default: dice)")

    # Pilot mode
    p.add_argument("--pilot",         nargs="?", const=True, default=False, type=parse_bool,
                   help="Run pilot overfit test only (3 cases, aug off) before full training")
    p.add_argument("--pilot-cases",   type=int, default=3,
                   help="Number of cases to use for the pilot overfit test")
    p.add_argument("--pilot-epochs",  type=int, default=200)
    p.add_argument("--pilot-lr",      type=float, default=5e-3,
                   help="Learning rate for pilot overfit test")
    p.add_argument("--pilot-target-dice", type=float, default=0.90)

    # Resume
    p.add_argument("--resume", default="", help="Path to latest.pt checkpoint to resume from")

    return p.parse_args()


def main() -> None:
    started = time.monotonic()
    args = parse_args()
    set_seed(args.seed)

    cfg = vars(args)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = not args.no_amp and device.type == "cuda"

    log.info(f"Device: {device}")
    log.info(f"AMP: {use_amp}")
    log.info(f"Config: {json.dumps(cfg, indent=2)}")

    model_dir  = Path(args.model_dir)
    output_dir = Path(args.output_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = model_dir / "metrics.jsonl"

    # -- Save run metadata --
    run_meta = collect_run_meta(cfg)
    with open(model_dir / "run_meta.json", "w") as f:
        json.dump(run_meta, f, indent=2)
    log.info(f"Git commit: {run_meta.get('git_commit','unknown')}")

    # -- Build model, optimizer, loss --
    model     = build_model(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scaler    = GradScaler(enabled=use_amp)
    loss_fn   = build_loss(args.loss)

    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log.info(f"Model parameters: {n_params:,}")

    # -- Datasets --
    augment_train = not args.no_aug
    train_ds = SkullDataset(args.data_dir,  augment=augment_train, seed=args.seed)
    val_ds   = SkullDataset(args.val_dir,   augment=False,         seed=args.seed)
    if train_ds.preprocessing != val_ds.preprocessing:
        raise ValueError("Training and validation preprocessing settings differ")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=4, pin_memory=(device.type == "cuda"))
    val_loader   = DataLoader(val_ds,   batch_size=1,              shuffle=False,
                              num_workers=2, pin_memory=(device.type == "cuda"))

    # -- Pilot overfit test (R7) --
    if args.pilot:
        # Take a small subset of training cases for the pilot
        pilot_loader = make_pilot_loader(train_ds, args.pilot_cases)

        # Fresh model + optimizer for pilot (don't pollute main training state)
        pilot_model  = build_model(device)
        pilot_opt    = torch.optim.AdamW(pilot_model.parameters(), lr=args.pilot_lr, weight_decay=args.weight_decay)
        pilot_scaler = GradScaler(enabled=use_amp)

        passed = run_pilot(
            pilot_model, pilot_loader, loss_fn, pilot_opt, pilot_scaler,
            device, use_amp,
            max_epochs=args.pilot_epochs,
            target_dice=args.pilot_target_dice,
        )
        if not passed:
            log.error("Pilot failed — stopping before full training run. Fix the model/data first.")
            sys.exit(2)
        del pilot_model, pilot_opt, pilot_scaler
        if args.epochs == 0:
            log.info("Pilot passed; pilot-only run complete.")
            return
        log.info("Pilot passed. Starting full training run.")

    # -- Resume from checkpoint if specified --
    start_epoch = 0
    best_dice   = -1.0
    best_path   = model_dir / "best.pt"
    latest_path = model_dir / "latest.pt"

    if args.resume and Path(args.resume).exists():
        start_epoch, best_dice = load_checkpoint(
            Path(args.resume), model, optimizer, scaler, device
        )
    elif latest_path.exists():
        log.info(f"Found existing latest.pt — resuming automatically")
        start_epoch, best_dice = load_checkpoint(latest_path, model, optimizer, scaler, device)

    no_improve_count = 0
    log.info(f"Starting training: epochs {start_epoch}→{args.epochs}, "
             f"train={len(train_ds)}, val={len(val_ds)}")

    # -- Training loop --
    for epoch in range(start_epoch, args.epochs):
        if time.monotonic() - started >= 3300:
            log.info("Training time budget reached; retaining saved checkpoints")
            break
        t_epoch = time.time()

        train_metrics = train_one_epoch(
            model, train_loader, optimizer, loss_fn, scaler, device, use_amp
        )
        val_metrics = validate(model, val_loader, loss_fn, device, use_amp)

        epoch_time = time.time() - t_epoch
        val_dice   = val_metrics["val_dice"]

        row = {
            "epoch": epoch,
            "epoch_time_s": round(epoch_time, 1),
            **train_metrics,
            **val_metrics,
        }
        with open(metrics_path, "a") as f:
            f.write(json.dumps(row) + "\n")

        log.info(
            f"Epoch {epoch+1:3d}/{args.epochs} | "
            f"train_loss={train_metrics['train_loss']:.4f} | "
            f"val_loss={val_metrics['val_loss']:.4f} | "
            f"val_dice={val_dice:.4f} | "
            f"step={train_metrics['mean_step_time_s']:.2f}s | "
            f"gpu={train_metrics['peak_gpu_mb']:.0f}MB | "
            f"epoch={epoch_time:.0f}s"
        )


        # Save best if improved
        if val_dice > best_dice:
            best_dice = val_dice
            no_improve_count = 0
            save_checkpoint(best_path, model, optimizer, scaler, epoch, best_dice, cfg)
            log.info(f"  ↑ New best dice: {best_dice:.4f} — saved best.pt")
        else:
            no_improve_count += 1
            log.info(f"  No improvement for {no_improve_count}/{args.early_stop_patience} epochs")

        save_checkpoint(latest_path, model, optimizer, scaler, epoch, best_dice, cfg)

        # Early stopping
        if no_improve_count >= args.early_stop_patience:
            log.info(f"Early stopping at epoch {epoch+1} (patience={args.early_stop_patience})")
            break

    # -- Write freeze candidate file --
    if best_path.exists():
        ckpt_hash = checkpoint_hash(best_path)
        freeze = {
            "checkpoint": str(best_path),
            "checkpoint_hash": ckpt_hash,
            "threshold": args.threshold,
            "preprocessing": train_ds.preprocessing,
            "postprocessing": {"exclude_source_bone": True, "reject_empty": True},
            "git_commit": run_meta.get("git_commit", "unknown"),
            "best_val_dice": best_dice,
            "frozen": False,  # set to True manually after reviewing validation results
            "note": "Review val results before setting frozen=True and running evaluate.py on test split",
        }
        freeze_path = model_dir / "freeze_candidate.json"
        with open(freeze_path, "w") as f:
            json.dump(freeze, f, indent=2)
        log.info(f"Freeze candidate written to {freeze_path}")
        log.info(f"Best checkpoint: {ckpt_hash}")

    log.info(f"Training complete. Best val dice: {best_dice:.4f}")


if __name__ == "__main__":
    main()
