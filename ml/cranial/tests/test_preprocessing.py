"""
tests/test_preprocessing.py — Unit tests for the preprocessing pipeline
========================================================================
Tests that do NOT require real data. They build synthetic images and
verify the transform behaves correctly.

Run with:
    python -m pytest ml/cranial/tests/test_preprocessing.py -v
"""

import sys
import numpy as np
import pytest
import SimpleITK as sitk

sys.path.insert(0, str(__file__).replace("/tests/test_preprocessing.py", ""))
from prepare_data import (
    lps_to_ras,
    resample_to_spacing,
    pad_to_shape,
    preprocess_pair,
    validate_binary_mask,
    check_partition_integrity,
    build_subject_split,
)


def make_binary_image(shape=(64, 64, 64), spacing=(0.4, 0.4, 0.4), fill_ratio=0.1):
    """Make a synthetic binary NRRD-like sitk.Image with some 1s inside."""
    arr = np.zeros(shape, dtype=np.uint8)
    # Fill a central cube
    s = [int(d * fill_ratio) for d in shape]
    c = [d // 2 for d in shape]
    arr[
        c[0]-s[0]//2 : c[0]+s[0]//2,
        c[1]-s[1]//2 : c[1]+s[1]//2,
        c[2]-s[2]//2 : c[2]+s[2]//2,
    ] = 1
    img = sitk.GetImageFromArray(arr)
    img.SetSpacing(spacing)
    img.SetOrigin((0.0, 0.0, 0.0))
    img.SetDirection((1,0,0, 0,1,0, 0,0,1))
    return img


# ---------------------------------------------------------------------------

class TestValidation:
    def test_accepts_binary(self):
        img = make_binary_image()
        validate_binary_mask(img, "test")  # should not raise

    def test_rejects_non_binary(self):
        arr = np.array([[[0, 2, 1]]], dtype=np.uint8)
        img = sitk.GetImageFromArray(arr)
        with pytest.raises(ValueError, match="non-binary"):
            validate_binary_mask(img, "test")

    def test_rejects_empty(self):
        arr = np.zeros((4, 4, 4), dtype=np.uint8)
        img = sitk.GetImageFromArray(arr)
        with pytest.raises(ValueError, match="empty"):
            validate_binary_mask(img, "test")


class TestLpsToRas:
    def test_axes_flipped(self):
        """After LPS→RAS, axes x and y of the SimpleITK image are flipped."""
        arr = np.zeros((4, 4, 4), dtype=np.uint8)
        arr[0, 0, 0] = 1
        img = sitk.GetImageFromArray(arr)
        flipped = lps_to_ras(img)
        arr_out = sitk.GetArrayFromImage(flipped)
        # In numpy (z,y,x): SimpleITK flips x and y (leaving z alone), so index [0,0,0] -> [0,3,3]
        assert arr_out[0, 3, 3] == 1, "LPS→RAS did not flip axes correctly"

    def test_idempotent_when_applied_once(self):
        """Applying lps_to_ras once should change the image; applying it twice should restore it."""
        img = make_binary_image(shape=(8, 8, 8))
        once  = lps_to_ras(img)
        twice = lps_to_ras(once)
        orig_arr  = sitk.GetArrayFromImage(img)
        twice_arr = sitk.GetArrayFromImage(twice)
        np.testing.assert_array_equal(orig_arr, twice_arr,
                                       err_msg="Double LPS→RAS did not restore original")


class TestResample:
    def test_output_spacing(self):
        img = make_binary_image(shape=(51, 51, 51), spacing=(0.4, 0.4, 0.4))
        target = [1.0, 1.0, 1.0]
        resampled = resample_to_spacing(img, target)
        for s, e in zip(resampled.GetSpacing(), target):
            assert abs(s - e) < 1e-5, f"Spacing {s} != expected {e}"

    def test_output_size_approx(self):
        """With 0.4mm spacing and 50 voxels → 20mm → ~20 voxels at 1mm."""
        img = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        resampled = resample_to_spacing(img, [1.0, 1.0, 1.0])
        for s in resampled.GetSize():
            assert 18 <= s <= 22, f"Expected ~20 voxels, got {s}"


class TestPadding:
    def test_pads_to_target(self):
        img = make_binary_image(shape=(20, 20, 20), spacing=(1.0, 1.0, 1.0))
        padded, offset = pad_to_shape(img, [32, 32, 32])
        assert padded.GetSize() == (32, 32, 32)

    def test_offset_is_symmetric(self):
        img = make_binary_image(shape=(20, 20, 20), spacing=(1.0, 1.0, 1.0))
        _, offset = pad_to_shape(img, [32, 32, 32])
        # 32-20=12 → lower=6, upper=6
        for o in offset:
            assert o == 6, f"Expected symmetric offset 6, got {o}"

    def test_rejects_oversized(self):
        img = make_binary_image(shape=(300, 300, 300), spacing=(1.0, 1.0, 1.0))
        with pytest.raises(ValueError, match="exceeds target"):
            pad_to_shape(img, [256, 256, 256], reject_oversized=True)


class TestPreprocessPair:
    @pytest.fixture
    def cfg(self):
        return {
            "preprocessing": {
                "target_spacing": [1.0, 1.0, 1.0],
                "target_shape":   [256, 256, 256],
                "convert_to_ras": True,
                "reject_oversized": True,
            }
        }

    def test_output_shape(self, cfg):
        defect  = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        implant = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4), fill_ratio=0.05)
        d_out, i_out, meta = preprocess_pair(defect, implant, cfg)
        assert d_out.GetSize() == (256, 256, 256)
        assert i_out.GetSize() == (256, 256, 256)

    def test_output_uint8(self, cfg):
        defect  = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        implant = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        d_out, i_out, meta = preprocess_pair(defect, implant, cfg)
        assert d_out.GetPixelID() == sitk.sitkUInt8
        assert i_out.GetPixelID() == sitk.sitkUInt8

    def test_meta_has_required_fields(self, cfg):
        defect  = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        implant = make_binary_image(shape=(50, 50, 50), spacing=(0.4, 0.4, 0.4))
        _, _, meta = preprocess_pair(defect, implant, cfg)
        assert meta.orig_spacing == list(defect.GetSpacing())
        assert meta.final_shape  == [256, 256, 256]
        assert meta.reindexed_axes_ras is True
        assert len(meta.pad_offset) == 3

    def test_implant_preprocessed_with_defect_params(self, cfg):
        """Implant must use defect-derived spatial params, not its own."""
        defect  = make_binary_image(shape=(60, 60, 60), spacing=(0.4, 0.4, 0.4))
        implant = make_binary_image(shape=(60, 60, 60), spacing=(0.4, 0.4, 0.4))
        d_out, i_out, _ = preprocess_pair(defect, implant, cfg)
        # Both must end up with the same size
        assert d_out.GetSize() == i_out.GetSize()
        for ds, is_ in zip(d_out.GetSpacing(), i_out.GetSpacing()):
            assert abs(ds - is_) < 1e-5


class TestRoundTrip:
    def test_physical_origin_preserved(self):
        """The origin of the processed image should be offset by pad_offset * spacing."""
        cfg = {
            "preprocessing": {
                "target_spacing": [1.0, 1.0, 1.0],
                "target_shape":   [64, 64, 64],
                "convert_to_ras": False,   # skip RAS for a pure geometry test
                "reject_oversized": False,
            }
        }
        defect  = make_binary_image(shape=(30, 30, 30), spacing=(1.0, 1.0, 1.0))
        implant = make_binary_image(shape=(30, 30, 30), spacing=(1.0, 1.0, 1.0))
        d_out, _, meta = preprocess_pair(defect, implant, cfg)

        expected_origin = [
            orig_o - pad_o * sp
            for orig_o, pad_o, sp in zip(meta.orig_origin, meta.pad_offset, [1.0, 1.0, 1.0])
        ]
        actual_origin = list(d_out.GetOrigin())
        for expected, actual in zip(expected_origin, actual_origin):
            assert abs(expected - actual) < 0.1, (
                f"Origin mismatch: expected {expected:.3f}, got {actual:.3f}"
            )


class TestSplit:
    def test_no_overlap(self):
        all_ids  = [f"subj_{i:03d}" for i in range(114)]
        eval_ids = [f"subj_{i:03d}" for i in range(100, 114)]  # last 14 are eval
        part = build_subject_split(all_ids, eval_ids, [], 0.80, seed=42)
        cases = [{"subject_id": sid, "split_dir": "eval" if sid in eval_ids else "train"} for sid in all_ids]
        assert check_partition_integrity(cases, part)
        # Confirm eval subjects go to test
        for sid in eval_ids:
            assert part[sid] == "test", f"{sid} should be test"

    def test_reserved_excluded_from_train_val(self):
        all_ids   = [f"subj_{i:03d}" for i in range(100)]
        reserved  = [f"subj_0{i:02d}" for i in range(5)]
        part = build_subject_split(all_ids, [], reserved, 0.80, seed=42)
        for sid in reserved:
            assert part[sid] == "reserved"

    def test_train_fraction(self):
        all_ids = [f"subj_{i:03d}" for i in range(100)]
        part = build_subject_split(all_ids, [], [], 0.80, seed=42)
        train_count = sum(1 for v in part.values() if v == "train")
        val_count   = sum(1 for v in part.values() if v == "val")
        # 80 train, 20 val (from 100 non-eval, non-reserved subjects)
        assert 75 <= train_count <= 85, f"Expected ~80 train, got {train_count}"
        assert 15 <= val_count   <= 25, f"Expected ~20 val, got {val_count}"
