"""Deterministic, read-only geometry measurements on binary skull/implant voxel masks.

Arrays are indexed [i, j, k] (NRRD fastest axis first). Points are reported as voxel indices
plus grid millimetres (ijk × spacing, grid-corner origin); clients map them into their own scene
frame. These are engineering approximations for design screening, not validated clinical
measurements. Nothing here writes data.
"""

from __future__ import annotations

import math
import threading
from collections import OrderedDict

import numpy as np
from scipy import ndimage

from skullfix_ai.application.binary_nrrd import decode_binary_nrrd

THIN_MM = 2.0          # policy default (cranioplasty_guardrails.md)
AMBER_MM = 2.5         # display band above the policy threshold
RIM_BAND_MM = (1.0, 8.0)
MAX_MARCH_MM = 25.0
MARCH_STEP_MM = 0.2
ROI_MARGIN_MM = 12.0
MIN_DEFECT_CM3 = 0.5
GAP_LIMIT_MM = 1.0     # policy mean rim gap
OVERLAP_BAND_MM = (4.0, 5.0)

_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()
_cache_lock = threading.Lock()
_CACHE_SIZE = 3


def load_mask(key: str, data_loader) -> np.ndarray:
    """Decode a binary NRRD into a bool [i, j, k] array, caching a few recent volumes by key."""
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    grid = decode_binary_nrrd(data_loader())
    sx, sy, sz = grid.sizes
    mask = np.frombuffer(grid.voxels, dtype=np.uint8).reshape((sz, sy, sx)).transpose(2, 1, 0).astype(bool)
    with _cache_lock:
        _cache[key] = mask
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return mask


def voxel_mm3(spacing) -> float:
    return float(np.prod(np.asarray(spacing, dtype=float)))


def volume_summary(count: int, spacing) -> dict:
    mm3 = count * voxel_mm3(spacing)
    return {"voxels": int(count), "volume_mm3": round(mm3, 3), "volume_cm3": round(mm3 / 1000.0, 4)}


def _bbox(mask: np.ndarray, margin: np.ndarray, shape) -> tuple[slice, ...] | None:
    coords = np.argwhere(mask)
    if coords.size == 0:
        return None
    lo = np.maximum(coords.min(axis=0) - margin, 0)
    hi = np.minimum(coords.max(axis=0) + margin + 1, shape)
    return tuple(slice(int(a), int(b)) for a, b in zip(lo, hi))


def _margin_voxels(spacing, mm: float) -> np.ndarray:
    return np.ceil(mm / np.asarray(spacing, dtype=float)).astype(int)


def implant_from_candidate(source: np.ndarray, candidate: np.ndarray) -> np.ndarray:
    """Voxels the candidate adds to the source skull (the designed implant), in the shared grid."""
    if source.shape != candidate.shape:
        raise ValueError("Candidate and source grids differ")
    return candidate & ~source


def _best_mirror_plane(source: np.ndarray, centroid: float, search: int = 24) -> float:
    """Mid-sagittal (i) plane maximising self-overlap of the mirrored skull; a defect biases the mass centroid."""
    coarse = source[::4, ::4, ::4]
    n = coarse.shape[0]
    best, best_score = centroid, -1
    for plane in np.arange(centroid - search, centroid + search + 0.5, 1.0):
        index = np.rint((2 * plane - np.arange(n) * 4) / 4).astype(int)
        valid = (index >= 0) & (index < n)
        score = int((coarse[valid] & coarse[index[valid]]).sum())
        if score > best_score:
            best, best_score = float(plane), score
    return best


def estimate_defect_by_symmetry(source: np.ndarray, spacing) -> np.ndarray | None:
    """Estimate a unilateral defect as mirrored bone (about the skull's i-centroid) missing from the source.

    Downsampled ×2 for robustness; keeps the largest connected region if it exceeds MIN_DEFECT_CM3.
    Returns None when no plausible region is found (e.g. bilateral or no defect).
    """
    counts = source.sum(axis=(1, 2))
    if counts.sum() == 0:
        return None
    centroid = float((np.arange(source.shape[0]) * counts).sum() / counts.sum())
    plane = _best_mirror_plane(source, centroid)
    index = np.rint(2 * plane - np.arange(source.shape[0])).astype(int)
    valid = (index >= 0) & (index < source.shape[0])
    mirrored = np.zeros_like(source)
    mirrored[valid] = source[index[valid]]
    missing = mirrored & ~source
    coarse = missing[::2, ::2, ::2]
    coarse = ndimage.binary_opening(coarse, structure=np.ones((3, 3, 3), bool))
    labels, count = ndimage.label(coarse)
    if count == 0:
        return None
    sizes = ndimage.sum(coarse, labels, index=range(1, count + 1))
    largest = int(np.argmax(sizes)) + 1
    if sizes[largest - 1] * 8 * voxel_mm3(spacing) / 1000.0 < MIN_DEFECT_CM3:
        return None
    region = labels == largest
    full = np.repeat(np.repeat(np.repeat(region, 2, axis=0), 2, axis=1), 2, axis=2)
    full = full[: source.shape[0], : source.shape[1], : source.shape[2]]
    padded = np.zeros_like(source)
    padded[: full.shape[0], : full.shape[1], : full.shape[2]] = full
    return padded & missing


def severity(value: float, low: float, high: float, *, higher_is_better: bool = True) -> str:
    if higher_is_better:
        return "critical" if value < low else "warning" if value < high else "ok"
    return "critical" if value > high else "warning" if value > low else "ok"


def _sample(values: np.ndarray, limit: int) -> np.ndarray:
    if len(values) <= limit:
        return values
    return values[np.linspace(0, len(values) - 1, limit).astype(int)]


def rim_thickness(source: np.ndarray, defect: np.ndarray, spacing, *, max_points: int = 600,
                  sample_limit: int = 4000) -> dict:
    """Bone thickness along surface normals for skull surface voxels in a band around the defect."""
    spacing = np.asarray(spacing, dtype=float)
    roi = _bbox(defect, _margin_voxels(spacing, ROI_MARGIN_MM), source.shape)
    if roi is None:
        return {"status": "INDETERMINATE", "reason": "No defect region was found."}
    offset = np.array([s.start for s in roi])
    bone, hole = source[roi], defect[roi]
    to_defect = ndimage.distance_transform_edt(~hole, sampling=spacing)
    surface = bone & ~ndimage.binary_erosion(bone)
    band = surface & (to_defect >= RIM_BAND_MM[0]) & (to_defect <= RIM_BAND_MM[1])
    starts = np.argwhere(band)
    if len(starts) == 0:
        return {"status": "INDETERMINATE", "reason": "No bone surface was found around the defect rim."}
    starts = _sample(starts, sample_limit)
    smooth = ndimage.gaussian_filter(bone.astype(np.float32), sigma=1.0)
    gradients = np.stack([g[tuple(starts.T)] for g in np.gradient(smooth)], axis=1) / spacing
    norms = np.linalg.norm(gradients, axis=1)
    keep = norms > 1e-6
    starts, directions = starts[keep], gradients[keep] / norms[keep, None]
    positions = starts.astype(float)
    thickness = np.full(len(starts), np.nan)
    active = np.ones(len(starts), bool)
    step_vox = directions * MARCH_STEP_MM / spacing
    shape = np.array(bone.shape)
    for step in range(1, int(MAX_MARCH_MM / MARCH_STEP_MM) + 1):
        positions[active] += step_vox[active]
        idx = np.rint(positions[active]).astype(int)
        inside_grid = np.all((idx >= 0) & (idx < shape), axis=1)
        in_bone = np.zeros(len(idx), bool)
        in_bone[inside_grid] = bone[tuple(idx[inside_grid].T)]
        exited = np.flatnonzero(active)[~in_bone]
        thickness[exited] = step * MARCH_STEP_MM
        active[exited] = False
        if not active.any():
            break
    measured = ~np.isnan(thickness)
    if not measured.any():
        return {"status": "INDETERMINATE", "reason": "Thickness could not be measured along surface normals."}
    points, values = starts[measured] + offset, thickness[measured]
    thin = values < THIN_MM
    order = np.argsort(values)
    overlay_idx = _sample(np.arange(len(values)), max_points)
    return {
        "status": "FAIL" if thin.any() else "PASS",
        "samples": int(len(values)),
        "min_thickness_mm": round(float(values.min()), 2),
        "mean_thickness_mm": round(float(values.mean()), 2),
        "max_thickness_mm": round(float(values.max()), 2),
        "p5_thickness_mm": round(float(np.percentile(values, 5)), 2),
        "thin_fraction": round(float(thin.mean()), 4),
        "threshold_mm": THIN_MM,
        "thin_regions": [_point(points[i], values[i], spacing) for i in order[: min(12, int(thin.sum()))]],
        "focus_ijk": [int(v) for v in points[order[0]]],
        "overlay_points": [{**_point(points[i], values[i], spacing),
                            "severity": severity(values[i], THIN_MM, AMBER_MM)} for i in overlay_idx],
    }


def _point(ijk, value, spacing) -> dict:
    ijk = [int(v) for v in ijk]
    return {"ijk": ijk, "grid_mm": [round(v * s, 2) for v, s in zip(ijk, spacing)], "value_mm": round(float(value), 2)}


def shift_mask(mask: np.ndarray, shift: np.ndarray) -> np.ndarray:
    """Translate a mask by whole voxels (out-of-grid voxels drop)."""
    result = np.zeros_like(mask)
    src = tuple(slice(max(0, -d), mask.shape[a] - max(0, d)) for a, d in enumerate(shift))
    dst = tuple(slice(max(0, d), mask.shape[a] - max(0, -d)) for a, d in enumerate(shift))
    result[dst] = mask[src]
    return result


def implant_rim_fit(source: np.ndarray, implant: np.ndarray, spacing, pose=None, *, max_points: int = 600) -> dict:
    """Rim gap, bone interference and onlay overlap of the (translated) implant against the defect edge."""
    spacing = np.asarray(spacing, dtype=float)
    if not implant.any():
        return {"status": "INDETERMINATE", "reason": "The candidate adds no implant voxels to the source skull."}
    translation = np.array([pose[3], pose[7], pose[11]], dtype=float) if pose else np.zeros(3)
    shift = np.rint(translation / spacing).astype(int)
    placed = shift_mask(implant, shift) if shift.any() else implant
    roi = _bbox(implant | placed, _margin_voxels(spacing, ROI_MARGIN_MM), source.shape)
    offset = np.array([s.start for s in roi])
    bone, designed, placed = source[roi], implant[roi], placed[roi]
    edge = bone & ndimage.binary_dilation(designed)          # cut face the implant was designed to meet
    if not edge.any():
        return {"status": "INDETERMINATE", "reason": "The implant does not meet the skull edge."}
    to_placed = ndimage.distance_transform_edt(~placed, sampling=spacing)
    edge_points = np.argwhere(edge)
    gaps = np.maximum(to_placed[tuple(edge_points.T)] - spacing.max(), 0.0)
    interference_mm3 = float((placed & bone).sum()) * voxel_mm3(spacing)
    near_bone = ndimage.distance_transform_edt(~bone, sampling=spacing) <= spacing.max() * 1.5
    onlay = placed & ~designed & near_bone & ~bone
    if onlay.any():
        widths = ndimage.distance_transform_edt(~designed, sampling=spacing)[onlay]
        overlap_mm = float(np.percentile(widths, 95))
        design = "onlay"
    else:
        overlap_mm, design = 0.0, "inlay"
    checks = [{"check": "mean_rim_gap", "value_mm": round(float(gaps.mean()), 3), "threshold_mm": GAP_LIMIT_MM,
               "status": "PASS" if gaps.mean() <= GAP_LIMIT_MM else "FAIL"}]
    if design == "onlay":
        lo, hi = OVERLAP_BAND_MM
        checks.append({"check": "margin_overlap", "value_mm": round(overlap_mm, 3), "threshold_mm": [lo, hi],
                       "status": "PASS" if lo <= overlap_mm <= hi else "FAIL"})
    else:
        checks.append({"check": "margin_overlap", "status": "NOT_APPLICABLE",
                       "reason": "Inlay (edge-to-edge) design; the onlay overlap rule does not apply."})
    checks.append({"check": "dura_penetration", "status": "INDETERMINATE",
                   "reason": "No dural surface is available in the workspace."})
    decided = [c["status"] for c in checks if c["status"] in ("PASS", "FAIL")]
    order = np.argsort(-gaps)
    points = edge_points + offset
    overlay_idx = _sample(np.arange(len(gaps)), max_points)
    return {
        "status": "FAIL" if "FAIL" in decided else "PASS",
        "design": design,
        "edge_samples": int(len(gaps)),
        "mean_rim_gap_mm": round(float(gaps.mean()), 3),
        "max_rim_gap_mm": round(float(gaps.max()), 3),
        "bone_interference_mm3": round(interference_mm3, 2),
        "margin_overlap_mm": round(overlap_mm, 3),
        "translation_mm": [round(v, 3) for v in translation],
        "checks": checks,
        "gap_regions": [_point(points[i], gaps[i], spacing) for i in order[:12] if gaps[i] > GAP_LIMIT_MM],
        "focus_ijk": [int(v) for v in points[order[0]]],
        "overlay_points": [{**_point(points[i], gaps[i], spacing),
                            "severity": severity(gaps[i], 0.5, GAP_LIMIT_MM, higher_is_better=False)}
                           for i in overlay_idx],
    }
