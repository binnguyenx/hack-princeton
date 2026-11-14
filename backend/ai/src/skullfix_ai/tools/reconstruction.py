"""Explicitly bound sandbox generation through the existing operation service."""

from dataclasses import dataclass

from pydantic import BaseModel, Field

from skullfix_ai.operations import OperationService, OperationServiceError
from skullfix_ai.schemas import ReconstructionMockCommand
from skullfix_ai.schemas.workspace import AppObjectContext

from .registry import ToolArguments, ToolBoundaryError, ToolDefinition, ToolObservation


class ReconstructionArguments(ToolArguments):
    fixture_variant: str = Field(min_length=1)


@dataclass(frozen=True)
class SandboxReconstructionBinding:
    """Composition supplies sandbox identities; the model cannot replace them."""

    service: OperationService
    case_id: str
    source_anatomy_revision_id: str

    def tool(self) -> ToolDefinition:
        def execute(arguments: BaseModel, context: AppObjectContext, request_id: str) -> ToolObservation:
            command = ReconstructionMockCommand(
                request_id=request_id, case_id=self.case_id, operation_id="generate.candidate",
                input_revisions={"source_anatomy_revision_id": self.source_anatomy_revision_id},
                parameters={"fixture_variant": arguments.fixture_variant},
            )
            try:
                result = self.service.execute_reconstruction(command)
            except OperationServiceError as error:
                raise ToolBoundaryError(error.code, "Sandbox operation could not complete.") from error
            if result.status == "completed" and result.source not in {"mock", "test-double"}:
                raise ToolBoundaryError("adapter-output-invalid", "Sandbox operation returned unsupported provenance.")
            return ToolObservation(scope="sandbox", operation_result=result)

        return ToolDefinition(
            name="generate.candidate", description="Generate a labeled synthetic artifact in isolated sandbox storage only.",
            arguments=ReconstructionArguments, execute=execute, scope="sandbox",
        )
