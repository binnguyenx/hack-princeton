"""Manual candidate-only voxel edits and deterministic grid-mirror completion."""
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
from uuid import uuid4
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, model_validator
from .binary_nrrd import VoxelError, decode_binary_nrrd, verify_header_spatial
from .landmarks import LandmarkError, patient_point
from .sqlite import IDENTITY_POSE
from .placement import is_rigid_pose

MAX_ROI = 4194304
PROVENANCE_DDL = '''CREATE TABLE IF NOT EXISTS revision_operations (
 revision_id TEXT PRIMARY KEY, provenance_json TEXT NOT NULL,
 FOREIGN KEY(revision_id) REFERENCES candidate_revisions(id) ON DELETE CASCADE)'''

class VoxelCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str = Field(min_length=1, max_length=256)
    operation: Literal['voxel.box', 'reconstruct.mirror-roi']
    bounds: list[list[StrictInt]] = Field(min_length=2, max_length=2)
    mode: Literal['fill', 'erase'] | None = None
    plane_i: StrictFloat | StrictInt | None = None

    @model_validator(mode='after')
    def parameters(self):
        if any(len(vector) != 3 for vector in self.bounds):
            raise ValueError('Bounds require two 3D IJK corners')
        if self.operation == 'voxel.box' and (self.mode is None or self.plane_i is not None):
            raise ValueError('Box requires fill/erase without a mirror plane')
        if self.operation == 'reconstruct.mirror-roi' and (self.mode is not None or self.plane_i is None):
            raise ValueError('Mirror requires an explicit I-plane without fill/erase')
        return self


def validate_bounds(command, sizes):
    low, high = command.bounds
    if any(a < 0 or b < a or b >= size for a, b, size in zip(low, high, sizes)):
        raise VoxelError('IJK bounds are outside the candidate grid')
    if math.prod(b - a + 1 for a, b in zip(low, high)) > MAX_ROI:
        raise VoxelError('ROI exceeds 4194304 voxels')
    if command.operation == 'reconstruct.mirror-roi':
        plane = command.plane_i
        if plane < 0 or plane > sizes[0] - 1 or not math.isfinite(plane) or not float(2 * plane).is_integer():
            raise VoxelError('Mirror I-plane must be inside the grid and aligned to a half voxel')
        if not (high[0] < plane or low[0] > plane):
            raise VoxelError('Mirror ROI must lie strictly on one side of the explicit plane')
        reflected = [int(2 * plane - high[0]), int(2 * plane - low[0])]
        if reflected[0] < 0 or reflected[1] >= sizes[0] or not (reflected[1] < low[0] or reflected[0] > high[0]):
            raise VoxelError('Reflected source ROI is outside the grid or overlaps the target')


class BinaryVoxelAdapter:
    """Pure, replaceable adapter. Both input byte buffers are immutable."""
    def execute(self, grid, source, command):
        output = bytearray(grid.voxels)
        low, high = command.bounds
        sx, sy, _ = grid.sizes
        for k in range(low[2], high[2] + 1):
            for j in range(low[1], high[1] + 1):
                start = low[0] + j * sx + k * sx * sy
                length = high[0] - low[0] + 1
                if command.operation == 'voxel.box':
                    output[start:start + length] = bytes([int(command.mode == 'fill')]) * length
                else:
                    for i in range(low[0], high[0] + 1):
                        target = i + j * sx + k * sx * sy
                        reflected = int(2 * command.plane_i - i) + j * sx + k * sx * sy
                        if output[target] == 0:
                            output[target] = source.voxels[reflected]
        return bytes(output)


def provenance_records(db):
    if not db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='revision_operations'").fetchone():
        return {}
    return {row['revision_id']: json.loads(row['provenance_json']) for row in db.execute('SELECT * FROM revision_operations')}


def validate_provenance(point, revision, revisions, candidates, samples):
    required = {'operation', 'parameters', 'inputRevisionId', 'sourceVolumeHash', 'changedVoxels'}
    if not isinstance(point, dict) or set(point) != required:
        raise VoxelError('Invalid revision provenance')
    previous = revisions.get(point['inputRevisionId']) if isinstance(point['inputRevisionId'], str) else None
    candidate = candidates[revision['candidateId']]
    sample = samples[candidate['sampleId']]
    if (not previous or previous['candidateId'] != revision['candidateId'] or previous['order'] >= revision['order']
            or point['sourceVolumeHash'] != sample['sourceAnatomy']['volumeHash']
            or type(point['changedVoxels']) is not int or not 0 < point['changedVoxels'] <= MAX_ROI):
        raise VoxelError('Invalid revision provenance ownership/count')
    expected_parameters = {'bounds', 'mode'} if point['operation'] == 'voxel.box' else {'bounds', 'plane_i'}
    if not isinstance(point['parameters'], dict) or set(point['parameters']) != expected_parameters:
        raise VoxelError('Invalid operation provenance parameters')
    command = VoxelCommand.model_validate({'project_id': 'package', 'case_id': 'package', 'expected_revision_id': previous['id'],
                                           'operation': point['operation'], **point['parameters']})
    validate_bounds(command, sample['sourceAnatomy']['spatial']['sizes'])


class VoxelService:
    def __init__(self, repository, adapter=None):
        self.repo = repository
        self.adapter = adapter if adapter is not None else BinaryVoxelAdapter()

    def execute(self, candidate_id, command):
        command = VoxelCommand.model_validate(command.model_dump())
        try:
            manifest = self.repo.read_project_manifest(command.project_id)
        except (ValueError, OSError) as error:
            raise VoxelError('Candidate project not found', 404) from error
        candidate = next((c for c in manifest['candidates'] if c['objectId'] == candidate_id), None)
        if not candidate:
            raise VoxelError('Candidate does not belong to this project', 409)
        sample = next(s for s in manifest['samples'] if s['id'] == candidate['sampleId'])
        if sample['caseId'] != command.case_id:
            raise VoxelError('Candidate does not belong to this case', 409)
        if candidate['currentRevisionId'] != command.expected_revision_id:
            raise VoxelError('Candidate revision changed; reload before editing', 409)
        revision = next(r for r in manifest['revisions'] if r['id'] == command.expected_revision_id and r['candidateId'] == candidate_id)
        if not is_rigid_pose(revision['pose']) or any(abs(a - b) > 1e-9 for a, b in zip(revision['pose'], IDENTITY_POSE)):
            raise VoxelError('Voxel tools require an identity pose; restore an unplaced revision first')
        if not sample['spatiallyVerified']:
            raise VoxelError('Voxel tools require verified source data')
        spatial = sample['sourceAnatomy']['spatial']
        try:
            patient_point(spatial, [0, 0, 0])
        except LandmarkError as error:
            raise VoxelError(str(error)) from error
        columns = spatial.get('spaceDirections', [[spatial['spacings'][0], 0, 0], [0, spatial['spacings'][1], 0], [0, 0, spatial['spacings'][2]]])
        for a in range(3):
            for b in range(a + 1, 3):
                if abs(sum(columns[a][k] * columns[b][k] for k in range(3))) > 1e-6:
                    raise VoxelError('Voxel prototype requires an orthogonal source grid')
        current_bytes = self.repo.read_revision_volume(candidate_id, revision['id'])
        source_bytes = self.repo.read_volume(command.project_id, sample['sourceAnatomy']['volumeId'])
        if hashlib.sha256(source_bytes).hexdigest() != sample['sourceAnatomy']['volumeHash']:
            raise VoxelError('Source volume integrity failed', 409)
        grid, source = decode_binary_nrrd(current_bytes), decode_binary_nrrd(source_bytes)
        if grid.sizes != source.sizes or list(grid.sizes) != spatial['sizes']:
            raise VoxelError('Candidate/source grids differ from verified spatial metadata')
        verify_header_spatial(grid, spatial)
        verify_header_spatial(source, spatial)
        validate_bounds(command, grid.sizes)
        output = self.adapter.execute(grid, source, command)
        if not isinstance(output, bytes) or len(output) != len(grid.voxels) or max(output, default=0) > 1:
            raise VoxelError('Voxel adapter returned an invalid binary grid')
        changed = 0
        previous = 0
        low, high = command.bounds
        sx, sy, _ = grid.sizes
        for k in range(low[2], high[2] + 1):
            for j in range(low[1], high[1] + 1):
                start = low[0] + j * sx + k * sx * sy
                end = high[0] + j * sx + k * sx * sy + 1
                if memoryview(output)[previous:start] != memoryview(grid.voxels)[previous:start]:
                    raise VoxelError('Voxel adapter modified data outside the ROI')
                if command.operation == 'voxel.box':
                    expected = bytes([int(command.mode == 'fill')]) * (end - start)
                else:
                    expected = bytes(grid.voxels[i + j * sx + k * sx * sy] or source.voxels[int(2 * command.plane_i - i) + j * sx + k * sx * sy] for i in range(low[0], high[0] + 1))
                if output[start:end] != expected:
                    raise VoxelError('Voxel adapter output violates the requested operation')
                changed += sum(a != b for a, b in zip(output[start:end], grid.voxels[start:end]))
                previous = end
        if memoryview(output)[previous:] != memoryview(grid.voxels)[previous:]:
            raise VoxelError('Voxel adapter modified data outside the ROI')
        if changed == 0 or not any(output):
            raise VoxelError('Operation has no changes or would empty the candidate')
        data = grid.encode(output)
        provenance = {'operation': command.operation, 'parameters': command.model_dump(include={'bounds', 'mode', 'plane_i'}, exclude_none=True),
                      'inputRevisionId': revision['id'], 'sourceVolumeHash': sample['sourceAnatomy']['volumeHash'], 'changedVoxels': changed}
        return self._commit(candidate_id, command, revision, data, provenance)

    def _commit(self, candidate_id, command, previous, data, provenance):
        identity, revision_id = str(uuid4()), str(uuid4())
        digest = hashlib.sha256(data).hexdigest()
        target = self.repo._volume_path(identity)
        published = committed = False
        stage = None
        try:
            with self.repo._db() as db:
                handle, name = tempfile.mkstemp(prefix='.voxel-', dir=self.repo.root)
                stage = Path(name)
                with os.fdopen(handle, 'wb') as output:
                    output.write(data)
                self.repo._fault('voxel_after_stage')
                with self.repo._transaction(db):
                    row = db.execute('SELECT c.current_revision_id,s.case_id,s.volume_hash,k.project_id FROM candidates c JOIN samples s ON s.id=c.sample_id JOIN cases k ON k.id=s.case_id WHERE c.id=?', (candidate_id,)).fetchone()
                    if (not row or row['current_revision_id'] != command.expected_revision_id or row['case_id'] != command.case_id
                            or row['project_id'] != command.project_id or row['volume_hash'] != provenance['sourceVolumeHash']):
                        raise VoxelError('Candidate/source context changed before commit', 409)
                    order = db.execute('SELECT COALESCE(MAX(ord),-1)+1 FROM candidate_revisions WHERE candidate_id=?', (candidate_id,)).fetchone()[0]
                    db.execute('INSERT INTO volume_assets VALUES(?,?,?,?)', (identity, 'volumes/' + identity + '.nrrd', digest, len(data)))
                    db.execute('INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)', (revision_id, candidate_id, order, identity, json.dumps(previous['pose']), digest))
                    db.execute('UPDATE candidates SET current_revision_id=? WHERE id=?', (revision_id, candidate_id))
                    db.execute(PROVENANCE_DDL)
                    db.execute('INSERT INTO revision_operations VALUES(?,?)', (revision_id, json.dumps(provenance)))
                    os.link(stage, target)
                    published = True
                    self.repo._fault('voxel_after_publish')
                committed = True
        finally:
            if published and not committed:
                target.unlink(missing_ok=True)
            if stage:
                stage.unlink(missing_ok=True)
        return {'revisionId': revision_id, 'volumeHash': digest, 'changedVoxels': provenance['changedVoxels'], 'operation': command.operation}
