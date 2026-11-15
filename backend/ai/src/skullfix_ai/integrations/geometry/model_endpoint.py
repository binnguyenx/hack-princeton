"""Seam between the reconstruction service and the hosted cranial model (SageMaker async or a test double)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol


@dataclass(frozen=True)
class EndpointPoll:
    """One poll of an in-flight inference.

    `done` carries the binary implant NRRD and uint8 probability NRRD on the input grid, plus the
    endpoint's metadata (checkpoint_hash, freeze_run_id, threshold, model, inference_seconds).
    """

    status: Literal['pending', 'done', 'failed']
    implant: bytes | None = None
    probability: bytes | None = None
    metadata: dict = field(default_factory=dict)
    error: str | None = None


class ModelEndpoint(Protocol):
    def submit(self, run_id: str, nrrd: bytes) -> str:
        """Upload the defective-skull NRRD and start inference; returns a handle for poll()."""

    def poll(self, handle: str) -> EndpointPoll:
        """Return the current state of the inference identified by handle."""
