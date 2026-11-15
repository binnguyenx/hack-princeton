"""Staged proposals: AI-suggested changes held in an isolated pending state (human write-gate).

A tool may only *stage* a proposal through a per-turn ProposalSink. Staging never touches the
application database, volumes or revisions. A proposal is bound to the selection it was made
for, including ``base_revision_id``. Only an explicit human Accept (a separate HTTP route, never
a tool) commits it, through the existing manual PlacementService, which re-checks that the base
revision is still current. Store memory is per process and is lost on restart.
"""

from __future__ import annotations

import math
import threading
import time
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from skullfix_ai.schemas.workspace import AppObjectContext

ProposalKind = Literal["rigid_pose"]
ProposalStatus = Literal["pending", "accepted", "discarded", "stale", "expired"]
PROPOSAL_TTL_SECONDS = 30 * 60
MAX_PROPOSALS = 256


class StagingError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        self.code, self.status = code, status
        super().__init__(message)


class StagedProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposal_id: str
    kind: ProposalKind
    status: ProposalStatus = "pending"
    summary: str = Field(min_length=1, max_length=500)
    project_id: str
    case_id: str
    candidate_id: str
    base_revision_id: str
    conversation_id: str
    payload: dict
    created_at: float
    resolved_revision_id: str | None = None

    def public(self) -> dict:
        return self.model_dump(mode="json")


def _rigid_pose(payload: dict) -> list[float]:
    pose = payload.get("pose") if isinstance(payload, dict) else None
    if (not isinstance(pose, list) or len(pose) != 16
            or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in pose)):
        raise StagingError("proposal-invalid", "A rigid_pose proposal needs a finite 16-value pose.", 422)
    from skullfix_ai.application.placement import is_rigid_pose
    if not is_rigid_pose(pose):
        raise StagingError("proposal-invalid", "Proposed pose is not a rigid transform.", 422)
    return [float(v) for v in pose]


class ProposalStore:
    """Thread-safe in-memory pending store. Never writes application data except via accept()."""

    def __init__(self, *, ttl_seconds: float = PROPOSAL_TTL_SECONDS, clock=time.time):
        self._items: dict[str, StagedProposal] = {}
        self._lock = threading.Lock()
        self._ttl, self._clock = ttl_seconds, clock

    def _expire(self, proposal: StagedProposal) -> StagedProposal:
        if proposal.status == "pending" and self._clock() - proposal.created_at > self._ttl:
            proposal.status = "expired"
        return proposal

    def stage(self, context: AppObjectContext, *, conversation_id: str, kind: ProposalKind, summary: str,
              payload: dict) -> StagedProposal:
        if context.candidate_id is None or context.revision_id is None:
            raise StagingError("proposal-needs-candidate", "Proposals require a selected implant candidate.", 422)
        if kind != "rigid_pose":
            raise StagingError("proposal-unsupported", "Unsupported proposal kind.", 422)
        clean = {"pose": _rigid_pose(payload)}
        proposal = StagedProposal(proposal_id=str(uuid.uuid4()), kind=kind, summary=summary.strip()[:500] or "Proposal",
                                  project_id=context.project_id, case_id=context.case_id,
                                  candidate_id=context.candidate_id, base_revision_id=context.revision_id,
                                  conversation_id=conversation_id, payload=clean, created_at=self._clock())
        with self._lock:
            if len(self._items) >= MAX_PROPOSALS:
                oldest = min(self._items.values(), key=lambda item: item.created_at)
                self._items.pop(oldest.proposal_id)
            self._items[proposal.proposal_id] = proposal
        return proposal.model_copy(deep=True)

    def get(self, proposal_id: str) -> StagedProposal:
        with self._lock:
            proposal = self._items.get(proposal_id)
            if proposal is None:
                raise StagingError("proposal-not-found", "Proposal not found.", 404)
            return self._expire(proposal).model_copy(deep=True)

    def discard(self, proposal_id: str) -> StagedProposal:
        with self._lock:
            proposal = self._items.get(proposal_id)
            if proposal is None:
                raise StagingError("proposal-not-found", "Proposal not found.", 404)
            if self._expire(proposal).status == "pending":
                proposal.status = "discarded"
            return proposal.model_copy(deep=True)

    def accept(self, proposal_id: str, repository, *, project_id: str, case_id: str, candidate_id: str,
               base_revision_id: str) -> StagedProposal:
        """Human-confirmed commit via PlacementService; caller must echo the proposal identity."""
        from skullfix_ai.application.placement import PlacementCommand, PlacementError, PlacementService
        with self._lock:
            proposal = self._items.get(proposal_id)
            if proposal is None:
                raise StagingError("proposal-not-found", "Proposal not found.", 404)
            if self._expire(proposal).status != "pending":
                raise StagingError(f"proposal-{proposal.status}", f"Proposal is {proposal.status}.")
            if (project_id, case_id, candidate_id, base_revision_id) != (
                    proposal.project_id, proposal.case_id, proposal.candidate_id, proposal.base_revision_id):
                raise StagingError("proposal-identity-mismatch", "Confirmation does not match the staged proposal.")
            command = PlacementCommand(project_id=proposal.project_id, case_id=proposal.case_id,
                                       expected_revision_id=proposal.base_revision_id, pose=proposal.payload["pose"])
            try:
                result = PlacementService(repository).execute(proposal.candidate_id, command)
            except PlacementError as error:
                if error.code == "stale-revision":
                    proposal.status = "stale"
                raise StagingError(error.code, str(error), error.status) from error
            proposal.status = "accepted"
            proposal.resolved_revision_id = result.get("revisionId") if isinstance(result, dict) else None
            return proposal.model_copy(deep=True)


class ProposalSink:
    """Per-turn, stage-only handle given to proposal-producing tools; cannot accept or discard."""

    def __init__(self, store: ProposalStore, context: AppObjectContext, conversation_id: str):
        self._store, self._context, self._conversation_id = store, context, conversation_id
        self.staged: list[StagedProposal] = []

    def stage(self, *, kind: ProposalKind, summary: str, payload: dict) -> StagedProposal:
        proposal = self._store.stage(self._context, conversation_id=self._conversation_id, kind=kind,
                                     summary=summary, payload=payload)
        self.staged.append(proposal)
        return proposal

    def latest_pending(self) -> dict | None:
        return self.staged[-1].public() if self.staged else None
