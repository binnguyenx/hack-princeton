"""
predict.py — Inference and source-coordinate reconstruction
============================================================
Takes a defective-skull NRRD, checkpoint, and freeze file, runs the model,
inverts the preprocessing back into original patient coordinates,
enforces non-overlap with input bone, and writes the candidate NRRD.

Used directly from CLI or as an import by evaluate.py / follow-on services.

Usage:
    python ml/cranial/predict.py \\
        --input path/to/defect.nrrd \\
        --checkpoint ml/cranial/checkpoints/best.pt \\
        --freeze ml/cranial/manifests/freeze_v1.json \\
        --output-dir ml/cranial/output/predictions
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import SimpleITK as sitk
import torch
import torch.nn as nn

# Local imports
from prepare_data import lps_to_ras, resample_to_spacing, pad_to_shape, image_meta
from train import build_model

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)


# ---------------------------------------------------------------------------
# Checkpoint & Freeze verification (R9, R16)
# ---------------------------------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def verify_freeze(checkpoint_path: Path, freeze_path: Path) -> dict:
    """Validate that checkpoint hash matches the freeze specification."""
    if not freeze_path.exists():
        raise FileNotFoundError(f"Freeze file missing: {freeze_path}")
    with open(freeze_path) as f:
        freeze_data = json.load(f)

    actual_hash = sha256_file(checkpoint_path)
    expected_hash = freeze_data.get("checkpoint_hash", "")

    if not expected_hash or actual_hash != expected_hash:
        raise ValueError(
            f"Checkpoint SHA256 mismatch!\n"
            f"  Expected: {expected_hash}\n"
            f"  Actual:   {actual_hash}"
        )

    pp = freeze_data.get("preprocessing")
    if not isinstance(pp, dict) or set(pp) != {"target_spacing", "target_shape", "convert_to_ras"}:
        raise ValueError("Freeze requires explicit preprocessing spacing, shape, and axis setting")
    if (len(pp["target_spacing"]) != 3 or len(pp["target_shape"]) != 3
            or not np.isfinite(pp["target_spacing"]).all()
            or any(s <= 0 for s in pp["target_spacing"])
            or any(not isinstance(s, int) or s <= 0 for s in pp["target_shape"])
            or not isinstance(pp["convert_to_ras"], bool)):
        raise ValueError("Invalid preprocessing settings")
    threshold = freeze_data.get("threshold")
    if not isinstance(threshold, (int, float)) or not 0 < threshold < 1:
        raise ValueError("Freeze threshold must be between zero and one")
    if freeze_data.get("postprocessing") != {"exclude_source_bone": True, "reject_empty": True}:
        raise ValueError("Freeze must specify supported postprocessing settings")
    log.info(f"Freeze verified: {freeze_path.name} (hash={actual_hash[:16]}...)")
    return freeze_data


def load_inference_model(
    checkpoint_path: Path,
    device: torch.device,
) -> nn.Module:
    """Load trained model weights for inference."""
    model = build_model(device)
    ckpt = torch.load(str(checkpoint_path), map_location=device)
    state_dict = ckpt.get("model_state_dict", ckpt)
    model.load_state_dict(state_dict)
    model.eval()
    return model


# ---------------------------------------------------------------------------
# Preprocessing for Inference
# ---------------------------------------------------------------------------

def preprocess_for_inference(
    defect_img: sitk.Image,
    target_spacing=(1.0, 1.0, 1.0),
    target_shape=(256, 256, 256),
    convert_to_ras: bool = False,
) -> Tuple[sitk.Image, dict]:
    """
    Standardize incoming skull NRRD into 256³ canonical space.
    Returns (padded_image, inv_params).
    """
    orig_shape, orig_spacing, orig_origin, orig_direction = image_meta(defect_img)

    if convert_to_ras:
        img_ras = lps_to_ras(defect_img)
    else:
        img_ras = defect_img

    resampled = resample_to_spacing(img_ras, list(target_spacing), sitk.sitkNearestNeighbor)
    padded, pad_offset = pad_to_shape(resampled, list(target_shape), reject_oversized=True)

    inv_params = {
        "orig_shape": orig_shape,
        "orig_spacing": orig_spacing,
        "orig_origin": orig_origin,
        "orig_direction": orig_direction,
        "converted_to_ras": convert_to_ras,
        "target_spacing": list(target_spacing),
        "resampled_size": list(resampled.GetSize()),
        "resampled_origin": list(resampled.GetOrigin()),
        "resampled_direction": list(resampled.GetDirection()),
        "pad_offset": pad_offset,
    }
    return padded, inv_params


# ---------------------------------------------------------------------------
# Prediction & Inverse Transform
# ---------------------------------------------------------------------------

@torch.no_grad()
def run_forward(
    model: nn.Module,
    input_tensor: torch.Tensor,
    device: torch.device,
) -> np.ndarray:
    """
    Run forward pass.
    input_tensor: [1, 1, 256, 256, 256]
    Returns 3D probability array: [256, 256, 256] (numpy float32, [z, y, x])
    """
    input_tensor = input_tensor.to(device)
    logits = model(input_tensor)
    if logits.shape != input_tensor.shape:
        raise ValueError(f"Prediction shape {tuple(logits.shape)} differs from input {tuple(input_tensor.shape)}")
    if not torch.isfinite(logits).all():
        raise ValueError("Prediction contains non-finite logits")
    probs = torch.sigmoid(logits).squeeze(0).squeeze(0)  # [D, H, W]
    return probs.cpu().numpy().astype(np.float32)


def invert_to_source_grid(
    prob_arr: np.ndarray,
    inv_params: dict,
    threshold: float = 0.5,
) -> sitk.Image:
    """
    Map the 256³ prediction scores back to original source patient coordinates:
      1. Crop away zero-padding to return to resampled bounding size.
      2. Construct SimpleITK image with intermediate resampled spatial info.
      3. Resample continuously (linear) onto original source spacing and orientation.
      4. If LPS/RAS conversion was performed, invert it.
      5. Apply threshold to produce binary candidate mask.
    """
    pad_offset = inv_params["pad_offset"]  # [ox, oy, oz] in (x, y, z)
    res_size   = inv_params["resampled_size"]

    ox, oy, oz = pad_offset
    rx, ry, rz = res_size

    # prob_arr has numpy shape [z, y, x]
    unpadded_arr = prob_arr[oz : oz + rz, oy : oy + ry, ox : ox + rx]

    # Build intermediate SimpleITK image
    intermediate_img = sitk.GetImageFromArray(unpadded_arr)
    intermediate_img.SetSpacing(inv_params["target_spacing"])
    intermediate_img.SetOrigin(inv_params["resampled_origin"])
    intermediate_img.SetDirection(inv_params["resampled_direction"])

    # If RAS was used, invert the flip back to LPS before resampling to source frame
    if inv_params.get("converted_to_ras", False):
        intermediate_img = lps_to_ras(intermediate_img)

    # Resample back to original source grid (linear interpolation for continuous probabilities)
    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(inv_params["orig_shape"])
    resampler.SetOutputSpacing(inv_params["orig_spacing"])
    resampler.SetOutputOrigin(inv_params["orig_origin"])
    resampler.SetOutputDirection(inv_params["orig_direction"])
    resampler.SetInterpolator(sitk.sitkLinear)
    resampler.SetDefaultPixelValue(0.0)

    source_prob_img = resampler.Execute(intermediate_img)
    source_prob_arr = sitk.GetArrayFromImage(source_prob_img)

    # Threshold to binary candidate
    binary_arr = (source_prob_arr >= threshold).astype(np.uint8)

    candidate_img = sitk.GetImageFromArray(binary_arr)
    candidate_img.CopyInformation(source_prob_img)
    return candidate_img


def clean_candidate(
    candidate_img: sitk.Image,
    defect_img: sitk.Image,
) -> Tuple[sitk.Image, dict]:
    """
    Post-processing constraints (R16):
      - Exclude voxels where defect bone exists (zero overlap with source skull).
      - Check for empty result.
    """
    cand_arr = sitk.GetArrayFromImage(candidate_img).astype(np.uint8)
    def_arr  = sitk.GetArrayFromImage(defect_img).astype(np.uint8)

    # Subtract any overlapping source bone
    overlap_voxels = int(np.logical_and(cand_arr, def_arr).sum())
    if overlap_voxels > 0:
        cand_arr[def_arr > 0] = 0

    total_voxels = int(cand_arr.sum())
    is_empty = (total_voxels == 0)

    cleaned_img = sitk.GetImageFromArray(cand_arr)
    cleaned_img.CopyInformation(defect_img)

    meta = {
        "candidate_voxels": total_voxels,
        "removed_overlap_voxels": overlap_voxels,
        "is_empty": is_empty,
    }
    return cleaned_img, meta


# ---------------------------------------------------------------------------
# High-Level Predict Function
# ---------------------------------------------------------------------------

def predict_single(
    defect_path: Path,
    model: nn.Module,
    device: torch.device,
    threshold: float = 0.5,
    convert_to_ras: bool = False,
    preprocessing: Optional[dict] = None,
) -> Tuple[sitk.Image, dict]:
    """
    End-to-end inference for one defective skull NRRD:
      Defect NRRD -> Preprocess -> U-Net -> Invert Grid -> Clean -> Candidate NRRD
    """
    defect_img = sitk.ReadImage(str(defect_path))

    # Preprocess
    preprocessing = preprocessing or {
        "target_spacing": [1.0, 1.0, 1.0], "target_shape": [256, 256, 256],
        "convert_to_ras": convert_to_ras,
    }
    padded_img, inv_params = preprocess_for_inference(defect_img, **preprocessing)

    arr = sitk.GetArrayFromImage(padded_img).astype(np.float32)
    tensor = torch.from_numpy(arr).unsqueeze(0).unsqueeze(0)  # [1, 1, 256, 256, 256]

    # Predict
    prob_arr = run_forward(model, tensor, device)

    # Invert to source space
    raw_cand_img = invert_to_source_grid(prob_arr, inv_params, threshold=threshold)

    # Post-process
    clean_cand_img, clean_meta = clean_candidate(raw_cand_img, defect_img)
    if clean_meta["is_empty"]:
        raise ValueError("Prediction is empty after excluding source bone")

    metadata = {
        "input_file": str(defect_path),
        "input_checksum": sha256_file(defect_path),
        "threshold": threshold,
        "preprocessing": preprocessing,
        **clean_meta,
    }
    return clean_cand_img, metadata


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Predict missing cranial bone implant mask")
    parser.add_argument("--input", required=True, help="Path to defective skull NRRD")
    parser.add_argument("--checkpoint", required=True, help="Path to best.pt")
    parser.add_argument("--freeze", required=True, help="Path to freeze_v1.json")
    parser.add_argument("--output-dir", default="ml/cranial/output/predictions", help="Directory to save output")
    parser.add_argument("--threshold", type=float, default=None, help="Threshold override")
    args = parser.parse_args()

    input_path = Path(args.input)
    ckpt_path = Path(args.checkpoint)
    freeze_path = Path(args.freeze)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Verify freeze config
    freeze_cfg = verify_freeze(ckpt_path, freeze_path)
    if not freeze_cfg.get("frozen", False):
        raise ValueError("Prediction requires a reviewed freeze with frozen=true")
    threshold = args.threshold if args.threshold is not None else freeze_cfg.get("threshold", 0.5)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log.info(f"Loading checkpoint {ckpt_path} on {device}...")
    model = load_inference_model(ckpt_path, device)

    log.info(f"Running prediction on {input_path.name}...")
    cand_img, meta = predict_single(
        input_path, model, device, threshold=threshold, preprocessing=freeze_cfg["preprocessing"]
    )
    meta["checkpoint_hash"] = freeze_cfg["checkpoint_hash"]

    out_name = input_path.stem.replace("_defective", "").replace("_defect", "") + "_candidate.nrrd"
    out_path = out_dir / out_name
    meta_path = out_dir / (out_path.stem + "_meta.json")

    sitk.WriteImage(cand_img, str(out_path))
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    log.info(f"Candidate written: {out_path} ({meta['candidate_voxels']} voxels)")
    if meta["is_empty"]:
        log.warning("WARNING: Candidate prediction is EMPTY!")


if __name__ == "__main__":
    main()
