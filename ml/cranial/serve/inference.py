"""SageMaker inference handler for the frozen cranial U-Net (cranial-reconstruction-candidate R1, R2).

Model directory layout (from model.tar.gz): model.pt, freeze.json, code/ (this file plus predict.py,
train.py, prepare_data.py and requirements.txt). Async inference reads the defective-skull NRRD from S3
and writes one ZIP: implant.nrrd (binary, freeze threshold, no voxel on source bone), probability.nrrd
(uint8, round(p * 255)) and metadata.json. Both volumes are on the input's exact grid.
"""
import io
import json
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np
import SimpleITK as sitk
import torch

_here = Path(__file__).resolve().parent
for candidate in (_here, _here.parent):  # flat code/ dir in the container; ml/cranial/ in the repo
    if (candidate / 'predict.py').is_file() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from predict import load_inference_model, predict_single, verify_freeze  # noqa: E402

MODEL_NAME = 'cranial-unet-v2'


def model_fn(model_dir):
    """Load once per instance. Refuses to serve when the checkpoint hash differs from the freeze file."""
    model_dir = Path(model_dir)
    freeze = verify_freeze(model_dir / 'model.pt', model_dir / 'freeze.json')
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    return {'model': load_inference_model(model_dir / 'model.pt', device), 'device': device, 'freeze': freeze}


def input_fn(body, content_type):
    if content_type not in ('application/octet-stream', 'application/x-nrrd'):
        raise ValueError(f'Unsupported content type: {content_type}')
    return bytes(body)


def _write_bytes(image):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'volume.nrrd'
        sitk.WriteImage(image, str(path), True)
        return path.read_bytes()


def predict_fn(nrrd_bytes, context):
    started = time.monotonic()
    freeze = context['freeze']
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'input.nrrd'
        path.write_bytes(nrrd_bytes)
        implant, meta, probability = predict_single(
            path, context['model'], context['device'], threshold=freeze['threshold'],
            preprocessing=freeze['preprocessing'], return_probability=True)
    quantized = sitk.GetImageFromArray(
        np.clip(np.rint(sitk.GetArrayFromImage(probability) * 255.0), 0, 255).astype(np.uint8))
    quantized.CopyInformation(probability)
    implant = sitk.Cast(implant, sitk.sitkUInt8)
    return {
        'implant': _write_bytes(implant),
        'probability': _write_bytes(quantized),
        'metadata': {'model': MODEL_NAME, 'checkpoint_hash': freeze['checkpoint_hash'],
                     'freeze_run_id': freeze.get('run_id', ''), 'threshold': freeze['threshold'],
                     'implant_voxels': meta['candidate_voxels'],
                     'inference_seconds': round(time.monotonic() - started, 3)},
    }


def output_fn(outputs, accept):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('implant.nrrd', outputs['implant'])
        archive.writestr('probability.nrrd', outputs['probability'])
        archive.writestr('metadata.json', json.dumps(outputs['metadata']))
    return buffer.getvalue(), 'application/zip'
