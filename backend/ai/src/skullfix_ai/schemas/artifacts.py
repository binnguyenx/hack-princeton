"""Public artifact references and separate fixture-local loading metadata."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Annotated

from pydantic import Field, field_validator

from .common import ArtifactId, ContractModel, NonEmptyString


Sha256Digest = Annotated[
    str, Field(strict=True, pattern=r"^sha256:[0-9a-f]{64}$")
]


class PublicArtifactReference(ContractModel):
    """Frontend-facing artifact metadata without server-local paths."""

    artifact_id: ArtifactId
    content_hash: Sha256Digest
    media_type: NonEmptyString
    retrieval_url: NonEmptyString

    @field_validator("retrieval_url")
    @classmethod
    def require_backend_resolvable_url(cls, value: str) -> str:
        if not (
            value.startswith("/")
            or value.startswith("https://")
            or value.startswith("http://")
        ):
            raise ValueError(
                "retrieval_url must be an absolute backend path or HTTP(S) URL"
            )
        return value


class FixtureArtifactLocation(ContractModel):
    """Fixture-only path metadata resolved relative to a documented base."""

    relative_path: NonEmptyString

    @field_validator("relative_path")
    @classmethod
    def require_relative_posix_path(cls, value: str) -> str:
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("relative_path must stay within its fixture base directory")
        return value

