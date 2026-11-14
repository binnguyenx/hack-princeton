"""Typed model-facing tools; registry membership is not execution permission."""

from dataclasses import dataclass
from typing import Callable, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from skullfix_ai.schemas import OperationResult
from skullfix_ai.schemas.workspace import AppObjectContext


class ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ToolCall(ToolArguments):
    name: str = Field(min_length=1)
    arguments: dict[str, JsonValue]


class ToolObservation(ToolArguments):
    """Internal graph observation, not a replacement public operation envelope."""

    scope: Literal["application-read", "sandbox"]
    metadata: dict[str, JsonValue] = Field(default_factory=dict)
    operation_result: OperationResult | None = None


class ToolBoundaryError(Exception):
    def __init__(self, code: str, message: str, *, status: str = "failed"):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


Executor = Callable[[BaseModel, AppObjectContext, str], ToolObservation]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    arguments: type[BaseModel]
    execute: Executor | None
    scope: Literal["application-read", "sandbox"] = "application-read"

    def catalog_entry(self) -> dict[str, JsonValue]:
        return {"name": self.name, "description": self.description, "scope": self.scope,
                "available": self.execute is not None, "input_schema": self.arguments.model_json_schema()}


class ToolRegistry:
    def __init__(self, definitions: list[ToolDefinition]):
        self._tools = {definition.name: definition for definition in definitions}
        if len(self._tools) != len(definitions):
            raise ValueError("Tool names must be unique")

    def catalog(self) -> list[dict[str, JsonValue]]:
        return [definition.catalog_entry() for definition in self._tools.values()]

    def validate(self, proposal: ToolCall) -> tuple[ToolDefinition, BaseModel]:
        definition = self._tools.get(proposal.name)
        if definition is None:
            raise ToolBoundaryError("tool-unsupported", "Requested tool is not registered.", status="unsupported")
        try:
            arguments = definition.arguments.model_validate(proposal.arguments)
        except ValidationError as error:
            raise ToolBoundaryError("tool-arguments-invalid", "Tool arguments do not match the registered schema.") from error
        if definition.execute is None:
            raise ToolBoundaryError("operation-contract-missing", "The requested capability has no available operation contract.", status="unavailable")
        return definition, arguments
