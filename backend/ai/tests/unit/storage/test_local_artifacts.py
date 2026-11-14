"""Behavioral tests for contained local artifact handling."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from skullfix_ai.storage import (
    ArtifactCleanupClaim,
    ArtifactIntegrityError,
    LocalArtifactStore,
    PathContainmentError,
)
class LocalArtifactStoreTest(unittest.TestCase):
    def test_written_bytes_resolve_with_hash_and_public_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = LocalArtifactStore(root)
            content = b"abc"

            stored = store.write_bytes(
                artifact_id="artifact-demo-001",
                content=content,
                media_type="application/json",
            )

            self.assertEqual(store.read_bytes(stored), content)
            self.assertEqual(
                stored.content_hash,
                "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )
            self.assertTrue((root / stored.relative_path).is_file())
            self.assertEqual(
                stored.to_public_reference().model_dump(mode="json"),
                {
                    "artifact_id": "artifact-demo-001",
                    "content_hash": stored.content_hash,
                    "media_type": "application/json",
                    "retrieval_url": "/api/artifacts/artifact-demo-001",
                },
            )
            self.assertNotIn(
                "relative_path",
                stored.to_public_reference().model_dump(mode="json"),
            )

    def test_resolution_rejects_escape_and_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = LocalArtifactStore(root)
            stored = store.write_bytes(
                artifact_id="artifact-demo-001",
                content=b"original",
                media_type="application/octet-stream",
            )

            with self.assertRaises(PathContainmentError):
                store.resolve_relative_path("../outside")

            (root / stored.relative_path).write_bytes(b"tampered")
            with self.assertRaises(ArtifactIntegrityError):
                store.read_bytes(stored)

    def test_cleanup_is_idempotent_for_a_storage_claim(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = LocalArtifactStore(Path(directory))
            stored = store.write_bytes(
                artifact_id="artifact-demo-001",
                content=b"pending",
                media_type="application/octet-stream",
            )
            claim = ArtifactCleanupClaim(
                artifact_id=stored.artifact_id,
                claim_token="cleanup-token-001",
                artifact=stored,
            )
            self.assertTrue(store.delete_claimed(claim))
            self.assertFalse(store.delete_claimed(claim))

    def test_ingest_ignores_the_supplied_filename_as_a_storage_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source_directory = base / "user-supplied"
            source_directory.mkdir()
            source = source_directory / "candidate.json"
            source.write_bytes(b"synthetic")
            store = LocalArtifactStore(base / "artifact-root")

            stored = store.ingest_file(
                artifact_id="artifact-ingested-001",
                source=source,
                media_type="application/json",
            )

            self.assertNotIn("candidate", stored.relative_path)
            self.assertTrue(
                store.resolve_relative_path(stored.relative_path).is_file()
            )


if __name__ == "__main__":
    unittest.main()
