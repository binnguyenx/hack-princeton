#!/usr/bin/env python3
"""Convert one CT DICOM series folder to an int16 HU NRRD + JSON sidecar on stdout.

Usage:
  python dicomToNrrd.py <input_dir> <output.nrrd>

Exit nonzero on multi-series, empty, oversized, or unreadable input.
Requires SimpleITK (and optionally pydicom for SeriesInstanceUID counting).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MAX_SLICES = 800
MAX_BYTES = 256 * 1024 * 1024  # 256 MiB uncompressed int16 budget


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    sys.exit(code)


def list_dicom_files(input_dir: Path) -> list[Path]:
    files = sorted(
        p
        for p in input_dir.iterdir()
        if p.is_file() and not p.name.startswith(".")
    )
    return files


def count_series_uids(files: list[Path]) -> set[str]:
    try:
        import pydicom
    except ImportError:
        return set()
    uids: set[str] = set()
    for path in files:
        try:
            ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        uid = getattr(ds, "SeriesInstanceUID", None)
        if uid:
            uids.add(str(uid))
    return uids


def main(argv: list[str]) -> None:
    if len(argv) != 3:
        fail("Usage: dicomToNrrd.py <input_dir> <output.nrrd>")

    input_dir = Path(argv[1])
    output_nrrd = Path(argv[2])
    if not input_dir.is_dir():
        fail(f"Input is not a directory: {input_dir}")

    files = list_dicom_files(input_dir)
    if not files:
        fail("No files in DICOM directory")

    series_uids = count_series_uids(files)
    if len(series_uids) > 1:
        fail(
            f"Multiple SeriesInstanceUIDs in folder ({len(series_uids)}); "
            "import requires a single series"
        )

    try:
        import SimpleITK as sitk
    except ImportError:
        fail(
            "SimpleITK is required. Use app/cranial-env/bin/python "
            "or: pip install SimpleITK"
        )

    reader = sitk.ImageSeriesReader()
    try:
        series_ids = reader.GetGDCMSeriesIDs(str(input_dir))
    except Exception as exc:  # noqa: BLE001 — surface tool error
        fail(f"Failed to list DICOM series: {exc}")

    if not series_ids:
        fail("No readable DICOM series found")
    if len(series_ids) > 1:
        fail(
            f"Multiple series in folder ({len(series_ids)}); "
            "import requires a single series"
        )

    file_names = reader.GetGDCMSeriesFileNames(str(input_dir), series_ids[0])
    if not file_names:
        fail("Series has no readable instances")
    if len(file_names) > MAX_SLICES:
        fail(f"Series has {len(file_names)} slices; max allowed is {MAX_SLICES}")

    reader.SetFileNames(file_names)
    reader.MetaDataDictionaryArrayUpdateOn()
    reader.LoadPrivateTagsOn()
    try:
        image = reader.Execute()
    except Exception as exc:  # noqa: BLE001
        fail(f"SimpleITK could not build one scalar volume: {exc}")

    # Cast to signed 16-bit; RescaleSlope/Intercept applied by SimpleITK when present.
    image = sitk.Cast(image, sitk.sitkInt16)

    size = list(image.GetSize())  # x, y, z
    spacing = list(image.GetSpacing())
    origin = list(image.GetOrigin())
    direction = list(image.GetDirection())
    voxel_count = int(size[0] * size[1] * size[2])
    if voxel_count * 2 > MAX_BYTES:
        fail(
            f"Uncompressed int16 volume would be {voxel_count * 2} bytes; "
            f"max allowed is {MAX_BYTES}"
        )

    output_nrrd.parent.mkdir(parents=True, exist_ok=True)
    sitk.WriteImage(image, str(output_nrrd))

    finite_sizes = all(isinstance(v, (int, float)) and v > 0 for v in size)
    positive_spacings = all(
        isinstance(v, (int, float)) and v > 0 and v == v for v in spacing
    )
    origin_ok = all(isinstance(v, (int, float)) and v == v for v in origin)
    direction_ok = (
        len(direction) == 9
        and all(isinstance(v, (int, float)) and v == v for v in direction)
    )
    spatially_verified = bool(
        finite_sizes and positive_spacings and origin_ok and direction_ok
    )
    reason = None
    if not spatially_verified:
        reason = "incomplete or non-finite spatial metadata from series"

    meta = {
        "type": "short",
        "sizes": size,
        "spacings": spacing,
        "origin": origin,
        "direction": direction,
        "space": "LPS",
        "spatiallyVerified": spatially_verified,
        "spatialReason": reason,
        "voxelCount": voxel_count,
        "sliceCount": len(file_names),
        "seriesInstanceUID": series_ids[0],
    }
    print(json.dumps(meta))


if __name__ == "__main__":
    main(sys.argv)
