"""Geometry statistics and ML record for a predicted fix (cranial-reconstruction-candidate R14–R17).

Arrays are indexed [i, j, k]. Every number is computed from the stored fix revision and the source
volume; nothing is estimated. These are geometry measurements of a model proposal, not clinical
assessments.
"""
import csv
import json
import os
from pathlib import Path

import numpy as np
from scipy import ndimage

from .binary_nrrd import decode_binary_nrrd
from .landmarks import LandmarkError, patient_point

LABEL = 'Geometry measured from a model proposal, not a clinical assessment.'
DEFAULT_MODEL_CARD = Path(__file__).resolve().parents[5] / 'ml' / 'cranial' / 'manifests' / 'model_card_v2.json'
NEIGHBOURS = [(axis, step) for axis in range(3) for step in (-1, 1)]


def model_card_path() -> Path:
    return Path(os.environ.get('CRANIAL_MODEL_CARD', DEFAULT_MODEL_CARD))


def _mask(data):
    grid = decode_binary_nrrd(data)
    sx, sy, sz = grid.sizes
    return np.frombuffer(grid.voxels, dtype=np.uint8).reshape((sz, sy, sx)).transpose(2, 1, 0).astype(bool)


def _shifted(mask, axis, step):
    """Neighbour values along one axis; outside the grid counts as empty."""
    padded = np.pad(mask, 1)
    index = [slice(1, -1)] * 3
    index[axis] = slice(1 + step, padded.shape[axis] - 1 + step)
    return padded[tuple(index)]


def _metric(key, label, value, unit, method):
    return {'key': key, 'label': label, 'value': value, 'unit': unit, 'method': method, 'status': 'ok'}


def _unavailable(key, label, unit, method, reason):
    return {'key': key, 'label': label, 'value': None, 'unit': unit, 'method': method,
            'status': 'not-available', 'reason': reason}


def fix_statistics(source_bytes, candidate_bytes, spatial) -> dict:
    source, candidate = _mask(source_bytes), _mask(candidate_bytes)
    fix = candidate & ~source
    spacing = np.asarray(spatial['spacings'], dtype=float)
    has_mm = spatial.get('units') == 'mm'
    no_mm = 'This skull has no verified millimetre spacing.'
    coords = np.argwhere(fix)
    metrics = []

    def mm_metric(key, label, unit, method, compute):
        metrics.append(_metric(key, label, value=compute(), unit=unit, method=method) if has_mm else _unavailable(key, label, unit, method, no_mm))

    mm_metric('volume', 'Fix volume', 'mL', 'Fix voxel count × voxel volume.',
              lambda: round(float(fix.sum() * spacing.prod()) / 1000.0, 4))

    def outer_area():
        area = 0.0
        for axis, step in NEIGHBOURS:
            exposed = fix & ~_shifted(fix, axis, step) & ~_shifted(source, axis, step)
            area += float(exposed.sum()) * float(np.prod(np.delete(spacing, axis)))
        return round(area, 1)
    mm_metric('outer_surface_area', 'Outer surface area', 'mm²',
              'Voxel faces of the fix that face empty space (faces against bone excluded).', outer_area)
    mm_metric('bounding_box', 'Bounding box', 'mm', 'Extent of fix voxels along each grid axis.',
              lambda: [round(float(v), 1) for v in (coords.max(axis=0) - coords.min(axis=0) + 1) * spacing])

    thickness = None
    if has_mm:
        # Skull and fix as one solid; the grid edge counts as empty space.
        solid = np.pad(fix | source, 1)
        depth = ndimage.distance_transform_edt(solid, sampling=spacing)
        ridge = solid & (depth >= ndimage.maximum_filter(depth, size=3) - 1e-9)
        near_fix = ndimage.binary_dilation(np.pad(fix, 1))
        thickness = 2.0 * depth[ridge & near_fix]
    method = 'Twice the distance to empty space at medial voxels of skull plus fix, within one voxel of the fix.'
    for key, label, reduce in (('mean_thickness', 'Mean thickness', np.mean), ('min_thickness', 'Minimum thickness', np.min)):
        if has_mm and thickness.size:
            metrics.append(_metric(key, label, value=round(float(reduce(thickness)), 2), unit='mm', method=method))
        else:
            metrics.append(_unavailable(key, label, 'mm', method, no_mm if not has_mm else 'No medial voxels near the fix.'))

    surface = np.zeros_like(fix)
    touching = np.zeros_like(fix)
    for axis, step in NEIGHBOURS:
        surface |= fix & ~_shifted(fix, axis, step)
        touching |= fix & _shifted(source, axis, step)
    metrics.append(_metric('bone_contact', 'Surface touching bone', unit='%',
                           method="Share of the fix's surface voxels that share a face with existing bone.",
                           value=round(100.0 * float((surface & touching).sum()) / float(surface.sum()), 1)))
    metrics.append(_unavailable('largest_rim_gap', 'Largest rim gap', 'mm',
                                'Gap between the fix border and the defect rim.',
                                'Needs a defect-rim definition for model fixes; not measured yet.'))

    try:
        if not has_mm:
            raise LandmarkError(no_mm)
        centroid = [round(v, 2) for v in patient_point(spatial, coords.mean(axis=0).tolist())]
        skull_x = patient_point(spatial, np.argwhere(source).mean(axis=0).tolist())[0]
        offset = centroid[0] - skull_x
        side = 'midline' if abs(offset) < spacing.max() else ('right' if offset > 0 else 'left')
        metrics.append(_metric('side', 'Side', unit='patient side', value=side,
                               method='Fix centroid vs skull centroid along the RAS left-right axis.'))
        metrics.append(_metric('centroid', 'Centroid', unit='mm (RAS)', value=centroid,
                               method='Mean position of fix voxels in patient coordinates.'))
    except LandmarkError as error:
        reason = str(error)
        metrics.append(_unavailable('side', 'Side', 'patient side', 'Fix centroid vs skull centroid.', reason))
        metrics.append(_unavailable('centroid', 'Centroid', 'mm (RAS)', 'Mean position of fix voxels.', reason))
    return {'label': LABEL, 'metrics': metrics}


def _bootstrap_ci(values, resamples=10000, seed=0):
    rng = np.random.default_rng(seed)
    values = np.asarray(values, dtype=float)
    means = rng.choice(values, size=(resamples, len(values)), replace=True).mean(axis=1)
    return [round(float(v), 3) for v in np.percentile(means, [2.5, 97.5])]


def ml_record(provenance) -> dict:
    card_path = model_card_path()
    card = json.loads(card_path.read_text())
    eval_dir = (card_path.parent / card['eval_dir']).resolve()

    def split(name):
        summary = json.loads((eval_dir / f'summary_{name}.json').read_text())
        result = {'cases': summary['total_cases'], 'failures': summary['n_failures'],
                  'meanDice': round(summary['mean_implant_dice'], 3), 'medianHd95Mm': round(summary['median_hd95_mm'], 2)}
        per_case = eval_dir / f'per_case_{name}.csv'
        if per_case.is_file():
            with per_case.open() as handle:
                result['meanDice95Ci'] = _bootstrap_ci([float(row['model_dice']) for row in csv.DictReader(handle)])
        return result

    return {
        'model': card['model'], 'trainingData': card['training_data'],
        'heldOut': {'test': split('test'), 'validation': split('val'),
                    'note': 'SkullBreak held-out cases on the source grid, scored once after the freeze.'},
        'checkpointHash': provenance['checkpointHash'], 'runId': provenance['freezeRunId'],
        'threshold': provenance['threshold'], 'thresholdIsDefault': provenance['thresholdIsDefault'],
        'region': provenance['region'], 'inferenceSeconds': provenance['inferenceSeconds'],
        'totalSeconds': provenance['totalSeconds'], 'limitation': card['limitation'],
    }
