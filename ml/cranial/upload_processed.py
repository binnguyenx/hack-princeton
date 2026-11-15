"""Upload an audited processed dataset and its manifests without the AWS CLI."""

import argparse
import json
import os
from pathlib import Path

import yaml


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", default="")
    parser.add_argument(
        "--config",
        default="ml/cranial/configs/prepare.yaml",
        help="Prepare config (used for processed_version and manifest paths)",
    )
    args = parser.parse_args()

    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    except ImportError:
        pass
    bucket = args.bucket or os.environ.get("S3_BUCKET", "")
    if not bucket:
        parser.error("set S3_BUCKET or pass --bucket")

    cfg = yaml.safe_load(Path(args.config).read_text())
    version = cfg["s3"].get("processed_version", "v1")
    prefix = cfg["s3"].get("prefix", "cranial").strip("/")
    processed = Path(cfg["output"]["local_processed_dir"]) / version
    manifest_path = Path(cfg["output"]["local_manifest_path"])
    preparation_report = Path(cfg["output"]["local_audit_path"])
    manifests = manifest_path.parent
    report = Path("ml/cranial/reports/audit_results.json")

    if not processed.is_dir() or not manifest_path.is_file() or not preparation_report.is_file() or not report.is_file():
        parser.error(
            f"processed data ({processed}), {manifest_path}, {preparation_report}, "
            "and audit_results.json must exist"
        )

    audit = json.loads(report.read_text())
    preparation = json.loads(preparation_report.read_text())
    if (audit.get("total", 0) == 0 or audit.get("failed") != 0
            or audit.get("passed") != audit["total"]
            or preparation.get("rejected") != 0
            or preparation.get("accepted") != audit["total"]):
        parser.error("preparation and audit reports must agree with no rejected or failed cases")

    import boto3  # Fail before uploading if the Python S3 dependency is missing.
    from prepare_data import upload_to_s3

    upload_to_s3(processed, bucket, f"{prefix}/processed/{version}")
    upload_to_s3(manifests, bucket, f"{prefix}/manifests")
    print(f"Uploaded {processed} → s3://{bucket}/{prefix}/processed/{version}/")


if __name__ == "__main__":
    main()
