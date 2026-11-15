#!/usr/bin/env python3
"""Regenerate synthetic DICOM fixtures (no PHI). Requires pydicom + numpy."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

HERE = Path(__file__).resolve().parent


def write_slice(
    path: Path,
    *,
    study_uid: str,
    series_uid: str,
    instance: int,
    z_mm: float,
    bone_hu: int,
) -> None:
    size = 8
    arr = np.full((size, size), -1000, dtype=np.int16)
    arr[2:6, 2:6] = 40
    arr[3:5, 3:5] = bone_hu
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()
    ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.SOPClassUID = CTImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = study_uid
    ds.SeriesInstanceUID = series_uid
    ds.Modality = "CT"
    ds.SeriesNumber = 1
    ds.InstanceNumber = instance
    ds.PatientName = "Synthetic^Fixture"
    ds.PatientID = "FIXTURE-001"
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows = size
    ds.Columns = size
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 1
    ds.RescaleIntercept = 0
    ds.RescaleSlope = 1
    ds.PixelSpacing = [1.0, 1.0]
    ds.SliceThickness = 1.0
    ds.SpacingBetweenSlices = 1.0
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.ImagePositionPatient = [0.0, 0.0, z_mm]
    ds.FrameOfReferenceUID = generate_uid()
    ds.PixelData = arr.tobytes()
    ds.save_as(str(path), write_like_original=False)


def main() -> None:
    tiny = HERE / "dicom-series-tiny"
    tiny.mkdir(parents=True, exist_ok=True)
    for old in tiny.glob("*.dcm"):
        old.unlink()
    study = generate_uid()
    series = generate_uid()
    for z in range(4):
        write_slice(
            tiny / f"slice_{z:03d}.dcm",
            study_uid=study,
            series_uid=series,
            instance=z + 1,
            z_mm=float(z),
            bone_hu=800 + z,
        )

    two = HERE / "dicom-series-two"
    two.mkdir(parents=True, exist_ok=True)
    for old in two.glob("*.dcm"):
        old.unlink()
    for prefix, series_uid in (("a", generate_uid()), ("b", generate_uid())):
        study = generate_uid()
        for z in range(2):
            write_slice(
                two / f"{prefix}_{z:03d}.dcm",
                study_uid=study,
                series_uid=series_uid,
                instance=z + 1,
                z_mm=float(z),
                bone_hu=800,
            )
    print(f"wrote {tiny} and {two}")


if __name__ == "__main__":
    main()
