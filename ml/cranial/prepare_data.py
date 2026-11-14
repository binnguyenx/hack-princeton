"""
prepare_data.py: Cranial reconstruction data preparation
=========================================================
Reads raw SkullBreak NRRDs, validates them, splits by subject ID,
preprocesses to a canonical 256^3, 1 mm isotropic grid, saves compressed uint8
NRRDs plus a metadata JSON per case, writes a manifest CSV and an audit report,
and optionally uploads to S3.

Usage (from the repo root):
    python3 ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml --round-trip-only
    python3 ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml --dry-run
    python3 ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml

Requires: SimpleITK, numpy, pandas, pyyaml; boto3 and python-dotenv are optional.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import random
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import SimpleITK as sitk
import yaml

try:
    from dotenv import load_dotenv, find_dotenv

    env_file = find_dotenv(filename=".env", usecwd=True)
    if not env_file:
        env_file = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_file)
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class CaseRecord:
    subject_id: str                # namespaced: <train|eval>_<file stem>
    defect_category: str
    source_dataset: str
    partition: str                 # train | val | test | reserved
    defect_path: str
    implant_path: str
    defect_checksum: str
    implant_checksum: str
    raw_shape: List[int]
    raw_spacing: List[float]
    raw_origin: List[float]
    raw_direction: List[float]     # 9 numbers, row-major
    label_source: str              # "synthetic_removed_bone" | "expert_design"
    processed_defect_path: str = ""
    processed_implant_path: str = ""
    processed_meta_path: str = ""
    error: str = ""                # non-empty means the case was rejected


@dataclass
class PreprocessMeta:
    """Saved next to each processed pair. restore_to_source_grid() and predict.py use it."""
    subject_id: str
    source_dataset: str
    defect_category: str
    orig_spacing: List[float]
    orig_origin: List[float]
    orig_direction: List[float]
    orig_shape: List[int]
    reindexed_axes_ras: bool       # array axes re-indexed; physical positions unchanged
    resampled_spacing: List[float]
    pad_offset: List[int]
    final_shape: List[int]
    processed_origin: List[float]
    processed_direction: List[float]
    processed_spacing: List[float]


# ---------------------------------------------------------------------------
# File utilities
# ---------------------------------------------------------------------------

def md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_config(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_nrrd(path: Path) -> sitk.Image:
    if not path.exists():
        raise FileNotFoundError(f"NRRD not found: {path}")
    return sitk.ReadImage(str(path))


def validate_binary_mask(img: sitk.Image, name: str) -> None:
    arr = sitk.GetArrayFromImage(img)
    unique = np.unique(arr)
    if not np.isin(unique, [0, 1]).all():
        raise ValueError(f"{name}: non-binary values found: {unique[:10]}")
    if arr.sum() == 0:
        raise ValueError(f"{name}: mask is entirely empty")


def image_meta(img: sitk.Image) -> Tuple[List[int], List[float], List[float], List[float]]:
    return (
        [int(v) for v in img.GetSize()],
        list(img.GetSpacing()),
        list(img.GetOrigin()),
        list(img.GetDirection()),
    )


def check_same_grid(a: sitk.Image, b: sitk.Image, tol: float = 1e-3) -> None:
    if a.GetSize() != b.GetSize():
        raise ValueError(f"defect and implant sizes differ: {a.GetSize()} vs {b.GetSize()}")
    for name in ("GetSpacing", "GetOrigin", "GetDirection"):
        va, vb = np.array(getattr(a, name)()), np.array(getattr(b, name)())
        if np.abs(va - vb).max() > tol:
            raise ValueError(f"defect and implant {name[3:].lower()} differ")


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def reindex_axes_ras(img: sitk.Image) -> sitk.Image:
    """
    Flip array axes x and y. SimpleITK adjusts origin and direction so every voxel
    keeps its physical position. This changes array order only. It does not change
    the physical coordinate system, so restoring to the source grid needs no inverse.
    Off by default (convert_to_ras: false). Apply at most once.
    """
    f = sitk.FlipImageFilter()
    f.SetFlipAxes([True, True, False])
    return f.Execute(img)


# Backwards-compatible alias for tests and inference scripts
lps_to_ras = reindex_axes_ras


def resample_to_spacing(
    img: sitk.Image, target_spacing: List[float], interpolator: int = sitk.sitkNearestNeighbor
) -> sitk.Image:
    """Nearest-neighbor resample of a binary mask to the target spacing, in physical space."""
    size = [
        int(round(img.GetSize()[i] * img.GetSpacing()[i] / target_spacing[i]))
        for i in range(3)
    ]
    rs = sitk.ResampleImageFilter()
    rs.SetOutputSpacing(target_spacing)
    rs.SetSize(size)
    rs.SetOutputDirection(img.GetDirection())
    rs.SetOutputOrigin(img.GetOrigin())
    rs.SetTransform(sitk.Transform())
    rs.SetDefaultPixelValue(0)
    rs.SetInterpolator(interpolator)
    return rs.Execute(img)


def pad_to_shape(
    img: sitk.Image, target_shape: List[int], reject_oversized: bool = True
) -> Tuple[sitk.Image, List[int]]:
    """Center-pad with zeros. Returns (padded, pad_lower). Physical positions are preserved."""
    size = list(img.GetSize())
    for i, (cur, tgt) in enumerate(zip(size, target_shape)):
        if cur > tgt and reject_oversized:
            raise ValueError(f"Image size {size} exceeds target {target_shape} on axis {i}. Rejecting case.")
    lower = [max(0, (tgt - cur) // 2) for cur, tgt in zip(size, target_shape)]
    upper = [max(0, tgt - cur - lo) for cur, tgt, lo in zip(size, target_shape, lower)]
    pf = sitk.ConstantPadImageFilter()
    pf.SetPadLowerBound([int(v) for v in lower])
    pf.SetPadUpperBound([int(v) for v in upper])
    pf.SetConstant(0)
    return pf.Execute(img), [int(v) for v in lower]


def preprocess_pair(
    defect_img: sitk.Image, implant_img: sitk.Image, cfg: dict
) -> Tuple[sitk.Image, sitk.Image, PreprocessMeta]:
    """All spatial decisions come from the defective skull only."""
    pp = cfg["preprocessing"]
    target_spacing, target_shape = pp["target_spacing"], pp["target_shape"]

    check_same_grid(defect_img, implant_img)
    orig_shape, orig_spacing, orig_origin, orig_direction = image_meta(defect_img)

    reindexed = bool(pp.get("convert_to_ras", False))
    if reindexed:
        defect_img, implant_img = reindex_axes_ras(defect_img), reindex_axes_ras(implant_img)

    defect_rs = resample_to_spacing(defect_img, target_spacing)
    # Put the implant on exactly the defect's resampled grid.
    implant_rs = sitk.Resample(implant_img, defect_rs, sitk.Transform(), sitk.sitkNearestNeighbor, 0)

    defect_pad, pad_offset = pad_to_shape(defect_rs, target_shape, pp.get("reject_oversized", True))
    implant_pad, implant_offset = pad_to_shape(implant_rs, target_shape, pp.get("reject_oversized", True))
    assert pad_offset == implant_offset

    cast = sitk.CastImageFilter()
    cast.SetOutputPixelType(sitk.sitkUInt8)
    defect_out, implant_out = cast.Execute(defect_pad), cast.Execute(implant_pad)

    meta = PreprocessMeta(
        subject_id="", source_dataset="", defect_category="",
        orig_spacing=orig_spacing, orig_origin=orig_origin,
        orig_direction=orig_direction, orig_shape=orig_shape,
        reindexed_axes_ras=reindexed,
        resampled_spacing=list(target_spacing),
        pad_offset=pad_offset,
        final_shape=[int(v) for v in defect_out.GetSize()],
        processed_origin=list(defect_out.GetOrigin()),
        processed_direction=list(defect_out.GetDirection()),
        processed_spacing=list(defect_out.GetSpacing()),
    )
    return defect_out, implant_out, meta


def restore_to_source_grid(img: sitk.Image, meta: dict, interpolator=sitk.sitkNearestNeighbor) -> sitk.Image:
    """
    Put a processed-space image back on the original file's grid (size, spacing,
    origin, direction), using only the saved metadata. Use nearest-neighbor for
    masks and sitkLinear for predicted score volumes (threshold afterwards).
    """
    ref = sitk.Image([int(v) for v in meta["orig_shape"]], sitk.sitkUInt8)
    ref.SetSpacing(meta["orig_spacing"])
    ref.SetOrigin(meta["orig_origin"])
    ref.SetDirection(meta["orig_direction"])
    return sitk.Resample(img, ref, sitk.Transform(), interpolator, 0)


# ---------------------------------------------------------------------------
# Round-trip test (spec R5)
# ---------------------------------------------------------------------------

def _dice(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a > 0, b > 0
    denom = a.sum() + b.sum()
    return 1.0 if denom == 0 else float(2 * (a & b).sum() / denom)


def round_trip_test(defect_path: Path, cfg: dict, tolerance_mm: float = 0.01) -> bool:
    """
    Checks the saved files, not just the in-memory image:
      1. Three landmarks are mapped to the processed image's continuous index, then
         back to physical space with numpy using only the saved metadata JSON.
         Error must be <= tolerance_mm. No voxel rounding is involved.
      2. The processed image restored to the source grid has exactly the original
         grid. The mask agreement (Dice) is logged for information: downsampling
         from the source spacing to 1 mm loses some thin bone.
    """
    log.info("=== Round-trip landmark test ===")
    img = load_nrrd(defect_path)
    size = img.GetSize()
    voxels = [
        [int(size[i] * f) for i in range(3)] for f in (0.1, 0.5, 0.9)
    ]
    landmarks = [img.TransformIndexToPhysicalPoint(v) for v in voxels]

    dummy = sitk.Image(img.GetSize(), sitk.sitkUInt8)
    dummy.CopyInformation(img)

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        d_out, _, meta = preprocess_pair(img, dummy, cfg)
        sitk.WriteImage(d_out, str(td / "d.nrrd"), True)
        (td / "m.json").write_text(json.dumps(asdict(meta)))
        back = sitk.ReadImage(str(td / "d.nrrd"))
        meta_d = json.loads((td / "m.json").read_text())

        ok = True
        o = np.array(meta_d["processed_origin"])
        D = np.array(meta_d["processed_direction"]).reshape(3, 3)
        s = np.array(meta_d["processed_spacing"])
        for i, p in enumerate(landmarks):
            c = np.array(back.TransformPhysicalPointToContinuousIndex(p))
            p_back = o + D @ (c * s)
            err = float(np.linalg.norm(p_back - np.array(p)))
            log.info(f"  Landmark {i}: error={err:.6f} mm -> {'PASS' if err <= tolerance_mm else 'FAIL'}")
            ok &= err <= tolerance_mm

        restored = restore_to_source_grid(back, meta_d)
        same = (
            restored.GetSize() == img.GetSize()
            and np.abs(np.array(restored.GetSpacing()) - np.array(img.GetSpacing())).max() < 1e-6
            and np.abs(np.array(restored.GetOrigin()) - np.array(img.GetOrigin())).max() < 1e-6
            and np.abs(np.array(restored.GetDirection()) - np.array(img.GetDirection())).max() < 1e-6
        )
        log.info(f"  Restored grid equals source grid: {'PASS' if same else 'FAIL'}")
        ok &= same
        dice = _dice(sitk.GetArrayFromImage(img), sitk.GetArrayFromImage(restored))
        log.info(f"  Defect mask Dice after source -> 1 mm -> source (information only): {dice:.4f}")

    log.info("Round-trip test: PASSED" if ok else "Round-trip test: FAILED. Fix preprocessing before a full run.")
    return ok


# ---------------------------------------------------------------------------
# Subject split
# ---------------------------------------------------------------------------

def norm_category(name: str) -> str:
    return name.lower().replace("_", "").replace("-", "")


def build_subject_split(
    all_subject_ids: List[str],
    eval_subject_ids: List[str],
    mug500b_reserved: List[str],
    train_fraction: float,
    seed: int,
) -> Dict[str, str]:
    rng = random.Random(seed)
    partition: Dict[str, str] = {}
    for sid in mug500b_reserved:
        partition[sid] = "reserved"
    for sid in eval_subject_ids:
        partition.setdefault(sid, "test")
    remaining = sorted(set(all_subject_ids) - set(partition))
    rng.shuffle(remaining)
    n_train = int(len(remaining) * train_fraction)
    for sid in remaining[:n_train]:
        partition[sid] = "train"
    for sid in remaining[n_train:]:
        partition[sid] = "val"
    return partition


def check_partition_integrity(cases: List[dict], partition: Dict[str, str]) -> bool:
    ok = True
    by_part: Dict[str, set] = {}
    for c in cases:
        by_part.setdefault(partition[c["subject_id"]], set()).add(c["subject_id"])
    names = list(by_part)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            shared = by_part[names[i]] & by_part[names[j]]
            if shared:
                log.error(f"INTEGRITY FAIL: {sorted(shared)[:5]} in both {names[i]} and {names[j]}")
                ok = False
    for c in cases:
        p = partition[c["subject_id"]]
        if p == "test" and c["split_dir"] != "eval":
            log.error(f"INTEGRITY FAIL: {c['subject_id']} is test but not from the eval folder")
            ok = False
        if p in ("train", "val") and c["split_dir"] != "train":
            log.error(f"INTEGRITY FAIL: {c['subject_id']} is {p} but not from the train folder")
            ok = False
    if ok:
        log.info(f"Partition integrity: OK ({sum(len(v) for v in by_part.values())} subjects: "
                 + ", ".join(f"{k}={len(v)}" for k, v in sorted(by_part.items())) + ")")
    return ok


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def _discover_folder_layout(root: Path, tag: str, allowed: set) -> List[dict]:
    """Layout: <root>/**/defective_skull/<category>/<name>.nrrd with a matching implant/<category>/<name>.nrrd"""
    cases = []
    for ddir in sorted(root.rglob("defective_skull")):
        impl_root = ddir.parent / "implant"
        for cat_dir in sorted(p for p in ddir.iterdir() if p.is_dir()):
            cat = norm_category(cat_dir.name)
            if allowed and cat not in allowed:
                continue
            for df in sorted(cat_dir.glob("*.nrrd")):
                imp = impl_root / cat_dir.name / df.name
                if not imp.exists():
                    log.warning(f"No implant for {df}, skipping")
                    continue
                cases.append({
                    "subject_id": f"{tag}_{df.stem}", "defect_category": cat,
                    "source_dataset": "skullbreak", "defect_path": str(df),
                    "implant_path": str(imp), "split_dir": tag,
                })
    return cases


def _discover_suffix_layout(root: Path, tag: str, allowed: set, dsuf: str, isuf: str) -> List[dict]:
    """Layout: <name>_<category>_defective.nrrd next to <name>_<category>_implant.nrrd"""
    cats = ["parietotemporal", "frontoorbital", "bilateral", "random1", "random2"]
    cases = []
    for df in sorted(root.rglob(f"*{dsuf}")):
        stem = df.name[: -len(dsuf)]
        cat = next((c for c in cats if norm_category(stem).endswith(c)), "unknown")
        if allowed and cat not in allowed:
            continue
        imp = df.parent / (stem + isuf)
        if not imp.exists():
            log.warning(f"No implant for {df}, skipping")
            continue
        subject = stem
        for c in cats + ["random_1", "random_2"]:
            if stem.lower().endswith("_" + c):
                subject = stem[: -(len(c) + 1)]
        cases.append({
            "subject_id": f"{tag}_{subject}", "defect_category": cat,
            "source_dataset": "skullbreak", "defect_path": str(df),
            "implant_path": str(imp), "split_dir": tag,
        })
    return cases


def discover_cases(cfg: dict) -> Tuple[List[dict], List[str], List[str]]:
    sb = cfg["datasets"]["skullbreak"]
    allowed = {norm_category(c) for c in sb.get("first_run_categories", [])}
    cases, train_ids, eval_ids = [], [], []
    for key, tag in (("train_dir", "train"), ("eval_dir", "eval")):
        root = Path(sb.get(key, ""))
        if not root.exists():
            log.warning(f"{key} does not exist: {root}")
            continue
        if any(root.rglob("defective_skull")):
            found = _discover_folder_layout(root, tag, allowed)
            layout = "category folders"
        else:
            found = _discover_suffix_layout(
                root, tag, allowed, sb.get("defect_suffix", "_defective.nrrd"),
                sb.get("implant_suffix", "_implant.nrrd"))
            layout = "filename suffixes"
        log.info(f"{key}: {len(found)} cases ({layout}) under {root}")
        cases += found
        (train_ids if tag == "train" else eval_ids).extend(c["subject_id"] for c in found)
    log.info(f"Discovered {len(cases)} cases ({len(set(train_ids))} training subjects, "
             f"{len(set(eval_ids))} eval subjects)")
    return cases, sorted(set(train_ids)), sorted(set(eval_ids))


# ---------------------------------------------------------------------------
# Process one case
# ---------------------------------------------------------------------------

def process_one_case(raw: dict, partition: str, cfg: dict, out_root: Path) -> CaseRecord:
    sid, cat = raw["subject_id"], raw["defect_category"]
    dpath, ipath = Path(raw["defect_path"]), Path(raw["implant_path"])
    record = CaseRecord(
        subject_id=sid, defect_category=cat, source_dataset=raw["source_dataset"],
        partition=partition, defect_path=str(dpath), implant_path=str(ipath),
        defect_checksum=md5(dpath), implant_checksum=md5(ipath),
        raw_shape=[], raw_spacing=[], raw_origin=[], raw_direction=[],
        label_source="synthetic_removed_bone",
    )
    try:
        defect_img, implant_img = load_nrrd(dpath), load_nrrd(ipath)
        validate_binary_mask(defect_img, f"{sid} defect")
        validate_binary_mask(implant_img, f"{sid} implant")
        (record.raw_shape, record.raw_spacing,
         record.raw_origin, record.raw_direction) = image_meta(defect_img)

        d_out, i_out, meta = preprocess_pair(defect_img, implant_img, cfg)
        meta.subject_id, meta.source_dataset, meta.defect_category = sid, raw["source_dataset"], cat

        out_dir = out_root / partition
        out_dir.mkdir(parents=True, exist_ok=True)
        base = f"{sid}_{cat}"
        dp, ip, mp = out_dir / f"{base}_defect.nrrd", out_dir / f"{base}_implant.nrrd", out_dir / f"{base}_meta.json"
        sitk.WriteImage(d_out, str(dp), True)
        sitk.WriteImage(i_out, str(ip), True)
        mp.write_text(json.dumps(asdict(meta), indent=2))
        record.processed_defect_path, record.processed_implant_path, record.processed_meta_path = str(dp), str(ip), str(mp)
        log.info(f"  OK   [{partition}] {sid} ({cat})")
    except Exception as e:  # keep going; rejected cases are listed in the audit
        record.error = str(e)
        log.warning(f"  SKIP [{partition}] {sid} ({cat}): {e}")
    return record


# ---------------------------------------------------------------------------
# S3 upload and audit
# ---------------------------------------------------------------------------

def upload_to_s3(local_dir: Path, bucket: str, prefix: str) -> None:
    try:
        import boto3
    except ImportError:
        log.error("boto3 not installed, skipping S3 upload")
        return
    s3 = boto3.client("s3")
    n = 0
    for f in local_dir.rglob("*"):
        if f.is_file():
            s3.upload_file(str(f), bucket, f"{prefix}/{f.relative_to(local_dir)}")
            n += 1
    log.info(f"Uploaded {n} files to s3://{bucket}/{prefix}/")


def write_audit(records: List[CaseRecord], out_path: Path) -> dict:
    df = pd.DataFrame([asdict(r) for r in records])
    ok = df[df["error"] == ""]
    audit = {
        "total_cases": int(len(df)),
        "accepted": int(len(ok)),
        "rejected": int(len(df) - len(ok)),
        "cases_by_partition": {k: int(v) for k, v in ok.groupby("partition").size().items()},
        "subjects_by_partition": {k: int(v) for k, v in ok.groupby("partition")["subject_id"].nunique().items()},
        "by_category": {k: int(v) for k, v in ok.groupby("defect_category").size().items()},
        "rejected_cases": df[df["error"] != ""][["subject_id", "defect_category", "error"]].to_dict(orient="records"),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(audit, indent=2))
    log.info(f"Audit written to {out_path}")
    for k in ("total_cases", "accepted", "rejected", "cases_by_partition", "subjects_by_partition", "by_category"):
        log.info(f"  {k}: {audit[k]}")
    return audit


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Prepare cranial reconstruction training data")
    ap.add_argument("--config", required=True)
    ap.add_argument("--s3-bucket", default="", help="Overrides S3_BUCKET and the config")
    ap.add_argument("--round-trip-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = load_config(args.config)
    s3_cfg = cfg.get("s3", {})
    bucket = args.s3_bucket or os.environ.get("S3_BUCKET", "") or s3_cfg.get("bucket", "")
    version = s3_cfg.get("processed_version", "v1")
    out_root = Path(cfg["output"]["local_processed_dir"]) / version
    manifest_path = Path(cfg["output"]["local_manifest_path"])
    audit_path = Path(cfg["output"]["local_audit_path"])

    cases, train_ids, eval_ids = discover_cases(cfg)
    if not cases:
        log.error("No cases found. Check train_dir and eval_dir in the config, and the folder listing "
                  "printed by load_skullbreak_s3.py.")
        sys.exit(1)

    partition = build_subject_split(
        train_ids, eval_ids, cfg["split"].get("mug500b_reserved_ids", []),
        cfg["split"]["train_fraction"], cfg["split"]["seed"],
    )
    if not check_partition_integrity(cases, partition):
        sys.exit(1)

    first_train = next((c for c in cases if partition[c["subject_id"]] == "train"), None)
    if first_train:
        if not round_trip_test(Path(first_train["defect_path"]), cfg):
            sys.exit(2)
    else:
        log.warning("No training case found for the round-trip test.")
    if args.round_trip_only:
        return

    if args.dry_run:
        for c in cases:
            log.info(f"  [dry-run] {c['subject_id']} ({c['defect_category']}) -> {partition[c['subject_id']]}")
        log.info("Dry run complete. No files written.")
        return

    records = [process_one_case(c, partition[c["subject_id"]], cfg, out_root) for c in cases]

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([asdict(r) for r in records]).to_csv(manifest_path, index=False)
    log.info(f"Manifest written to {manifest_path}")
    write_audit(records, audit_path)

    prefix = s3_cfg.get("prefix", "cranial")
    if bucket and s3_cfg.get("upload_after_prepare", False):
        upload_to_s3(out_root, bucket, f"{prefix}/processed/{version}")
        upload_to_s3(manifest_path.parent, bucket, f"{prefix}/manifests")
    elif bucket:
        log.info("S3 upload skipped (upload_after_prepare=false). To upload:\n"
                 f"  aws s3 sync {out_root} s3://{bucket}/{prefix}/processed/{version}/\n"
                 f"  aws s3 sync {manifest_path.parent} s3://{bucket}/{prefix}/manifests/")
    log.info("prepare_data.py complete.")


if __name__ == "__main__":
    main()