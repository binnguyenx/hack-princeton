"""SageMaker inference handler contract (cranial-reconstruction-candidate R1, R2, S1); CPU only, no AWS."""
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest
import SimpleITK as sitk
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'serve'))
import inference  # noqa: E402
from predict import sha256_file  # noqa: E402
from train import build_model  # noqa: E402


def write_model_dir(directory, *, tamper=False):
    """Real U-Net whose output bias is large, so every non-bone voxel is predicted (non-empty, deterministic)."""
    torch.manual_seed(0)
    model = build_model(torch.device('cpu'))
    state = model.state_dict()
    last_bias = [key for key in state if key.endswith('bias')][-1]
    state[last_bias].fill_(20.0)
    checkpoint = directory / 'model.pt'
    torch.save({'model_state_dict': state}, checkpoint)
    freeze = {'checkpoint_hash': sha256_file(checkpoint), 'threshold': 0.5, 'run_id': 'run_test', 'frozen': True,
              'preprocessing': {'target_spacing': [2.0, 2.0, 2.0], 'target_shape': [32, 32, 32], 'convert_to_ras': False},
              'postprocessing': {'exclude_source_bone': True, 'reject_empty': True}}
    if tamper:
        freeze['checkpoint_hash'] = 'sha256:' + '0' * 64
    (directory / 'freeze.json').write_text(json.dumps(freeze))
    return directory


def skull_nrrd():
    """40^3 mm shell at 1 mm spacing with a non-trivial origin."""
    z, y, x = np.mgrid[:40, :40, :40]
    radius = np.sqrt((x - 20) ** 2 + (y - 20) ** 2 + (z - 20) ** 2)
    image = sitk.GetImageFromArray(((radius > 12) & (radius < 15) & (x < 30)).astype(np.uint8))
    image.SetOrigin((5.0, -3.0, 2.0))
    image.SetSpacing((1.0, 1.0, 1.0))
    return image


def to_bytes(image, directory):
    path = directory / 'input.nrrd'
    sitk.WriteImage(image, str(path), True)
    return path.read_bytes()


def read(data, directory, name):
    path = directory / name
    path.write_bytes(data)
    return sitk.ReadImage(str(path))


def test_model_fn_refuses_checkpoint_whose_hash_differs_from_freeze(tmp_path):
    model_dir = write_model_dir(tmp_path, tamper=True)
    with pytest.raises(ValueError, match='SHA256 mismatch'):
        inference.model_fn(str(model_dir))


def test_outputs_implant_probability_and_metadata_on_the_input_grid(tmp_path):
    context = inference.model_fn(str(write_model_dir(tmp_path)))
    source = skull_nrrd()
    body = to_bytes(source, tmp_path)
    payload, content_type = inference.output_fn(
        inference.predict_fn(inference.input_fn(body, 'application/octet-stream'), context), 'application/zip')
    assert content_type == 'application/zip'
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        assert sorted(archive.namelist()) == ['implant.nrrd', 'metadata.json', 'probability.nrrd']
        implant = read(archive.read('implant.nrrd'), tmp_path, 'implant.nrrd')
        probability = read(archive.read('probability.nrrd'), tmp_path, 'probability.nrrd')
        metadata = json.loads(archive.read('metadata.json'))
    for image in (implant, probability):
        assert image.GetSize() == source.GetSize()
        assert image.GetSpacing() == pytest.approx(source.GetSpacing())
        assert image.GetOrigin() == pytest.approx(source.GetOrigin())
        assert image.GetDirection() == pytest.approx(source.GetDirection())
        assert image.GetPixelID() == sitk.sitkUInt8
    bone = sitk.GetArrayFromImage(source).astype(bool)
    fix = sitk.GetArrayFromImage(implant)
    prob = sitk.GetArrayFromImage(probability)
    assert set(np.unique(fix)) <= {0, 1} and fix.any()
    assert not (fix.astype(bool) & bone).any()
    assert (prob[fix == 1] >= 0.5 * 255 - 1).all()
    assert metadata['checkpoint_hash'] == sha256_file(tmp_path / 'model.pt')
    assert (metadata['freeze_run_id'], metadata['threshold']) == ('run_test', 0.5)
    assert metadata['model'] and metadata['inference_seconds'] >= 0
