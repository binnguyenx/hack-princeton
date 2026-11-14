"""Public geometry-integration contracts and synthetic test double."""

from .mock import (
    MOCK_RECONSTRUCTION_LIMITATION,
    DeterministicReconstructionMock,
)
from .reconstruction import (
    ReconstructionAdapter,
    ReconstructionAdapterError,
    ReconstructionArtifactOutput,
    ReconstructionContext,
)

__all__ = [
    "DeterministicReconstructionMock",
    "MOCK_RECONSTRUCTION_LIMITATION",
    "ReconstructionAdapter",
    "ReconstructionAdapterError",
    "ReconstructionArtifactOutput",
    "ReconstructionContext",
]
