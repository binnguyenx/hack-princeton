"""Adapt authoritative application reads without copying or writing records."""

from typing import Mapping, Protocol

from pydantic import BaseModel, ConfigDict, Field

from skullfix_ai.integrations.workspace import WorkspaceError


class ApplicationProjectRepository(Protocol):
    def get_project_manifest(self, project_id: str) -> Mapping[str, object]: ...


class RepositoryManifestReader:
    def __init__(self, repository: ApplicationProjectRepository):
        self._repository = repository

    def get_project(self, project_id: str) -> Mapping[str, object]:
        try:
            return self._repository.get_project_manifest(project_id)
        except Exception as error:
            # Repository domain failures must not expose SQLite errors or file paths to the model.
            raise WorkspaceError("workspace-read-failed", "Application project could not be read.") from error


class GraphRequest(BaseModel):
    """Internal invocation context; not a new HTTP or idempotency contract."""

    model_config = ConfigDict(extra="forbid", strict=True)
    request_id: str = Field(min_length=1)
    conversation_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    case_id: str = Field(min_length=1)
    object_id: str = Field(min_length=1)
    expected_revision_id: str | None = Field(default=None, min_length=1)
    message: str = Field(min_length=1)
