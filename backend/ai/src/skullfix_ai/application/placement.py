"""Direct manual rigid placement policy, independent of chat/model composition."""
import math
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator


class PlacementError(ValueError):
    def __init__(self, code, message, status=409):
        self.code, self.status = code, status
        super().__init__(message)


def is_rigid_pose(pose):
    try:
        if len(pose) != 16 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in pose):
            return False
    except (OverflowError, TypeError):
        return False
    if any(abs(pose[i] - expected) > 1e-6 for i, expected in ((12, 0), (13, 0), (14, 0), (15, 1))):
        return False
    rows = [pose[start:start + 3] for start in (0, 4, 8)]
    for a in range(3):
        for b in range(3):
            if abs(sum(rows[a][k] * rows[b][k] for k in range(3)) - int(a == b)) > 1e-6:
                return False
    a, b, c = rows
    determinant = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
    return abs(determinant - 1) <= 1e-6


class PlacementCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str = Field(min_length=1, max_length=256)
    pose: list[StrictFloat | StrictInt] = Field(min_length=16, max_length=16)

    @field_validator('project_id', 'case_id', 'expected_revision_id')
    @classmethod
    def identity(cls, value):
        if not value.strip():
            raise ValueError('Identity must not be blank')
        return value

    @field_validator('pose')
    @classmethod
    def rigid(cls, value):
        if not is_rigid_pose(value):
            raise ValueError('Pose must be a finite right-handed rigid4x4 matrix')
        return value


class PlacementService:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, candidate_id, command: PlacementCommand):
        # Revalidate even direct Python callers; validation cannot depend on HTTP alone.
        command = PlacementCommand.model_validate(command.model_dump())
        revision = self.repository.commit_placement(candidate_id, command.project_id, command.case_id,
                                                    command.expected_revision_id, command.pose)
        return {'revisionId': revision}
