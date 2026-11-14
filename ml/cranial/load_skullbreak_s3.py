"""Download the SkullBreak archives, verify them, upload the originals to S3
and unpack them under /tmp/skullbreak for local work.

Setup:
    pip install boto3 python-dotenv
    S3_BUCKET=your-bucket-name   (in a .env file, or exported in the shell)
    AWS credentials configured    (aws configure, or AWS_* environment variables)

Run:
    python3 ml/cranial/load_skullbreak_s3.py

Source: Zenodo record 20308764 (SkullBreak, Kodym et al.), licence CC BY-NC-SA 4.0
plus the CQ500 EULA (non-commercial use). Cite Kodym et al., Data in Brief 35, 106902.
"""
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from collections import Counter
from pathlib import Path

import boto3

# Ensure .env is loaded from the project root
try:
    from dotenv import load_dotenv, find_dotenv

    # Find .env by traversing up from this script's directory
    env_file = find_dotenv(filename=".env", usecwd=True)
    if not env_file:
        # Fallback to project root relative to this file
        env_file = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_file)
    print(f"Loaded environment from: {env_file}")
except ImportError:
    pass  # python-dotenv not installed; assumes env vars already present

BUCKET = os.environ.get("S3_BUCKET", "YOUR_BUCKET_NAME")
AWS_KEY = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_TOKEN = os.environ.get("AWS_SESSION_TOKEN")
AWS_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
S3_PREFIX = "raw/skullbreak"
WORK = Path("/tmp/skullbreak_raw")
OUT = Path("/tmp/skullbreak")
MIN_FREE_BYTES = 5 * 10**9  # archives total about 309 MB; leave room for unpacking

ZENODO = "https://zenodo.org/records/20308764/files"
ARCHIVES = {
    "skullbreak_training.zip": {
        "url": f"{ZENODO}/skullbreak_training.zip?download=1",
        "md5": "1389265482e37ec2e403ea57649e8afb",
        "folder": "train",
        "expected_nrrd": 114 + 570 + 570,
    },
    "skullbreak_evaluation.zip": {
        "url": f"{ZENODO}/skullbreak_evaluation.zip?download=1",
        "md5": "9681f6771c35faab8288f4b1bf02ee27",
        "folder": "evaluation",
        "expected_nrrd": 20 + 100 + 100,
    },
}


def file_hashes(path):
    md5, sha = hashlib.md5(), hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            md5.update(chunk)
            sha.update(chunk)
    return md5.hexdigest(), sha.hexdigest()


def report(out_dir, expected):
    files = list(out_dir.rglob("*.nrrd"))
    groups = Counter(str(f.parent.relative_to(out_dir)) for f in files)
    print(f"  {len(files)} NRRD files found (expected {expected})")
    for name, count in sorted(groups.items()):
        print(f"    {name}: {count}")
    if len(files) != expected:
        print("  WARNING: count differs from the dataset description. Check the folders above.")


def main():
    if BUCKET == "YOUR_BUCKET_NAME":
        raise SystemExit("Set the S3_BUCKET environment variable to your bucket name first.")
    if shutil.which("curl") is None:
        raise SystemExit("curl is required but was not found on PATH.")

    free = shutil.disk_usage("/tmp").free
    print(f"Free space in /tmp: {free / 1e9:.1f} GB")
    if free < MIN_FREE_BYTES:
        raise SystemExit("Less than 5 GB free in /tmp. Free some space and run again.")

    s3_kwargs = {"region_name": AWS_REGION}
    if AWS_KEY and AWS_SECRET:
        s3_kwargs["aws_access_key_id"] = AWS_KEY
        s3_kwargs["aws_secret_access_key"] = AWS_SECRET
    if AWS_TOKEN:
        s3_kwargs["aws_session_token"] = AWS_TOKEN

    s3 = boto3.client("s3", **s3_kwargs)
    WORK.mkdir(parents=True, exist_ok=True)

    checksums = {}
    for name, info in ARCHIVES.items():
        zpath = WORK / name
        print(f"Downloading {name} ...")
        subprocess.run(
            ["curl", "-L", "--fail", "-C", "-", "-o", str(zpath), info["url"]],
            check=True,
        )

        md5, sha = file_hashes(zpath)
        if md5 != info["md5"]:
            raise SystemExit(
                f"MD5 mismatch for {name}: got {md5}, expected {info['md5']}. "
                "Delete the file and run again."
            )
        print(f"  md5 matches Zenodo's listing. sha256 {sha}")
        checksums[name] = {
            "url": info["url"],
            "md5": md5,
            "sha256": sha,
            "bytes": zpath.stat().st_size,
        }

        print(f"  uploading to s3://{BUCKET}/{S3_PREFIX}/{name} ...")
        s3.upload_file(str(zpath), BUCKET, f"{S3_PREFIX}/{name}")

        out_dir = OUT / info["folder"]
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"  unzipping to {out_dir} ...")
        with zipfile.ZipFile(zpath) as z:
            z.extractall(out_dir)
        zpath.unlink()  # the original is in S3, so free the disk

        report(out_dir, info["expected_nrrd"])

    manifest = WORK / "checksums.json"
    manifest.write_text(json.dumps(checksums, indent=2))
    s3.upload_file(str(manifest), BUCKET, f"{S3_PREFIX}/checksums.json")
    print("Done. Unpacked files are in /tmp/skullbreak/. Originals and checksums are in S3.")
    print("Note: /tmp can be wiped on reboot. Re-download from S3 if needed.")


if __name__ == "__main__":
    main()