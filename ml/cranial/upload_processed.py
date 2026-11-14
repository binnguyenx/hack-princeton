"""Upload an audited processed dataset and its manifests without the AWS CLI."""

import argparse
import json
import os
from pathlib import Path

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", default="")
    args = parser.parse_args()

    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    except ImportError:
        pass
    bucket = args.bucket or os.environ.get("S3_BUCKET", "")
    if not bucket:
        parser.error("set S3_BUCKET or pass --bucket")

    processed = Path("data/processed/v1")
    manifests = Path("ml/cranial/manifests")
    report = Path("ml/cranial/reports/audit_results.json")
    preparation_report = manifests / "audit_v1.json"
    if not processed.is_dir() or not (manifests / "split_v1.csv").is_file() or not preparation_report.is_file() or not report.is_file():
        parser.error("processed data, split_v1.csv, audit_v1.json, and audit_results.json must exist")

    audit = json.loads(report.read_text())
    preparation = json.loads(preparation_report.read_text())
    if (audit.get("total", 0) == 0 or audit.get("failed") != 0
            or audit.get("passed") != audit["total"]
            or preparation.get("rejected") != 0
            or preparation.get("accepted") != audit["total"]):
        parser.error("preparation and audit reports must agree with no rejected or failed cases")

    import boto3  # Fail before uploading if the Python S3 dependency is missing.
    from prepare_data import upload_to_s3

    upload_to_s3(processed, bucket, "cranial/processed/v1")
    upload_to_s3(manifests, bucket, "cranial/manifests")


if __name__ == "__main__":
    main()
