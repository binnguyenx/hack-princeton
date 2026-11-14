"""Shared primitives for SkullFix AI/backend contract models."""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, JsonValue


NonEmptyString = Annotated[str, Field(strict=True, min_length=1)]

CaseId = NonEmptyString
SourceAnatomyRevisionId = NonEmptyString
CandidateId = NonEmptyString
CandidateRevisionId = NonEmptyString
ArtifactId = NonEmptyString
AnnotationId = NonEmptyString
RegionId = NonEmptyString
SelectionId = NonEmptyString
RequestId = NonEmptyString
RunId = NonEmptyString
ConversationId = NonEmptyString
OperationId = NonEmptyString


class RegisteredOperationId(str, Enum):
    """Known operation slots; registration does not imply availability."""

    GENERATE_CANDIDATE = "generate.candidate"
    GENERATE_CANDIDATE_FROM_CONTOUR = "generate.candidate.from_contour"
    MEASURE_CANDIDATE = "measure.candidate"
    INSPECT_CANDIDATE = "inspect.candidate"
    EDIT_LOCAL = "edit.local"
    COMPARE_REVISIONS = "compare.revisions"


class ContractModel(BaseModel):
    """Base model that rejects undocumented contract fields and coercion."""

    model_config = ConfigDict(extra="forbid")


class RequestLifecycleState(str, Enum):
    """Request-record lifecycle; persistence behavior is implemented elsewhere."""

    CLAIMED = "claimed"
    COMMAND_SELECTED = "command-selected"
    EXECUTING = "executing"
    READY_TO_COMMIT = "ready-to-commit"
    TERMINAL = "terminal"


class TerminalStatus(str, Enum):
    COMPLETED = "completed"
    UNSUPPORTED = "unsupported"
    UNAVAILABLE = "unavailable"
    STALE = "stale"
    FAILED = "failed"


class RunLifecycleState(str, Enum):
    ACCEPTED = "accepted"
    EXECUTING = "executing"
    READY_TO_COMMIT = "ready-to-commit"
    COMPLETED = "completed"
    UNSUPPORTED = "unsupported"
    UNAVAILABLE = "unavailable"
    STALE = "stale"
    FAILED = "failed"


class ProvenanceSource(str, Enum):
    REAL_OPERATION = "real-operation"
    MOCK = "mock"
    TEST_DOUBLE = "test-double"


class StructuredError(ContractModel):
    """Stable operation-result error.

    Transport and malformed-request validation errors are outside this model.
    Application services own the stable code vocabulary.
    """

    code: NonEmptyString
    message: NonEmptyString
    details: dict[str, JsonValue] = Field(default_factory=dict)


Limitation = NonEmptyString

