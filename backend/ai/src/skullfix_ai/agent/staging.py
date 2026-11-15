"""Staged proposals: AI-suggested changes held in an isolated pending state (human write-gate).

A tool may only *stage* a proposal through a per-turn ProposalSink. Staging never touches the
application database, volumes or revisions. A proposal is bound to the selection it was made
for, including ``base_revision_id``. Only an explicit human Accept (a separate HTTP route, never
a tool) commits it, through the existing manual service for its kind (PlacementService for
``rigid_pose``, ModelReconstructionService for ``model_fix``), which re-checks that the base
revision is still current. A ``model_fix`` generate proposal is bound to the skull (sample) and has
no candidate or base revision until it is accepted. Store memory is per process and is lost on restart.
"""

from __future__ import annotations

import math
import threading
import time
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from skullfix_ai.schemas.workspace import AppObjectContext

ProposalKind = Literal["rigid_pose", "model_fix"]
FIX_ACTIONS = ("generate", "threshold", "region")
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
    candidate_id: str | None
    base_revision_id: str | None
    conversation_id: str
    payload: dict
    created_at: float
    resolved_revision_id: str | None = None
    sample_id: str | None = None
    resolved_run_id: str | None = None

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


def _model_fix(payload: dict) -> dict:
    action = payload.get("action") if isinstance(payload, dict) else None
    if action not in FIX_ACTIONS:
        raise StagingError("proposal-invalid", "A model_fix proposal needs action generate, threshold or region.", 422)
    from pydantic import ValidationError
    from skullfix_ai.application.model_reconstruction import AdjustCommand
    clean = {"action": action}
    if action != "generate":
        change = {key: payload.get(key) for key in ("threshold", "region") if payload.get(key) is not None}
        if not change:
            raise StagingError("proposal-invalid", f"A {action} proposal needs a {action} value.", 422)
        try:
            AdjustCommand.model_validate({"project_id": "p", "case_id": "c", "expected_revision_id": "r", **change})
        except ValidationError as error:
            raise StagingError("proposal-invalid", "Threshold must be 0.1–0.9 and a region two IJK corners.", 422) from error
        clean.update(change)
    return clean


class ProposalStore:
    """Thread-safe in-memory pending store. Never writes application data except via accept()."""

    def __init__(self, *, ttl_seconds: float = PROPOSAL_TTL_SECONDS, clock=time.time):
        self._items: dict[str, StagedProposal] = {}
        self._accepting: set[str] = set()  # proposals whose commit is running outside the lock
        self._lock = threading.Lock()
        self._ttl, self._clock = ttl_seconds, clock

    def _expire(self, proposal: StagedProposal) -> StagedProposal:
        if proposal.status == "pending" and self._clock() - proposal.created_at > self._ttl:
            proposal.status = "expired"
        return proposal

    def stage(self, context: AppObjectContext, *, conversation_id: str, kind: ProposalKind, summary: str,
              payload: dict) -> StagedProposal:
        if kind == "rigid_pose":
            clean = {"pose": _rigid_pose(payload)}
        elif kind == "model_fix":
            clean = _model_fix(payload)
        else:
            raise StagingError("proposal-unsupported", "Unsupported proposal kind.", 422)
        generate = kind == "model_fix" and clean["action"] == "generate"
        if not generate and (context.candidate_id is None or context.revision_id is None):
            raise StagingError("proposal-needs-candidate", "Proposals require a selected implant candidate.", 422)
        proposal = StagedProposal(proposal_id=str(uuid.uuid4()), kind=kind, summary=summary.strip()[:500] or "Proposal",
                                  project_id=context.project_id, case_id=context.case_id,
                                  candidate_id=None if generate else context.candidate_id,
                                  base_revision_id=None if generate else context.revision_id,
                                  sample_id=context.sample_id if kind == "model_fix" else None,
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
            if proposal_id in self._accepting:
                raise StagingError("proposal-accepting", "Proposal is being applied.")
            if self._expire(proposal).status == "pending":
                proposal.status = "discarded"
            return proposal.model_copy(deep=True)

    def accept(self, proposal_id: str, repository, *, project_id: str, case_id: str, candidate_id: str | None,
               base_revision_id: str | None, fix_service=None) -> StagedProposal:
        """Human-confirmed commit through the manual service for the kind; caller must echo the proposal identity.

        The store lock is held only to check and claim the proposal and to record the outcome. The commit
        itself (which can take a while for a model fix) runs unlocked, so other conversations are not blocked.
        """
        with self._lock:
            proposal = self._items.get(proposal_id)
            if proposal is None:
                raise StagingError("proposal-not-found", "Proposal not found.", 404)
            if proposal_id in self._accepting:
                raise StagingError("proposal-accepting", "Proposal is already being applied.")
            if self._expire(proposal).status != "pending":
                raise StagingError(f"proposal-{proposal.status}", f"Proposal is {proposal.status}.")
            if (project_id, case_id, candidate_id, base_revision_id) != (
                    proposal.project_id, proposal.case_id, proposal.candidate_id, proposal.base_revision_id):
                raise StagingError("proposal-identity-mismatch", "Confirmation does not match the staged proposal.")
            self._accepting.add(proposal_id)
            claimed = proposal.model_copy(deep=True)
        outcome: dict = {}
        try:
            if claimed.kind == "model_fix":
                outcome = self._accept_model_fix(claimed, fix_service)
            else:
                outcome = self._accept_rigid_pose(claimed, repository)
        except StagingError as error:
            if error.code in ("stale-revision", "revision-changed"):
                outcome = {"status": "stale"}
            raise
        finally:
            with self._lock:
                self._accepting.discard(proposal_id)
                current = self._items.get(proposal_id)
                if current is not None:
                    for key, value in outcome.items():
                        setattr(current, key, value)
        return (current or claimed.model_copy(update=outcome)).model_copy(deep=True)

    @staticmethod
    def _accept_rigid_pose(proposal: StagedProposal, repository) -> dict:
        from skullfix_ai.application.placement import PlacementCommand, PlacementError, PlacementService
        command = PlacementCommand(project_id=proposal.project_id, case_id=proposal.case_id,
                                   expected_revision_id=proposal.base_revision_id, pose=proposal.payload["pose"])
        try:
            result = PlacementService(repository).execute(proposal.candidate_id, command)
        except PlacementError as error:
            raise StagingError(error.code, str(error), error.status) from error
        return {"status": "accepted", "resolved_revision_id": result.get("revisionId") if isinstance(result, dict) else None}

    @staticmethod
    def _accept_model_fix(proposal: StagedProposal, fix_service) -> dict:
        """Runs the same reconstruct.model operation as the canvas button. Called without the store lock."""
        from skullfix_ai.application.model_reconstruction import AdjustCommand, ReconstructionError, StartCommand
        if fix_service is None:
            raise StagingError("model-endpoint-unconfigured", "The cranial model endpoint is not configured.", 503)
        try:
            if proposal.payload["action"] == "generate":
                run_id = fix_service.start(
                    proposal.sample_id, StartCommand(project_id=proposal.project_id, case_id=proposal.case_id))
                return {"status": "accepted", "resolved_run_id": run_id}
            change = {k: v for k, v in proposal.payload.items() if k != "action"}
            result = fix_service.adjust(proposal.candidate_id, AdjustCommand(
                project_id=proposal.project_id, case_id=proposal.case_id,
                expected_revision_id=proposal.base_revision_id, **change))
            return {"status": "accepted", "resolved_revision_id": result["revisionId"]}
        except ReconstructionError as error:
            raise StagingError(error.code, error.message, error.status) from error
        except Exception as error:  # never surface an uncoded 500 to the proposal card
            raise StagingError("proposal-apply-failed", "Applying the fix failed. Nothing was saved.", 500) from error


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
