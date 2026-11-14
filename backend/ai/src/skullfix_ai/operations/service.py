"""Standalone mock-sandbox operation boundary; not the live UI backend writer."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Callable, Mapping

from pydantic import JsonValue, TypeAdapter, ValidationError

from skullfix_ai.integrations.geometry import (
    ReconstructionAdapter,
    ReconstructionAdapterError,
    ReconstructionContext,
)
from skullfix_ai.schemas import (
    CompletedReconstructionMockResult,
    DirectMechanicalRequest,
    CaseId,
    RequestId,
    OperationId,
    OperationResult,
    PublicArtifactReference,
    ProvenanceSource,
    ReconstructionMockCommand,
    ReconstructionMockOutput,
    ResultInputRevisions,
    RunLifecycleState,
    StructuredError,
    TerminalStatus,
    UnavailableCandidateOperationRequest,
    UnavailableComparisonRequest,
    UnsuccessfulOperationResult,
)
from skullfix_ai.storage import (
    ApplicationStorage,
    ArtifactAuthority,
    ArtifactRecord,
    ArtifactStorageError,
    ArtifactStore,
    NewCandidateRevision,
    OperationRunRecord,
    ReconciliationState,
    ReferenceMismatchError,
    RequestIdConflictError,
    StaleRevisionError,
    StorageError,
    StorageNotFoundError,
)


@dataclass(frozen=True, slots=True)
class OperationServiceError(Exception):
    """Nonterminal application outcome that cannot use a terminal result model."""

    code: str
    message: str
    run_id: str | None = None

    def __str__(self) -> str:
        return self.message


IdFactory = Callable[[str], str]
ReadinessCheck = Callable[[ReconstructionContext], None]


def _default_id_factory(kind: str) -> str:
    return f"{kind}-{uuid.uuid4()}"


class OperationService:
    """Validate and persist sandbox generation. Never mirror live UI candidates here."""

    def __init__(
        self,
        storage: ApplicationStorage,
        artifact_store: ArtifactStore,
        reconstruction_adapter: ReconstructionAdapter,
        *,
        id_factory: IdFactory = _default_id_factory,
        readiness_check: ReadinessCheck | None = None,
    ) -> None:
        self._storage = storage
        self._artifact_store = artifact_store
        self._reconstruction_adapter = reconstruction_adapter
        self._id_factory = id_factory
        self._readiness_check = readiness_check or (lambda _context: None)

    def execute_request(self, request: Mapping[str, object]) -> OperationResult:
        """Dispatch direct requests without advertising absent real capabilities.

        Future AI proposals use execute_reconstruction with the same canonical
        command; this method does not interpret natural-language messages.
        """
        if request.get("operation_id") == "generate.candidate":
            parsed = TypeAdapter(DirectMechanicalRequest).validate_python(dict(request))
            return self.execute_reconstruction(ReconstructionMockCommand(
                request_id=parsed.request_id, case_id=parsed.case_id,
                operation_id="generate.candidate",
                input_revisions={"source_anatomy_revision_id": parsed.source_anatomy_revision_id},
                references={"selection": parsed.selection}, parameters=parsed.parameters,
            ))
        payload = TypeAdapter(dict[str, JsonValue]).validate_python(dict(request))
        case_id = TypeAdapter(CaseId).validate_python(payload.get("case_id"))
        request_id = TypeAdapter(RequestId).validate_python(payload.get("request_id"))
        operation_id = TypeAdapter(OperationId).validate_python(payload.get("operation_id"))
        unavailable = operation_id in {
            "measure.candidate", "inspect.candidate", "edit.local", "compare.revisions"
        }
        parsed = TypeAdapter(DirectMechanicalRequest).validate_python(payload) if unavailable else None
        try:
            self._storage.get_case(case_id)
        except StorageNotFoundError as error:
            raise OperationServiceError("case-not-found", "Case does not exist.") from error
        inputs = ResultInputRevisions()
        if parsed is not None:
            if operation_id == "compare.revisions":
                inputs.comparison_revision_ids = parsed.revision_ids
            else:
                inputs.expected_revision_id = parsed.expected_revision_id
        identity_payload = parsed.model_dump(mode="json") if parsed is not None else payload
        identity = "sha256:" + hashlib.sha256(json.dumps(
            identity_payload, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()).hexdigest()
        run = OperationRunRecord(
            self._id_factory("run"), case_id, request_id, operation_id,
            RunLifecycleState.ACCEPTED, None, inputs.model_dump(mode="json"), None, None,
        )
        try:
            claim = self._storage.claim_operation_run(run, identity)
        except RequestIdConflictError as error:
            raise OperationServiceError("request-id-conflict", "Request input conflicts with its original command.") from error
        if not claim.owner:
            return self._existing_outcome(claim.run)
        status, code, message = "unsupported", "operation-unsupported", "Operation is not supported."
        if parsed is not None:
            try:
                history = self._storage.get_candidate_history(parsed.candidate_id)
                if history.candidate.case_id != case_id:
                    return self._terminal(run, inputs, "failed", "cross-case-reference", "Candidate belongs to another case.")
                revisions = {revision.revision_id: revision for revision in history.revisions}
                if operation_id == "compare.revisions":
                    if any(revision not in revisions for revision in parsed.revision_ids):
                        raise ReferenceMismatchError("Unknown candidate revision.")
                else:
                    if parsed.expected_revision_id not in revisions:
                        raise ReferenceMismatchError("Unknown candidate revision.")
                    if parsed.expected_revision_id != history.candidate.current_revision_id:
                        return self._terminal(run, inputs, "stale", "stale-revision", "Expected revision is not current.")
                    selection = parsed.selection
                    if selection is not None and (
                        selection.geometry_revision_id != parsed.expected_revision_id
                        or selection.coordinate_frame != revisions[parsed.expected_revision_id].spatial_metadata.coordinate_frame
                    ):
                        raise ReferenceMismatchError("Incompatible selection reference.")
            except (ReferenceMismatchError, StorageNotFoundError):
                return self._terminal(run, inputs, "failed", "reference-mismatch", "Candidate revision or selection reference is invalid.")
            status, code, message = "unavailable", "operation-contract-missing", "No agreed contract is available for this real operation."
        return self._terminal(run, inputs, status, code, message)

    def _terminal(self, run, inputs, status, code, message):
        result = UnsuccessfulOperationResult(
            run_id=run.run_id, request_id=run.request_id, case_id=run.case_id,
            operation_id=run.operation_id, status=status, input_revisions=inputs,
            output_candidate_id=None, output_revision_id=None, artifacts=[], output=None,
            source=None, limitations=[], error=StructuredError(code=code, message=message),
        )
        try:
            self._storage.transition_run(
                run.run_id, RunLifecycleState(status), terminal_status=TerminalStatus(status),
                output=result.model_dump(mode="json"), error=result.error,
            )
        except StorageError as error:
            raise OperationServiceError("reconciliation-required", "Run outcome requires reconciliation.", run.run_id) from error
        return result

    def execute_reconstruction(
        self,
        command: ReconstructionMockCommand | Mapping[str, object],
    ) -> OperationResult:
        """Execute one canonical mock-generation command synchronously."""
        try:
            canonical = (
                command
                if isinstance(command, ReconstructionMockCommand)
                else ReconstructionMockCommand.model_validate(command)
            )
        except ValidationError:
            raise

        try:
            self._storage.get_case(canonical.case_id)
        except StorageNotFoundError as error:
            raise OperationServiceError("case-not-found", "Case does not exist.") from error
        run_id = self._id_factory("run")
        run = OperationRunRecord(
            run_id=run_id,
            case_id=canonical.case_id,
            request_id=canonical.request_id,
            operation_id=canonical.operation_id,
            state=RunLifecycleState.ACCEPTED,
            terminal_status=None,
            input_revisions=canonical.input_revisions.model_dump(mode="json"),
            output=None,
            error=None,
        )
        identity = self._canonical_identity(canonical)
        try:
            claim = self._storage.claim_operation_run(run, identity)
        except RequestIdConflictError as error:
            raise OperationServiceError(
                code="request-id-conflict",
                message=str(error),
            ) from error
        if not claim.owner:
            return self._existing_outcome(claim.run)

        try:
            source = self._storage.get_source_anatomy(
                canonical.input_revisions.source_anatomy_revision_id
            )
            if source.case_id != canonical.case_id:
                return self._fail(
                    run,
                    canonical,
                    code="cross-case-reference",
                    message="Source anatomy belongs to another case.",
                )
            source_artifact = self._storage.get_artifact(source.artifact_id)
            if source_artifact.case_id != canonical.case_id:
                return self._fail(
                    run,
                    canonical,
                    code="cross-case-reference",
                    message="Source artifact belongs to another case.",
                )
            selection = canonical.references.selection
            if selection is not None and (
                selection.geometry_revision_id != source.revision_id
                or selection.coordinate_frame
                != source.spatial_metadata.coordinate_frame
            ):
                return self._fail(
                    run,
                    canonical,
                    code="reference-mismatch",
                    message="Selection revision or coordinate frame is incompatible.",
                )
            source_content = self._artifact_store.read_bytes(
                source_artifact.artifact
            )
            context = ReconstructionContext(
                command=canonical,
                source_anatomy=source,
                source_artifact=source_artifact,
                source_content=source_content,
            )
            self._readiness_check(context)
        except StaleRevisionError as error:
            return self._fail(
                run,
                canonical,
                code="stale-revision",
                message=str(error),
                state=RunLifecycleState.STALE,
                status=TerminalStatus.STALE,
            )
        except (ArtifactStorageError, OSError):
            return self._fail(
                run, canonical, code="artifact-failed",
                message="Source artifact could not be read or verified.",
            )
        except (ReferenceMismatchError, StorageNotFoundError):
            return self._fail(
                run,
                canonical,
                code="reference-mismatch",
                message="Source or selection reference is not valid for this case.",
            )
        except StorageError:
            return self._fail(
                run,
                canonical,
                code="persistence-failed",
                message="Authoritative context could not be loaded.",
            )

        try:
            self._storage.transition_run(run_id, RunLifecycleState.EXECUTING)
        except StorageError:
            return self._fail(run, canonical, code="persistence-failed",
                              message="Execution ownership could not be persisted.")
        try:
            adapter_output = self._reconstruction_adapter.reconstruct(context)
        except ReconstructionAdapterError as error:
            return self._fail(
                run,
                canonical,
                code="adapter-failed",
                message=error.message,
                details=error.details,
            )
        except Exception as error:
            return self._fail(
                run,
                canonical,
                code="adapter-failed",
                message="Reconstruction adapter failed.",
                details={"exception_type": type(error).__name__},
            )

        # Validate before any artifact or candidate can become authoritative.
        try:
            if not isinstance(adapter_output.provenance, ProvenanceSource) or adapter_output.provenance not in {
                ProvenanceSource.MOCK, ProvenanceSource.TEST_DOUBLE
            }:
                raise ValueError("A real reconstruction contract is not available.")
            if not isinstance(adapter_output.content, bytes) or not adapter_output.content:
                raise ValueError("Adapter output must contain nonempty bytes.")
            if not isinstance(adapter_output.media_type, str) or not adapter_output.media_type or not adapter_output.limitations:
                raise ValueError("Adapter output requires a media type and limitations.")
            if not any("not a real reconstruction" in item.lower()
                       for item in adapter_output.limitations):
                raise ValueError("Mock output must disclose that it is not a real reconstruction.")
            ReconstructionMockOutput(
                kind="candidate-generation", spatial_metadata=adapter_output.spatial_metadata
            )
        except (AttributeError, TypeError, ValueError):
            return self._fail(
                run, canonical, code="adapter-output-invalid",
                message="Adapter output violates the reconstruction mock contract.",
            )

        artifact_id = self._id_factory("artifact")
        stored = None
        try:
            stored = self._artifact_store.write_bytes(
                artifact_id,
                adapter_output.content,
                adapter_output.media_type,
            )
            artifact_record = ArtifactRecord(
                case_id=canonical.case_id,
                artifact=stored,
                provenance=adapter_output.provenance,
                limitations=adapter_output.limitations,
                authority=ArtifactAuthority.PENDING,
                reconciliation_state=ReconciliationState.PENDING,
                produced_by_run_id=run_id,
            )
            self._storage.record_artifact(artifact_record)
        except (ArtifactStorageError, OSError, StorageError) as error:
            return self._fail(
                run,
                canonical,
                code="artifact-failed",
                message="Generated artifact could not be stored.",
                artifacts=[stored.to_public_reference()] if stored is not None else [],
                details={"artifact_record_missing": True} if stored is not None else {},
            )

        try:
            self._storage.transition_run(run_id, RunLifecycleState.READY_TO_COMMIT)
        except StorageError:
            self._mark_failed_artifact(artifact_id, run_id)
            return self._fail(run, canonical, code="persistence-failed",
                              message="Commit readiness could not be persisted.",
                              artifacts=[artifact_record.to_public_reference()])
        candidate_id = self._id_factory("candidate")
        revision_id = self._id_factory("revision")
        try:
            self._storage.create_initial_candidate(
                case_id=canonical.case_id,
                candidate_id=candidate_id,
                source_anatomy_revision_id=source.revision_id,
                revision=NewCandidateRevision(
                    revision_id=revision_id,
                    parent_revision_id=None,
                    operation_id=canonical.operation_id,
                    validated_parameters=canonical.parameters.model_dump(
                        mode="json"
                    ),
                    artifact_id=artifact_id,
                    spatial_metadata=adapter_output.spatial_metadata,
                    provenance=adapter_output.provenance,
                ),
            )
        except StaleRevisionError as error:
            self._mark_failed_artifact(artifact_id, run_id)
            return self._fail(
                run,
                canonical,
                code="stale-revision",
                message=str(error),
                state=RunLifecycleState.STALE,
                status=TerminalStatus.STALE,
                artifacts=[artifact_record.to_public_reference()],
            )
        except StorageError as error:
            try:
                committed = self._storage.get_candidate(candidate_id)
            except StorageNotFoundError:
                committed = None
            except StorageError as lookup_error:
                raise OperationServiceError(
                    "reconciliation-required", "Candidate commit state is uncertain.", run_id
                ) from lookup_error
            if committed is not None:
                raise OperationServiceError(
                    "reconciliation-required", "Candidate exists; its commit outcome requires reconciliation.", run_id
                ) from error
            self._mark_failed_artifact(artifact_id, run_id)
            return self._fail(
                run,
                canonical,
                code="persistence-failed",
                message="Candidate publication failed.",
                artifacts=[artifact_record.to_public_reference()],
            )

        result = CompletedReconstructionMockResult(
            run_id=run_id,
            request_id=canonical.request_id,
            case_id=canonical.case_id,
            operation_id="generate.candidate",
            status="completed",
            input_revisions=canonical.input_revisions,
            output_candidate_id=candidate_id,
            output_revision_id=revision_id,
            artifacts=[artifact_record.to_public_reference()],
            output=ReconstructionMockOutput(
                kind="candidate-generation",
                spatial_metadata=adapter_output.spatial_metadata,
            ),
            source=adapter_output.provenance.value,
            limitations=list(adapter_output.limitations),
            error=None,
        )
        try:
            self._storage.transition_run(
                run_id,
                RunLifecycleState.COMPLETED,
                terminal_status=TerminalStatus.COMPLETED,
                output=result.model_dump(mode="json"),
            )
        except StorageError as error:
            raise OperationServiceError(
                code="reconciliation-required",
                message=(
                    "The candidate was committed, but the completed result "
                    "requires reconciliation."
                ),
                run_id=run_id,
            ) from error
        return result

    def _mark_failed_artifact(self, artifact_id: str, run_id: str) -> None:
        try:
            self._storage.mark_artifact_non_authoritative(artifact_id, "operation-commit-failed")
        except StorageError as error:
            raise OperationServiceError(
                "reconciliation-required", "Artifact state requires reconciliation.", run_id
            ) from error

    def reject_unavailable(
        self,
        request: UnavailableCandidateOperationRequest | UnavailableComparisonRequest,
    ) -> OperationResult:
        """Use the common validation/identity path for known absent capabilities."""
        return self.execute_request(request.model_dump(mode="json"))

    def reject_unsupported(
        self, *, case_id: str, request_id: str, operation_id: str,
    ) -> OperationResult:
        """Use the same dispatch path rather than bypass capability validation."""
        return self.execute_request({
            "case_id": case_id, "request_id": request_id,
            "operation_id": operation_id,
        })

    @staticmethod
    def _canonical_identity(command: ReconstructionMockCommand) -> str:
        content = json.dumps(command.model_dump(mode="json"), sort_keys=True,
                             separators=(",", ":"), allow_nan=False).encode("utf-8")
        return f"sha256:{hashlib.sha256(content).hexdigest()}"

    @staticmethod
    def _existing_outcome(run: OperationRunRecord) -> OperationResult:
        if run.terminal_status is not None and run.output is not None:
            return TypeAdapter(OperationResult).validate_python(run.output)
        code = (
            "reconciliation-required"
            if run.state is RunLifecycleState.READY_TO_COMMIT
            else "request-in-progress"
        )
        raise OperationServiceError(
            code=code,
            message="The canonical request already has an incomplete owner.",
            run_id=run.run_id,
        )

    def _fail(
        self,
        run: OperationRunRecord,
        command: ReconstructionMockCommand,
        *,
        code: str,
        message: str,
        state: RunLifecycleState = RunLifecycleState.FAILED,
        status: TerminalStatus = TerminalStatus.FAILED,
        details: dict[str, object] | None = None,
        artifacts: list[PublicArtifactReference] | None = None,
    ) -> UnsuccessfulOperationResult:
        error = StructuredError(
            code=code,
            message=message or code,
            details=details or {},
        )
        result = UnsuccessfulOperationResult(
            run_id=run.run_id,
            request_id=command.request_id,
            case_id=command.case_id,
            operation_id=command.operation_id,
            status=status.value,
            input_revisions=ResultInputRevisions(
                source_anatomy_revision_id=(
                    command.input_revisions.source_anatomy_revision_id
                )
            ),
            output_candidate_id=None,
            output_revision_id=None,
            artifacts=artifacts or [],
            output=None,
            source=None,
            limitations=[],
            error=error,
        )
        try:
            self._storage.transition_run(
                run.run_id, state, terminal_status=status,
                output=result.model_dump(mode="json"), error=error,
            )
        except StorageError as failure:
            raise OperationServiceError(
                "reconciliation-required", "Run outcome requires reconciliation.", run.run_id
            ) from failure
        return result
