"""Regression checks for the training-to-source-grid pipeline; no AWS or GPU."""
import sys
from pathlib import Path

import numpy as np
import pytest
import SimpleITK as sitk
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_data import preprocess_pair
from predict import preprocess_for_inference, invert_to_source_grid


def test_dice_loss_preserves_gradient_with_half_precision_volume():
    from train import build_loss
    # At probability 0.5, 64^3 voxels already exceed float16's sum limit.
    target = torch.zeros((1, 1, 64, 64, 64))
    target[:, :, :8, :8, :8] = 1
    logits = torch.zeros_like(target, dtype=torch.float16, requires_grad=True)
    reference_logits = logits.detach().float().requires_grad_(True)
    loss_fn = build_loss('dice')
    reference = loss_fn(reference_logits, target)
    actual = loss_fn(logits, target)
    assert actual.item() == pytest.approx(reference.item(), abs=1e-6)
    actual.backward()
    reference.backward()
    assert torch.isfinite(logits.grad).all()
    assert logits.grad[0, 0, 0, 0, 0] < 0
    torch.testing.assert_close(logits.grad.float(), reference_logits.grad, atol=3e-8, rtol=0.01)


def test_pilot_rejects_nonfinite_logits_before_optimizer_update():
    from train import run_pilot, build_loss
    model = torch.nn.Conv3d(1, 1, 1)
    with torch.no_grad():
        model.weight.fill_(float('nan'))
    optimizer = torch.optim.AdamW(model.parameters())
    loader = torch.utils.data.DataLoader([
        {'defect': torch.ones(1, 4, 4, 4), 'implant': torch.ones(1, 4, 4, 4)}
    ])
    with pytest.raises(RuntimeError, match='Non-finite pilot'):
        run_pilot(model, loader, build_loss(), optimizer,
                  torch.cuda.amp.GradScaler(enabled=False), torch.device('cpu'),
                  False, max_epochs=1)
    assert not optimizer.state


def test_pilot_passes_on_best_dice_and_stops_when_patience_expires(caplog):
    """Gate uses peak Dice; declining after the peak must not keep burning epochs."""
    import logging
    from train import run_pilot

    class ScriptedDiceModel(torch.nn.Module):
        def __init__(self, dice_schedule):
            super().__init__()
            self.bias = torch.nn.Parameter(torch.zeros(1))
            self.dice_schedule = list(dice_schedule)
            self.eval_calls = 0

        def forward(self, x):
            # Constant logits during train steps; evaluation path is patched below.
            return x * 0 + self.bias

    schedule = [0.10, 0.40, 0.20, 0.15, 0.10]  # peak 0.40 at epoch 2
    model = ScriptedDiceModel(schedule)
    optimizer = torch.optim.SGD(model.parameters(), lr=0.0)
    loader = torch.utils.data.DataLoader([
        {'defect': torch.ones(1, 1, 4, 4, 4), 'implant': torch.ones(1, 1, 4, 4, 4)}
    ])

    import train as train_mod
    original = train_mod.compute_implant_dice

    def fake_dice(logits, targets, threshold=0.5):
        idx = min(model.eval_calls, len(schedule) - 1)
        model.eval_calls += 1
        return schedule[idx]

    train_mod.compute_implant_dice = fake_dice
    try:
        with caplog.at_level(logging.INFO):
            passed = run_pilot(
                model, loader, lambda lg, tg: (lg * 0).sum() + 0.99,
                optimizer, torch.cuda.amp.GradScaler(enabled=False),
                torch.device('cpu'), False,
                max_epochs=20, target_dice=0.90, patience=2,
            )
    finally:
        train_mod.compute_implant_dice = original

    assert passed is False
    assert model.eval_calls == 4  # epochs 1..4 then patience stop (peak at 2, +2)
    assert any('best Dice=0.4000' in r.message for r in caplog.records)
    assert any('early stop' in r.message for r in caplog.records)


def asymmetric_mask():
    a = np.zeros((16, 16, 16), dtype=np.uint8)
    a[2:5, 4:7, 8:11] = 1
    img = sitk.GetImageFromArray(a)
    img.SetOrigin((13, -7, 5))
    return img


def test_inference_matches_preparation_and_restores_source_grid():
    source = asymmetric_mask()
    cfg = {'preprocessing': {'target_spacing': [1., 1., 1.],
           'target_shape': [32, 32, 32], 'convert_to_ras': False}}
    prepared, _, _ = preprocess_pair(source, source, cfg)
    actual, inverse = preprocess_for_inference(source, target_shape=(32, 32, 32))
    np.testing.assert_array_equal(sitk.GetArrayFromImage(actual), sitk.GetArrayFromImage(prepared))
    restored = invert_to_source_grid(sitk.GetArrayFromImage(actual).astype(np.float32), inverse)
    assert restored.GetOrigin() == source.GetOrigin()
    assert restored.GetDirection() == source.GetDirection()
    assert restored.GetSpacing() == source.GetSpacing()
    np.testing.assert_array_equal(sitk.GetArrayFromImage(restored), sitk.GetArrayFromImage(source))


def test_freeze_requires_explicit_preprocessing_and_matching_checkpoint(tmp_path):
    import json
    from predict import verify_freeze, sha256_file
    checkpoint = tmp_path / 'best.pt'
    checkpoint.write_bytes(b'checkpoint')
    freeze_path = tmp_path / 'freeze.json'
    freeze = {'frozen': True, 'checkpoint_hash': sha256_file(checkpoint), 'threshold': 0.5}
    freeze_path.write_text(json.dumps(freeze))
    with pytest.raises(ValueError, match='preprocessing'):
        verify_freeze(checkpoint, freeze_path)
    freeze.update(preprocessing={'target_spacing': [1., 1., 1.],
                  'target_shape': [32, 32, 32], 'convert_to_ras': False},
                  postprocessing={'exclude_source_bone': True, 'reject_empty': True})
    freeze_path.write_text(json.dumps(freeze))
    assert verify_freeze(checkpoint, freeze_path)['preprocessing']['convert_to_ras'] is False
    checkpoint.write_bytes(b'wrong checkpoint')
    with pytest.raises(ValueError, match='mismatch'):
        verify_freeze(checkpoint, freeze_path)


def test_prediction_uses_config_and_preserves_grid_without_source_overlap(tmp_path):
    from predict import predict_single
    source = asymmetric_mask()
    path = tmp_path / 'defect.nrrd'
    sitk.WriteImage(source, str(path))
    # A known spatial predictor moves bone one voxel in x; only the new face survives cleanup.
    model = torch.nn.Conv3d(1, 1, 3, padding=1)
    with torch.no_grad():
        model.weight.zero_()
        model.weight[0, 0, 1, 1, 0] = 10
        model.bias.fill_(-5)
    pp = {'target_spacing': [1., 1., 1.], 'target_shape': [32, 32, 32], 'convert_to_ras': False}
    candidate, meta = predict_single(path, model, torch.device('cpu'), preprocessing=pp)
    expected = np.zeros((16, 16, 16), dtype=np.uint8)
    expected[2:5, 4:7, 11] = 1
    np.testing.assert_array_equal(sitk.GetArrayFromImage(candidate), expected)
    assert candidate.GetOrigin() == source.GetOrigin()
    assert meta['preprocessing'] == pp
    assert not np.any(sitk.GetArrayFromImage(candidate) & sitk.GetArrayFromImage(source))


def write_pair(directory, name='case', reindex=False):
    import json
    from dataclasses import asdict
    directory.mkdir(parents=True, exist_ok=True)
    cfg = {'preprocessing': {'target_spacing': [1., 1., 1.],
           'target_shape': [32, 32, 32], 'convert_to_ras': reindex}}
    defect, implant, meta = preprocess_pair(asymmetric_mask(), asymmetric_mask(), cfg)
    for kind, img in [('defect', defect), ('implant', implant)]:
        sitk.WriteImage(img, str(directory / f'{name}_{kind}.nrrd'))
    (directory / f'{name}_meta.json').write_text(json.dumps(asdict(meta)))


def test_dataset_records_actual_preprocessing_and_rejects_mixed_cache(tmp_path):
    from train import SkullDataset
    write_pair(tmp_path)
    ds = SkullDataset(str(tmp_path))
    assert ds.preprocessing == {'target_spacing': [1., 1., 1.],
                                'target_shape': [32, 32, 32], 'convert_to_ras': False}
    write_pair(tmp_path, name='other', reindex=True)
    with pytest.raises(ValueError, match='preprocessing'):
        SkullDataset(str(tmp_path))


def test_full_training_pilot_always_reads_fixed_unaugmented_cases(tmp_path):
    from train import SkullDataset, make_pilot_loader
    write_pair(tmp_path)
    ds = SkullDataset(str(tmp_path))
    # A deterministic spatial augmentation makes accidental sharing observable.
    ds._aug = lambda sample: {k: torch.flip(v, [1]) for k, v in sample.items()}
    expected = SkullDataset(str(tmp_path))[0]['defect']
    for batch in make_pilot_loader(ds, 1):
        torch.testing.assert_close(batch['defect'][0], expected)
    assert not torch.equal(ds[0]['defect'], expected)


@pytest.mark.parametrize('failure', ['empty', 'nonfinite', 'truncated'])
def test_invalid_predictions_are_rejected(tmp_path, failure):
    from predict import predict_single
    path = tmp_path / 'defect.nrrd'
    sitk.WriteImage(asymmetric_mask(), str(path))
    model = torch.nn.Conv3d(1, 1, 1, stride=2 if failure == 'truncated' else 1)
    with torch.no_grad():
        model.weight.zero_()
        model.bias.fill_(float('nan') if failure == 'nonfinite' else -100)
    pp = {'target_spacing': [1., 1., 1.], 'target_shape': [32, 32, 32], 'convert_to_ras': False}
    with pytest.raises(ValueError, match={'empty': 'empty', 'nonfinite': 'finite', 'truncated': 'shape'}[failure]):
        predict_single(path, model, torch.device('cpu'), preprocessing=pp)


def test_boundary_band_excludes_distant_false_positives():
    from evaluate import compute_boundary_dice
    gt = np.zeros((20, 20, 20), dtype=np.uint8)
    gt[8:12, 8:12, 8:12] = 1
    pred = gt.copy()
    pred[0, 0, 0] = 1
    assert compute_boundary_dice(pred, gt, (1, 1, 1)) == 1.0


def test_audit_detects_overlap_in_csv_and_origin_mismatch():
    import pandas as pd
    from audit_data import check_subject_partition_exclusivity, check_physical_consistency, CaseAuditError
    df = pd.DataFrame({'subject_id': ['same', 'same'], 'partition': ['train', 'val'], 'error': [np.nan, np.nan]})
    assert check_subject_partition_exclusivity(df)
    a, b = asymmetric_mask(), asymmetric_mask()
    b.SetOrigin((0, 0, 0))
    with pytest.raises(CaseAuditError):
        check_physical_consistency(a, b)


def test_real_unet_training_step_and_checkpoint_restore(tmp_path):
    from train import build_model, build_loss, save_checkpoint, load_checkpoint
    torch.set_num_threads(1)
    device = torch.device('cpu')
    model = build_model(device)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-4)
    scaler = torch.cuda.amp.GradScaler(enabled=False)
    x = torch.zeros(1, 1, 32, 32, 32)
    x[:, :, 8:12, 8:12, 8:12] = 1
    before = next(model.parameters()).detach().clone()
    loss = build_loss()(model(x), x)
    assert torch.isfinite(loss)
    loss.backward()
    assert all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None)
    opt.step()
    assert not torch.equal(before, next(model.parameters()))
    expected = next(model.parameters()).detach().clone()
    path = tmp_path / 'latest.pt'
    save_checkpoint(path, model, opt, scaler, 3, 0.7, {})
    with torch.no_grad():
        next(model.parameters()).zero_()
    assert load_checkpoint(path, model, opt, scaler, device) == (4, 0.7)
    torch.testing.assert_close(next(model.parameters()), expected)


def test_real_augmentation_preserves_pair_alignment(tmp_path):
    from train import SkullDataset
    write_pair(tmp_path)
    dataset = SkullDataset(str(tmp_path), augment=True)
    for _ in range(3):
        sample = dataset[0]
        torch.testing.assert_close(sample['defect'], sample['implant'])
