"""Contained local artifact content storage."""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Callable

from .interfaces import (
    ArtifactCleanupClaim,
    ArtifactIntegrityError,
    PathContainmentError,
    StoredArtifact,
)


class LocalArtifactStore:
    """Store immutable bytes below one configured local root."""

    def __init__(
        self,
        root: Path,
        retrieval_url_builder: Callable[[str], str] | None = None,
    ) -> None:
        self._root = root.expanduser().resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._retrieval_url_builder = retrieval_url_builder or (
            lambda artifact_id: f"/api/artifacts/{artifact_id}"
        )

    @property
    def root(self) -> Path:
        return self._root

    def write_bytes(
        self,
        artifact_id: str,
        content: bytes,
        media_type: str,
    ) -> StoredArtifact:
        digest = hashlib.sha256(content).hexdigest()
        artifact_key = hashlib.sha256(artifact_id.encode("utf-8")).hexdigest()
        relative_path = PurePosixPath(
            "objects",
            artifact_key[:2],
            artifact_key,
            f"{digest}.blob",
        )
        target = self.resolve_relative_path(relative_path.as_posix())
        target.parent.mkdir(parents=True, exist_ok=True)

        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ArtifactIntegrityError(
                    f"existing content for {artifact_id!r} does not match its path"
                )
        else:
            self._atomic_write(target, content)

        return StoredArtifact(
            artifact_id=artifact_id,
            content_hash=f"sha256:{digest}",
            media_type=media_type,
            retrieval_url=self._retrieval_url_builder(artifact_id),
            relative_path=relative_path.as_posix(),
        )

    def ingest_file(
        self,
        artifact_id: str,
        source: Path,
        media_type: str,
    ) -> StoredArtifact:
        return self.write_bytes(
            artifact_id=artifact_id,
            content=source.read_bytes(),
            media_type=media_type,
        )

    def resolve_relative_path(self, relative_path: str) -> Path:
        path = PurePosixPath(relative_path)
        if path.is_absolute() or ".." in path.parts:
            raise PathContainmentError("artifact path must stay within its root")
        resolved = (self._root / Path(*path.parts)).resolve()
        if not resolved.is_relative_to(self._root):
            raise PathContainmentError("artifact path must stay within its root")
        return resolved

    def read_bytes(self, artifact: StoredArtifact) -> bytes:
        path = self.resolve_relative_path(artifact.relative_path)
        try:
            content = path.read_bytes()
        except FileNotFoundError as error:
            raise ArtifactIntegrityError(
                f"artifact content is missing for {artifact.artifact_id!r}"
            ) from error
        actual = f"sha256:{hashlib.sha256(content).hexdigest()}"
        if actual != artifact.content_hash:
            raise ArtifactIntegrityError(
                f"artifact hash mismatch for {artifact.artifact_id!r}"
            )
        return content

    def delete_claimed(self, claim: ArtifactCleanupClaim) -> bool:
        """Delete content only after application storage issued a live claim."""
        target = self.resolve_relative_path(claim.artifact.relative_path)
        try:
            target.unlink()
        except FileNotFoundError:
            return False
        return True

    @staticmethod
    def _atomic_write(target: Path, content: bytes) -> None:
        temporary_name: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=target.parent,
                prefix=".artifact-",
                delete=False,
            ) as temporary:
                temporary.write(content)
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_name = temporary.name
            os.replace(temporary_name, target)
        finally:
            if temporary_name is not None:
                Path(temporary_name).unlink(missing_ok=True)
