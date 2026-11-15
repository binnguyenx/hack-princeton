"""
evaluate.py — Held-out evaluation and baseline comparison in source space
========================================================================
Runs evaluation on the test split or real MUG500+ B external cohort.

Requirements:
  - Refuses to run without a valid freeze file (R9).
  - Evaluates in native source coordinates (R10).
  - Computes Implant Dice, HD95 (mm), ASSD (mm), Boundary Dice (R10).
  - Computes Empty-Patch and Mirror-based baselines (R13).
  - Flags failures without dropping them from denominators (R11).
  - Checks if provisional targets are met: mean Dice >= 0.80, median HD95 <= 5.0mm (R12).
  - Exports orthogonal slice visualizations for failures + min/median/max cases (R14).

Usage:
    python ml/cranial/evaluate.py \\
        --checkpoint ml/cranial/checkpoints/best.pt \\
        --freeze ml/cranial/manifests/freeze_v1.json \\
        --split test \\
        --manifest ml/cranial/manifests/split_v1.csv \\
        --report-dir ml/cranial/reports/eval_v1
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import SimpleITK as sitk
import torch
from scipy.ndimage import (
    binary_dilation,
    binary_erosion,
    center_of_mass,
    distance_transform_edt,
)

# Local imports
from predict import load_inference_model, predict_single, verify_freeze

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)


# ---------------------------------------------------------------------------
# Metric Calculations (in physical mm space)
# ---------------------------------------------------------------------------

def compute_dice(pred_mask: np.ndarray, gt_mask: np.ndarray) -> float:
    """Binary Dice score between 0.0 and 1.0."""
    p = (pred_mask > 0).astype(bool)
    g = (gt_mask > 0).astype(bool)
    inter = np.logical_and(p, g).sum()
    total = p.sum() + g.sum()
    if total == 0:
        return 1.0 if inter == 0 else 0.0
    return float(2.0 * inter / total)


def extract_surface_voxels(mask: np.ndarray) -> np.ndarray:
    """Surface voxels via erosion difference."""
    eroded = binary_erosion(mask)
    return np.logical_xor(mask, eroded)


def compute_surface_distances(
    pred_mask: np.ndarray,
    gt_mask: np.ndarray,
    spacing: Tuple[float, float, float],
) -> Tuple[Optional[float], Optional[float]]:
    """
    Computes symmetric HD95 (mm) and Average Symmetric Surface Distance (ASSD, mm).
    If either mask is empty, returns (None, None).
    """
    p = (pred_mask > 0).astype(bool)
    g = (gt_mask > 0).astype(bool)

    if p.sum() == 0 or g.sum() == 0:
        return None, None

    surf_p = extract_surface_voxels(p)
    surf_g = extract_surface_voxels(g)

    # Euclidean distance transform using physical voxel spacing
    # Note: spacing in SimpleITK is (sx, sy, sz), numpy array is [z, y, x]
    sampling = (spacing[2], spacing[1], spacing[0])

    dt_g = distance_transform_edt(~surf_g, sampling=sampling)
    dt_p = distance_transform_edt(~surf_p, sampling=sampling)

    distances_p_to_g = dt_g[surf_p]
    distances_g_to_p = dt_p[surf_g]

    if len(distances_p_to_g) == 0 or len(distances_g_to_p) == 0:
        return None, None

    all_distances = np.concatenate([distances_p_to_g, distances_g_to_p])
    hd95 = float(np.percentile(all_distances, 95))
    assd = float(np.mean(all_distances))
    return hd95, assd


def compute_boundary_dice(
    pred_mask: np.ndarray,
    gt_mask: np.ndarray,
    spacing: Tuple[float, float, float],
    band_mm: float = 2.0,
) -> float:
    """
    Boundary Dice (project definition):
    Evaluates Dice overlap strictly within a +/- band_mm margin of the defect rim.
    """
    g = (gt_mask > 0).astype(bool)
    if g.sum() == 0:
        return 0.0

    sampling = (spacing[2], spacing[1], spacing[0])
    dt_g = distance_transform_edt(~g, sampling=sampling)
    dt_inside = distance_transform_edt(g, sampling=sampling)

    # Band within band_mm of the GT interface
    band = (dt_g <= band_mm) & (dt_inside <= band_mm)
    return compute_dice(pred_mask & band, gt_mask & band)


# ---------------------------------------------------------------------------
# Baselines (R13)
# ---------------------------------------------------------------------------

def mirror_baseline_prediction(defect_img: sitk.Image) -> sitk.Image:
    """
    Geometric Mirror Baseline on unilateral cases:
    Reflects the intact contralateral skull across the midsagittal plane (X axis),
    then subtracts the defective skull bone to isolate the missing mirrored patch.
    """
    # Flip along X (sagittal mirror)
    flipped = sitk.Flip(defect_img, [True, False, False])

    def_arr = sitk.GetArrayFromImage(defect_img).astype(np.uint8)
    flip_arr = sitk.GetArrayFromImage(flipped).astype(np.uint8)

    # The mirrored bone that isn't present in the defective skull
    mirrored_patch = np.logical_and(flip_arr > 0, def_arr == 0).astype(np.uint8)

    out = sitk.GetImageFromArray(mirrored_patch)
    out.CopyInformation(defect_img)
    return out


# ---------------------------------------------------------------------------
# Visualizations (R14)
# ---------------------------------------------------------------------------

def save_case_overlay(
    defect_img: sitk.Image,
    gt_img: sitk.Image,
    pred_img: sitk.Image,
    out_path: Path,
    title: str,
) -> None:
    """Export 3-view orthogonal slice comparison (Defect, GT in Green, Pred in Red/Yellow)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return

    d_arr = sitk.GetArrayFromImage(defect_img).astype(float)
    g_arr = sitk.GetArrayFromImage(gt_img).astype(float)
    p_arr = sitk.GetArrayFromImage(pred_img).astype(float)

    # Focus slice around GT center of mass
    if g_arr.sum() > 0:
        cz, cy, cx = [int(round(v)) for v in center_of_mass(g_arr)]
    else:
        cz, cy, cx = [s // 2 for s in d_arr.shape]

    cz = min(max(cz, 0), d_arr.shape[0] - 1)
    cy = min(max(cy, 0), d_arr.shape[1] - 1)
    cx = min(max(cx, 0), d_arr.shape[2] - 1)

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    fig.suptitle(title, fontsize=12)

    slices = [
        ("Axial", d_arr[cz, :, :], g_arr[cz, :, :], p_arr[cz, :, :]),
        ("Coronal", d_arr[:, cy, :], g_arr[:, cy, :], p_arr[:, cy, :]),
        ("Sagittal", d_arr[:, :, cx], g_arr[:, :, cx], p_arr[:, :, cx]),
    ]

    for ax, (name, d_sl, g_sl, p_sl) in zip(axes, slices):
        ax.imshow(d_sl, cmap="gray", origin="lower", vmin=0, vmax=1)
        # GT in green
        ax.imshow(np.ma.masked_where(g_sl == 0, g_sl), cmap="Greens", alpha=0.5, origin="lower")
        # Prediction in hot/red
        ax.imshow(np.ma.masked_where(p_sl == 0, p_sl), cmap="autumn", alpha=0.5, origin="lower")
        ax.set_title(name)
        ax.axis("off")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(str(out_path), dpi=100, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------------------
# Core Evaluation Loop
# ---------------------------------------------------------------------------

def evaluate_case(
    defect_path: Path,
    implant_path: Path,
    model: torch.nn.Module,
    device: torch.device,
    threshold: float,
    preprocessing: Optional[dict] = None,
) -> dict:
    """Evaluates Model, Empty Baseline, and Mirror Baseline on a single case in source space."""
    gt_img = sitk.ReadImage(str(implant_path))
    def_img = sitk.ReadImage(str(defect_path))

    gt_arr = sitk.GetArrayFromImage(gt_img).astype(np.uint8)
    spacing = gt_img.GetSpacing()

    # 1. Model Prediction
    cand_img, meta = predict_single(defect_path, model, device, threshold=threshold, preprocessing=preprocessing)
    cand_arr = sitk.GetArrayFromImage(cand_img).astype(np.uint8)

    # Metrics for Model
    dice = compute_dice(cand_arr, gt_arr)
    hd95, assd = compute_surface_distances(cand_arr, gt_arr, spacing)
    b_dice = compute_boundary_dice(cand_arr, gt_arr, spacing)

    is_failure = (cand_arr.sum() == 0) or (hd95 is None) or np.isnan(dice)

    # 2. Empty Baseline
    empty_arr = np.zeros_like(gt_arr)
    empty_dice = compute_dice(empty_arr, gt_arr)  # 0.0

    # 3. Mirror Baseline
    mirror_img = mirror_baseline_prediction(def_img)
    mirror_arr = sitk.GetArrayFromImage(mirror_img).astype(np.uint8)
    mirror_dice = compute_dice(mirror_arr, gt_arr)
    mirror_hd95, _ = compute_surface_distances(mirror_arr, gt_arr, spacing)

    return {
        "model_dice": dice,
        "model_hd95": hd95,
        "model_assd": assd,
        "model_boundary_dice": b_dice,
        "is_failure": is_failure,
        "empty_dice": empty_dice,
        "mirror_dice": mirror_dice,
        "mirror_hd95": mirror_hd95,
        "_cand_img": cand_img,
        "_def_img": def_img,
        "_gt_img": gt_img,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate cranial reconstruction model")
    parser.add_argument("--checkpoint", required=True, help="Path to best.pt")
    parser.add_argument("--freeze", required=True, help="Path to freeze_v1.json (R9)")
    parser.add_argument("--split", default="test", choices=["val", "test", "mug500b"],
                        help="Partition to evaluate")
    parser.add_argument("--manifest", required=True, help="Path to split_v1.csv")
    parser.add_argument("--report-dir", default="ml/cranial/reports/evaluation", help="Output directory")
    args = parser.parse_args()

    ckpt_path = Path(args.checkpoint)
    freeze_path = Path(args.freeze)
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    # R9: Refuse to run without verified freeze file on test/external split
    log.info("Verifying freeze configuration (R9)...")
    freeze_cfg = verify_freeze(ckpt_path, freeze_path)
    if not freeze_cfg.get("frozen", False):
        log.error("FREEZE ERROR: freeze_v1.json has 'frozen': false! Set 'frozen': true before running on held-out test split.")
        sys.exit(1)

    threshold = freeze_cfg.get("threshold", 0.5)

    df_manifest = pd.read_csv(args.manifest)
    target_partition = "test" if args.split == "test" else args.split
    split_df = df_manifest[df_manifest["partition"] == target_partition]

    if split_df.empty:
        log.error(f"No cases found for partition '{target_partition}' in manifest {args.manifest}")
        sys.exit(1)

    log.info(f"Evaluating {len(split_df)} cases on partition='{args.split}'...")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_inference_model(ckpt_path, device)

    results = []
    case_objects = []

    for _, row in split_df.iterrows():
        sid = row["subject_id"]
        cat = row["defect_category"]
        log.info(f"Evaluating: {sid} ({cat})...")

        try:
            case_res = evaluate_case(
                defect_path=Path(row["defect_path"]),
                implant_path=Path(row["implant_path"]),
                model=model,
                device=device,
                threshold=threshold,
                preprocessing=freeze_cfg["preprocessing"],
            )
        except Exception as exc:
            log.error(f"Failed case {sid}: {exc}")
            results.append({"subject_id": sid, "defect_category": cat, "model_dice": 0.0,
                            "model_hd95_mm": float("inf"), "model_assd_mm": float("inf"),
                            "model_boundary_dice": 0.0, "is_failure": True, "error": str(exc),
                            "empty_dice": 0.0, "mirror_dice": None, "mirror_hd95_mm": None})
            continue

        record = {
            "subject_id": sid,
            "defect_category": cat,
            "model_dice": case_res["model_dice"],
            "model_hd95_mm": case_res["model_hd95"],
            "model_assd_mm": case_res["model_assd"],
            "model_boundary_dice": case_res["model_boundary_dice"],
            "is_failure": case_res["is_failure"],
            "empty_dice": case_res["empty_dice"],
            "mirror_dice": case_res["mirror_dice"],
            "mirror_hd95_mm": case_res["mirror_hd95"],
        }
        results.append(record)
        case_objects.append((record, case_res["_def_img"], case_res["_gt_img"], case_res["_cand_img"]))

    res_df = pd.DataFrame(results)

    # Save detailed per-case CSV
    csv_out = report_dir / f"per_case_{args.split}.csv"
    res_df.to_csv(csv_out, index=False)
    log.info(f"Per-case metrics saved: {csv_out}")

    # Summary calculations (Failures stay in denominator per R11)
    total_cases = len(res_df)
    n_failures = res_df["is_failure"].sum()
    mean_dice = float(res_df["model_dice"].mean())

    # Replace None/NaN in HD95 with penalty/max distance for failure reporting
    valid_hd95 = res_df["model_hd95_mm"].fillna(float("inf"))
    median_hd95 = float(valid_hd95.median()) if not valid_hd95.empty else float("nan")

    # Mirror Baseline Summary
    mean_mirror_dice = float(res_df["mirror_dice"].mean())
    median_mirror_hd95 = float(res_df["mirror_hd95_mm"].dropna().median()) if not res_df["mirror_hd95_mm"].dropna().empty else float("nan")

    # Acceptance targets check (R12: Dice >= 0.80, median HD95 <= 5.0mm)
    dice_met = mean_dice >= 0.80
    hd95_met = (not math.isnan(median_hd95)) and (median_hd95 <= 5.0)

    summary = {
        "split": args.split,
        "total_cases": total_cases,
        "n_failures": int(n_failures),
        "mean_implant_dice": mean_dice,
        "median_hd95_mm": median_hd95,
        "mean_mirror_dice": mean_mirror_dice,
        "median_mirror_hd95_mm": median_mirror_hd95,
        "provisional_targets": {
            "mean_dice_target": ">= 0.80",
            "mean_dice_achieved": mean_dice,
            "mean_dice_met": dice_met,
            "median_hd95_target": "<= 5.0 mm",
            "median_hd95_achieved": median_hd95,
            "median_hd95_met": hd95_met,
            "all_targets_met": (dice_met and hd95_met),
        },
        "by_category": res_df.groupby("defect_category")[["model_dice", "model_hd95_mm"]].mean().to_dict(),
    }

    summary_json = report_dir / f"summary_{args.split}.json"
    with open(summary_json, "w") as f:
        # JSON has no infinity: retain failure counts and serialize undefined distances as null.
        def finite_json(value):
            if isinstance(value, dict):
                return {k: finite_json(v) for k, v in value.items()}
            if isinstance(value, float) and not math.isfinite(value):
                return None
            return value
        json.dump(finite_json(summary), f, indent=2, allow_nan=False)
    log.info(f"Summary written: {summary_json}")

    # R14 Visualizations: Min, Median, Max Dice, and all Failures
    log.info("Generating R14 orthogonal slice visual overlays...")
    sorted_cases = sorted(case_objects, key=lambda x: x[0]["model_dice"])
    vis_targets = []

    if len(sorted_cases) > 0:
        vis_targets.append(("lowest_dice", sorted_cases[0]))
        vis_targets.append(("median_dice", sorted_cases[len(sorted_cases) // 2]))
        vis_targets.append(("highest_dice", sorted_cases[-1]))

    for item in sorted_cases:
        if item[0]["is_failure"] and item not in [t[1] for t in vis_targets]:
            vis_targets.append(("failure", item))

    vis_dir = report_dir / "slices"
    for label, (rec, d_img, g_img, p_img) in vis_targets:
        title = f"{rec['subject_id']} ({label}) | Dice: {rec['model_dice']:.3f} | HD95: {rec['model_hd95_mm']}"
        png_path = vis_dir / f"{label}_{rec['subject_id']}.png"
        save_case_overlay(d_img, g_img, p_img, png_path, title)

    log.info("\n" + "=" * 60)
    log.info("EVALUATION COMPLETED")
    log.info(f"  Cases: {total_cases} | Failures: {n_failures}")
    log.info(f"  Mean Implant Dice: {mean_dice:.4f} (Mirror: {mean_mirror_dice:.4f})")
    log.info(f"  Median HD95:       {median_hd95:.2f} mm (Mirror: {median_mirror_hd95:.2f} mm)")
    log.info(f"  Targets Met (Dice>=0.80, HD95<=5mm): {summary['provisional_targets']['all_targets_met']}")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
