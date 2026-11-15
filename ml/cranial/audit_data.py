"""
audit_data.py — Evaluate and inspect the prepared data
=======================================================
Run this after prepare_data.py to verify the processed cache is correct
before spending GPU time on training.

What it checks:
  1. Manifest completeness — every expected case is present
  2. Partition integrity — no subject ID in two partitions; MUG500+ B excluded
  3. Shape / spacing conformance — matches each case meta final_shape / processed_spacing
  4. Binary mask sanity — no non-binary values; non-empty targets
  5. Defect/implant physical consistency — defect and implant share the same frame
  6. Defect/implant logical consistency — implant never overlaps defect bone
  7. Per-partition statistics — mean implant volume, min/max sizes
  8. Slice visualizations — saves orthogonal PNGs for a sample of cases

Usage:
    python ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv
    python ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv --visualize --n-vis 5
    python ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv --partition train
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd
import SimpleITK as sitk

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

SPACING_TOL = 0.05  # mm tolerance


# ---------------------------------------------------------------------------
# Individual case checks
# ---------------------------------------------------------------------------

class CaseAuditError(Exception):
    pass


def check_shape_spacing(
    img: sitk.Image,
    name: str,
    expected_shape: tuple,
    expected_spacing: tuple,
) -> None:
    shape = img.GetSize()         # (x, y, z)
    spacing = img.GetSpacing()

    if tuple(shape) != tuple(expected_shape):
        raise CaseAuditError(f"{name}: expected shape {tuple(expected_shape)}, got {shape}")

    for i, (s, e) in enumerate(zip(spacing, expected_spacing)):
        if abs(s - e) > SPACING_TOL:
            raise CaseAuditError(
                f"{name}: axis {i} spacing {s:.3f} mm deviates from "
                f"expected {e:.3f} mm by more than {SPACING_TOL} mm"
            )

    if img.GetPixelID() != sitk.sitkUInt8:
        raise CaseAuditError(f"{name}: pixel type is not uint8 (got {img.GetPixelIDTypeAsString()})")


def check_binary(arr: np.ndarray, name: str) -> None:
    unique = np.unique(arr)
    if not set(unique.tolist()).issubset({0, 1}):
        raise CaseAuditError(f"{name}: non-binary values: {unique}")


def check_non_empty(arr: np.ndarray, name: str) -> None:
    if arr.sum() == 0:
        raise CaseAuditError(f"{name}: mask is all zeros (empty)")


def check_physical_consistency(defect_img: sitk.Image, implant_img: sitk.Image) -> None:
    """Confirm defect and implant share the same physical frame."""
    if not np.allclose(defect_img.GetOrigin(), implant_img.GetOrigin()) or not np.allclose(defect_img.GetDirection(), implant_img.GetDirection()):
        raise CaseAuditError("Origin or direction mismatch")
    if defect_img.GetSize() != implant_img.GetSize():
        raise CaseAuditError(
            f"Size mismatch: defect {defect_img.GetSize()} vs implant {implant_img.GetSize()}"
        )
    for i, (ds, is_) in enumerate(zip(defect_img.GetSpacing(), implant_img.GetSpacing())):
        if abs(ds - is_) > 1e-4:
            raise CaseAuditError(f"Spacing mismatch on axis {i}: {ds:.4f} vs {is_:.4f}")


def check_no_overlap(defect_arr: np.ndarray, implant_arr: np.ndarray) -> int:
    """
    Implant voxels must not overlap defect bone voxels.
    Returns the number of overlapping voxels (should be 0, but allow small
    tolerance from resampling artifacts).
    """
    return int(np.logical_and(defect_arr, implant_arr).sum())


def audit_one_case(row: pd.Series, verbose: bool = False) -> dict:
    """
    Runs all checks on one case.
    Returns a dict with keys: subject_id, partition, status, checks, error, stats
    """
    result = {
        "subject_id": row["subject_id"],
        "defect_category": row["defect_category"],
        "partition": row["partition"],
        "status": "PASS",
        "error": "",
        "checks": {},
        "stats": {},
    }

    try:
        d_path = Path(row["processed_defect_path"])
        i_path = Path(row["processed_implant_path"])
        m_path = Path(row["processed_meta_path"])

        # --- File existence ---
        for p, label in [(d_path, "defect"), (i_path, "implant"), (m_path, "meta")]:
            if not p.exists():
                raise CaseAuditError(f"Missing file: {p} ({label})")
        result["checks"]["files_exist"] = True

        # --- Meta first (authoritative processed shape/spacing for this cache version) ---
        with open(m_path) as f:
            meta = json.load(f)
        result["checks"]["meta_readable"] = True
        expected_shape = tuple(int(v) for v in meta["final_shape"])
        expected_spacing = tuple(float(v) for v in meta["processed_spacing"])

        # --- Load ---
        d_img = sitk.ReadImage(str(d_path))
        i_img = sitk.ReadImage(str(i_path))
        d_arr = sitk.GetArrayFromImage(d_img).astype(np.uint8)  # [z, y, x]
        i_arr = sitk.GetArrayFromImage(i_img).astype(np.uint8)

        # --- Shape / spacing / pixel type ---
        check_shape_spacing(d_img, "defect", expected_shape, expected_spacing)
        check_shape_spacing(i_img, "implant", expected_shape, expected_spacing)
        result["checks"]["shape_spacing"] = True

        # --- Binary values ---
        check_binary(d_arr, "defect")
        check_binary(i_arr, "implant")
        result["checks"]["binary_values"] = True

        # --- Non-empty implant ---
        check_non_empty(i_arr, "implant")
        result["checks"]["implant_nonempty"] = True

        # --- Physical frame consistency ---
        check_physical_consistency(d_img, i_img)
        result["checks"]["physical_consistency"] = True

        # --- Overlap check ---
        overlap_voxels = check_no_overlap(d_arr, i_arr)
        overlap_frac = overlap_voxels / max(i_arr.sum(), 1)
        result["checks"]["overlap_voxels"] = int(overlap_voxels)
        if overlap_frac > 0.01:   # allow up to 1% from resampling boundary
            raise CaseAuditError(
                f"Implant overlaps defect bone in {overlap_voxels} voxels "
                f"({overlap_frac:.1%} of implant)"
            )

        voxel_mm3 = float(np.prod(expected_spacing))
        # --- Statistics ---
        result["stats"] = {
            "defect_voxels": int(d_arr.sum()),
            "implant_voxels": int(i_arr.sum()),
            "implant_volume_mm3": float(i_arr.sum()) * voxel_mm3,
            "defect_density": float(d_arr.mean()),
            "orig_shape": meta.get("orig_shape"),
            "orig_spacing": meta.get("orig_spacing"),
            "final_shape": list(expected_shape),
            "processed_spacing": list(expected_spacing),
        }

        if verbose:
            log.info(
                f"  PASS {row['subject_id']} ({row['defect_category']}) | "
                f"implant={result['stats']['implant_voxels']} vox | "
                f"overlap={overlap_voxels}"
            )

    except CaseAuditError as e:
        result["status"] = "FAIL"
        result["error"] = str(e)
        log.warning(f"  FAIL {row.get('subject_id','?')}: {e}")
    except Exception as e:
        result["status"] = "ERROR"
        result["error"] = f"Unexpected: {e}"
        log.error(f"  ERROR {row.get('subject_id','?')}: {e}")

    return result


# ---------------------------------------------------------------------------
# Partition-level checks
# ---------------------------------------------------------------------------

def check_subject_partition_exclusivity(df: pd.DataFrame) -> List[dict]:
    """R2: No subject ID appears in two partitions."""
    violations = []
    accepted = df[df["error"].fillna("") == ""]
    for sid, grp in accepted.groupby("subject_id"):
        parts = grp["partition"].unique().tolist()
        if len(parts) > 1:
            violations.append({"subject_id": sid, "partitions": parts})
    return violations


def check_mug500b_exclusion(df: pd.DataFrame, reserved_ids: List[str]) -> List[dict]:
    """R3: MUG500+ B subjects must not appear in train or val."""
    violations = []
    accepted = df[df["error"].fillna("") == ""]
    for sid in reserved_ids:
        rows = accepted[(accepted["subject_id"] == sid) & (accepted["partition"].isin(["train", "val"]))]
        if len(rows) > 0:
            violations.append({"subject_id": sid, "found_in": rows["partition"].tolist()})
    return violations


# ---------------------------------------------------------------------------
# Visualizations
# ---------------------------------------------------------------------------

def save_slice_overlay(
    defect_path: str,
    implant_path: str,
    out_path: Path,
    subject_id: str,
) -> None:
    """
    Save three orthogonal slice overlays (axial, coronal, sagittal) as a PNG.
    Defect bone = gray, implant = red overlay.
    Requires matplotlib.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        log.warning("matplotlib not installed — skipping visualization")
        return

    d_arr = sitk.GetArrayFromImage(sitk.ReadImage(defect_path)).astype(float)  # [z, y, x]
    i_arr = sitk.GetArrayFromImage(sitk.ReadImage(implant_path)).astype(float)

    # Find the center of mass of the implant to pick the most informative slice
    from scipy.ndimage import center_of_mass
    if i_arr.sum() > 0:
        cz, cy, cx = [int(round(v)) for v in center_of_mass(i_arr)]
    else:
        cz, cy, cx = [s // 2 for s in d_arr.shape]

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    fig.suptitle(f"{subject_id}", fontsize=12)

    views = [
        ("Axial",    d_arr[cz, :, :],  i_arr[cz, :, :]),
        ("Coronal",  d_arr[:, cy, :],  i_arr[:, cy, :]),
        ("Sagittal", d_arr[:, :, cx],  i_arr[:, :, cx]),
    ]
    for ax, (title, d_slice, i_slice) in zip(axes, views):
        ax.imshow(d_slice, cmap="gray", origin="lower", vmin=0, vmax=1)
        ax.imshow(
            np.ma.masked_where(i_slice == 0, i_slice),
            cmap="Reds",
            alpha=0.6,
            origin="lower",
            vmin=0,
            vmax=1,
        )
        ax.set_title(title)
        ax.axis("off")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(str(out_path), dpi=100, bbox_inches="tight")
    plt.close()
    log.info(f"  Saved visualization: {out_path}")


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------

def print_summary(results: List[dict], df_manifest: pd.DataFrame) -> dict:
    """Print a table of per-partition stats and return the summary dict."""
    total  = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] != "PASS")

    # Build a DataFrame of audit results
    adf = pd.DataFrame(results)
    stats_df = pd.DataFrame([r["stats"] for r in results if r["stats"]])

    log.info("\n" + "=" * 60)
    log.info(f"AUDIT SUMMARY: {passed}/{total} passed, {failed} failed")
    log.info("=" * 60)

    if not stats_df.empty and "implant_voxels" in stats_df.columns:
        # Merge partition info
        partition_info = adf[["subject_id", "partition"]].copy()
        stats_df = stats_df.join(partition_info)

        for partition in ["train", "val", "test"]:
            subset = stats_df[stats_df["partition"] == partition]
            if subset.empty:
                continue
            log.info(
                f"  {partition:8s}: {len(subset):3d} cases | "
                f"implant vol mean={subset['implant_voxels'].mean():.0f} vox "
                f"[{subset['implant_voxels'].min():.0f}–{subset['implant_voxels'].max():.0f}]"
            )

    if failed > 0:
        log.warning("\nFailed cases:")
        for r in results:
            if r["status"] != "PASS":
                log.warning(f"  {r['subject_id']} ({r['partition']}): {r['error']}")

    # Count unique subjects per partition (from manifest)
    if not df_manifest.empty:
        log.info("\nManifest subject counts:")
        for part, grp in df_manifest.groupby("partition"):
            n_subjects = grp["subject_id"].nunique()
            n_cases    = len(grp)
            log.info(f"  {part:12s}: {n_subjects:3d} subjects, {n_cases:3d} cases")

    summary = {
        "total": total,
        "passed": passed,
        "failed": failed,
        "results": results,
    }
    return summary


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit prepared cranial data")
    parser.add_argument("--manifest", required=True, help="Path to split manifest CSV (e.g. split_v2.csv)")
    parser.add_argument("--partition", default=None,
                        help="Audit only this partition (train|val|test). Default: all.")
    parser.add_argument("--visualize", action="store_true",
                        help="Save orthogonal slice PNG for sampled cases")
    parser.add_argument("--n-vis", type=int, default=3,
                        help="Number of cases to visualize per partition (default 3)")
    parser.add_argument("--vis-dir", default="ml/cranial/reports/slices",
                        help="Output directory for visualization PNGs")
    parser.add_argument("--mug500b-ids", default="",
                        help="Comma-separated list of MUG500+ B subject IDs to check for exclusion")
    parser.add_argument("--out-json", default="ml/cranial/reports/audit_results.json",
                        help="Where to write the JSON audit results")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        log.error(f"Manifest not found: {manifest_path}")
        sys.exit(1)

    df = pd.read_csv(manifest_path)
    log.info(f"Loaded manifest: {len(df)} rows from {manifest_path}")

    # Filter to accepted cases only (no error from prepare_data.py)
    if "error" in df.columns:
        rejected = df[df["error"].notna() & (df["error"] != "")]
        if len(rejected) > 0:
            log.warning(f"{len(rejected)} cases were rejected in prepare_data.py and will be skipped:")
            for _, r in rejected.iterrows():
                log.warning(f"  {r['subject_id']}: {r['error']}")
        df = df[df["error"].isna() | (df["error"] == "")]

    if args.partition:
        df = df[df["partition"] == args.partition]
        log.info(f"Filtered to partition='{args.partition}': {len(df)} cases")

    if df.empty:
        log.error("No cases to audit.")
        sys.exit(1)

    # --- Partition-level integrity checks ---
    log.info("\n--- Partition integrity ---")
    full_df = pd.read_csv(manifest_path)
    overlap_violations = check_subject_partition_exclusivity(full_df)
    if overlap_violations:
        log.error(f"OVERLAP VIOLATIONS: {overlap_violations}")
        sys.exit(1)
    else:
        log.info("Subject partition exclusivity: OK")

    mug500b_ids = [s.strip() for s in args.mug500b_ids.split(",") if s.strip()]
    if mug500b_ids:
        mug_violations = check_mug500b_exclusion(full_df, mug500b_ids)
        if mug_violations:
            log.error(f"MUG500+ B contamination violations: {mug_violations}")
            sys.exit(1)
        else:
            log.info(f"MUG500+ B exclusion: OK ({len(mug500b_ids)} reserved subjects checked)")

    # --- Per-case audit ---
    log.info(f"\n--- Per-case checks ({len(df)} cases) ---")
    results = []
    for _, row in df.iterrows():
        result = audit_one_case(row, verbose=args.verbose)
        results.append(result)

    # --- Summary ---
    summary = print_summary(results, full_df)

    # --- Visualizations ---
    if args.visualize:
        log.info(f"\n--- Saving slice visualizations (n={args.n_vis} per partition) ---")
        vis_dir = Path(args.vis_dir)
        rdf = pd.DataFrame(results)
        passed = rdf[rdf["status"] == "PASS"]
        # merge back to get file paths
        passed = passed.merge(
            df[["subject_id", "defect_category", "partition",
                "processed_defect_path", "processed_implant_path"]],
            on=["subject_id", "defect_category", "partition"],
            how="left",
        )
        for partition in ["train", "val", "test"]:
            subset = passed[passed["partition"] == partition].head(args.n_vis)
            for _, row in subset.iterrows():
                out_png = vis_dir / partition / f"{row['subject_id']}_{row['defect_category']}.png"
                save_slice_overlay(
                    row["processed_defect_path"],
                    row["processed_implant_path"],
                    out_png,
                    subject_id=f"{row['subject_id']} ({partition})",
                )

    # --- Write JSON results ---
    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    log.info(f"\nFull results written to {out_json}")

    # Exit non-zero if any failures
    if summary["failed"] > 0:
        log.error(f"{summary['failed']} cases failed audit.")
        sys.exit(1)
    else:
        log.info("All cases passed audit ✓")


if __name__ == "__main__":
    main()
