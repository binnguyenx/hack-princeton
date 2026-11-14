"""Replaceable pre-commit reconstruction adapter contracts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import JsonValue

from skullfix_ai.schemas import (
    ProvenanceSource,
    ReconstructionMockCommand,
    SpatialMetadata,
)
from skullfix_ai.storage import ArtifactRecord, SourceAnatomyRecord


@dataclass(frozen=True, slots=True)
class ReconstructionContext:
    """Authoritative application context resolved before adapter execution."""

    command: ReconstructionMockCommand
    source_anatomy: SourceAnatomyRecord
    source_artifact: ArtifactRecord
    source_content: bytes


@dataclass(frozen=True, slots=True)
class ReconstructionArtifactOutput:
    """Adapter output before application ids and authority are assigned."""

    content: bytes
    media_type: str
    spatial_metadata: SpatialMetadata
    provenance: ProvenanceSource
    limitations: tuple[str, ...]


class ReconstructionAdapterError(Exception):
    """Structured adapter failure safe for translation by the application."""

    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, JsonValue] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


class ReconstructionAdapter(Protocol):
    def reconstruct(
        self, context: ReconstructionContext
    ) -> ReconstructionArtifactOutput: ...
