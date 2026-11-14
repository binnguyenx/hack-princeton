"""Supported read tools and optional isolated sandbox generation."""

from .inspection import metadata_tool
from .reconstruction import SandboxReconstructionBinding
from .registry import ToolArguments, ToolBoundaryError, ToolCall, ToolDefinition, ToolObservation, ToolRegistry


def default_tool_registry(*, sandbox: SandboxReconstructionBinding | None = None) -> ToolRegistry:
    unavailable = ["measure.candidate", "inspect.candidate", "edit.local", "compare.revisions"]
    definitions = [metadata_tool()] + [
        ToolDefinition(name=name, description="Unavailable until an operation contract is agreed.",
                       arguments=ToolArguments, execute=None)
        for name in unavailable
    ]
    definitions.append(sandbox.tool() if sandbox else ToolDefinition(
        name="generate.candidate", description="Unavailable on live application data; sandbox binding is required.",
        arguments=ToolArguments, execute=None,
    ))
    return ToolRegistry(definitions)


__all__ = ["SandboxReconstructionBinding", "ToolArguments", "ToolBoundaryError", "ToolCall",
           "ToolDefinition", "ToolObservation", "ToolRegistry", "default_tool_registry"]
