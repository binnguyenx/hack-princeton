"""Read selected-object metadata; this does not perform geometry inspection."""

from pydantic import BaseModel

from skullfix_ai.schemas.workspace import AppObjectContext

from .registry import ToolArguments, ToolDefinition, ToolObservation


class DescribeSelectionArguments(ToolArguments):
    include_pose: bool = True


def describe_selection(arguments: BaseModel, context: AppObjectContext, request_id: str) -> ToolObservation:
    data = context.model_dump(mode="json")
    if not arguments.include_pose:
        data.pop("pose")
    return ToolObservation(scope="application-read", metadata=data)


def metadata_tool() -> ToolDefinition:
    return ToolDefinition(
        name="workspace.describe_selection", description="Read authoritative selection metadata; no geometry calculation.",
        arguments=DescribeSelectionArguments, execute=describe_selection,
    )
