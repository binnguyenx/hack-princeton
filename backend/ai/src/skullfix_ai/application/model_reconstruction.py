"""Generate a predicted bone fix from the frozen cranial model (cranial-reconstruction-candidate spec)."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .binary_nrrd import VoxelError, decode_binary_nrrd, verify_header_spatial
from .sqlite import IDENTITY_POSE
from .voxel_operations import PROVENANCE_DDL, VoxelCommand, provenance_records, validate_bounds

FIX_NAME = 'Predicted fix'
MODEL_OPERATION = 'reconstruct.model'
UNSUPPORTED = 'Only segmented skull masks (NRRD) are supported'
STAGES = ('Checking skull', 'Uploading skull', 'Waking model', 'Predicting missing bone',
          'Mapping fix onto skull', 'Building mesh', 'Saving candidate')


class ReconstructionError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


FIX_ASSETS_DDL = '''CREATE TABLE IF NOT EXISTS fix_assets (
 candidate_id TEXT PRIMARY KEY, probability_volume_id TEXT NOT NULL, default_threshold REAL NOT NULL,
 FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE)'''


class AdjustCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str = Field(min_length=1, max_length=256)
    threshold: float | None = Field(default=None, ge=0.1, le=0.9)
    region: list[list[int]] | None = Field(default=None, min_length=2, max_length=2)

    @model_validator(mode='after')
    def something_to_change(self):
        if self.threshold is None and self.region is None:
            raise ValueError('Adjustment needs a threshold or a region')
        if self.region is not None and any(len(corner) != 3 for corner in self.region):
            raise ValueError('Region requires two 3D IJK corners')
        return self


class StartCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)


def run_in_thread(fn):
    threading.Thread(target=fn, daemon=True).start()


class RunRegistry:
    """In-memory run state keyed by run id. Runs do not survive a backend restart (spec Design)."""

    def __init__(self, runner=run_in_thread):
        self.runner = runner
        self._runs = {}
        self._lock = threading.Lock()

    def create(self, sample_id):
        run_id = str(uuid4())
        with self._lock:
            if any(r['sampleId'] == sample_id and r['status'] == 'running' for r in self._runs.values()):
                raise ReconstructionError('run-in-progress', 'A fix is already being generated for this skull', 409)
            self._runs[run_id] = {'runId': run_id, 'sampleId': sample_id, 'status': 'running',
                                  'stage': STAGES[0], 'startedAt': time.time()}
        return run_id

    def update(self, run_id, **fields):
        with self._lock:
            self._runs[run_id].update(fields)

    def get(self, run_id):
        with self._lock:
            run = self._runs.get(run_id)
            return None if run is None else {**run, 'elapsedS': round(time.time() - run['startedAt'], 1)}


class ModelReconstructionService:
    def __init__(self, repository, endpoint, runs: RunRegistry, *, clock=time.monotonic, sleep=time.sleep,
                 poll_interval_s: float = 5.0, timeout_s: float = 900.0):
        self.repo = repository
        self.endpoint = endpoint
        self.runs = runs
        self.clock, self.sleep = clock, sleep
        self.poll_interval_s, self.timeout_s = poll_interval_s, timeout_s

    def start(self, sample_id: str, command: StartCommand) -> str:
        if self.endpoint is None:
            raise ReconstructionError('model-endpoint-unconfigured',
                                      'The cranial model endpoint is not configured.', 503)
        context = self._source_context(sample_id, command)
        run_id = self.runs.create(sample_id)
        self.runs.runner(lambda: self._execute(run_id, context))
        return run_id

    def status(self, run_id: str) -> dict:
        run = self.runs.get(run_id)
        if run is None:
            raise ReconstructionError('run-not-found', 'Reconstruction run not found.', 404)
        return run

    def _source_context(self, sample_id, command):
        manifest = self.repo.read_project_manifest(command.project_id)
        sample = next((s for s in manifest['samples'] if s['id'] == sample_id), None)
        if sample is None or sample['caseId'] != command.case_id:
            raise ReconstructionError('sample-not-found', 'Sample not found in this case.', 404)
        anatomy = sample['sourceAnatomy']
        if not sample['spatiallyVerified']:
            raise ReconstructionError('unsupported-input', UNSUPPORTED + '; this skull has no verified spatial metadata.')
        source_bytes = self.repo.read_volume(command.project_id, anatomy['volumeId'])
        if hashlib.sha256(source_bytes).hexdigest() != anatomy['volumeHash']:
            raise ReconstructionError('source-integrity', 'The skull volume failed its integrity check.', 409)
        try:
            grid = decode_binary_nrrd(source_bytes)
            verify_header_spatial(grid, anatomy['spatial'])
        except VoxelError as error:
            raise ReconstructionError('unsupported-input', UNSUPPORTED + '; ' + str(error) + '.') from error
        if not any(grid.voxels):
            raise ReconstructionError('unsupported-input', UNSUPPORTED + '; the mask is empty.')
        spacing = anatomy['spatial']['spacings']
        columns = anatomy['spatial'].get('spaceDirections', [[spacing[0], 0, 0], [0, spacing[1], 0], [0, 0, spacing[2]]])
        if any(abs(sum(columns[a][i] * columns[b][i] for i in range(3))) > 1e-6 for a in range(3) for b in range(a + 1, 3)):
            raise ReconstructionError('unsupported-input', UNSUPPORTED + '; the grid is not orthogonal.')
        return {'sample': sample, 'command': command, 'source_bytes': source_bytes}

    def _execute(self, run_id, context):
        started = self.clock()
        try:
            self.runs.update(run_id, stage='Uploading skull')
            handle = self.endpoint.submit(run_id, context['source_bytes'])
            self.runs.update(run_id, stage='Waking model')
            poll = self._wait(run_id, handle, started)
            self.runs.update(run_id, stage='Mapping fix onto skull')
            source = decode_binary_nrrd(context['source_bytes'])
            implant = self._validated_implant(poll.implant, source)
            probability = self._validated_probability(poll.probability, source)
            meta = poll.metadata
            self.runs.update(run_id, stage='Saving candidate')
            result = self._commit_generated(context, source, implant.voxels, probability, {
                'operation': MODEL_OPERATION, 'model': meta['model'], 'checkpointHash': meta['checkpoint_hash'],
                'freezeRunId': meta['freeze_run_id'], 'threshold': meta['threshold'], 'thresholdIsDefault': True,
                'region': None, 'sourceVolumeHash': context['sample']['sourceAnatomy']['volumeHash'],
                'implantVoxels': sum(implant.voxels), 'inferenceSeconds': meta['inference_seconds'],
                'totalSeconds': round(self.clock() - started, 3)})
            self.runs.update(run_id, status='succeeded', stage=STAGES[-1], result=result)
        except ReconstructionError as error:
            self.runs.update(run_id, status='failed', error={'code': error.code, 'message': error.message})
        except Exception:
            self.runs.update(run_id, status='failed', error={'code': 'reconstruction-failed',
                                                             'message': 'Generating the fix failed. Nothing was saved.'})

    def _wait(self, run_id, handle, started):
        # The async endpoint exposes no progress. "Predicting" after the first pending poll is an
        # estimate (spec R10 allows estimated stages within the endpoint wait).
        while True:
            poll = self.endpoint.poll(handle)
            if poll.status == 'done':
                return poll
            if poll.status == 'failed':
                raise ReconstructionError('endpoint-failed', 'The model endpoint reported an error: ' + (poll.error or 'unknown'))
            if self.clock() - started >= self.timeout_s:
                raise ReconstructionError('timeout', f'No result from the model within {int(self.timeout_s // 60)} minutes.')
            self.runs.update(run_id, stage='Predicting missing bone')
            self.sleep(self.poll_interval_s)

    @staticmethod
    def _validated_implant(data, source):
        try:
            implant = decode_binary_nrrd(data or b'')
        except VoxelError as error:
            code = 'non-binary-prediction' if 'binary' in str(error) else 'unreadable-prediction'
            raise ReconstructionError(code, 'The model returned an invalid volume: ' + str(error)) from error
        if implant.sizes != source.sizes or len(implant.voxels) != len(source.voxels):
            raise ReconstructionError('grid-mismatch', "The model's output grid does not match the skull.")
        if not any(implant.voxels):
            raise ReconstructionError('empty-prediction', 'The model predicted no missing bone for this skull.')
        if any(a and b for a, b in zip(source.voxels, implant.voxels)):
            raise ReconstructionError('overlaps-source-bone', 'The predicted fix overlaps existing bone.')
        return implant

    @staticmethod
    def _validated_probability(data, source):
        try:
            probability = decode_binary_nrrd(data or b'', binary=False)
        except VoxelError as error:
            raise ReconstructionError('unreadable-prediction', 'The model returned an invalid probability volume.') from error
        if probability.sizes != source.sizes:
            raise ReconstructionError('grid-mismatch', "The model's output grid does not match the skull.")
        return source.encode(probability.voxels)

    # -- fix report (R14–R17) ------------------------------------------------------------

    def report(self, candidate_id: str, project_id: str, case_id: str) -> dict:
        from .fix_report import fix_statistics, ml_record
        manifest = self.repo.read_project_manifest(project_id)
        candidate = next((c for c in manifest['candidates'] if c['objectId'] == candidate_id), None)
        sample = candidate and next(s for s in manifest['samples'] if s['id'] == candidate['sampleId'])
        if candidate is None or sample['caseId'] != case_id:
            raise ReconstructionError('candidate-not-found', 'Candidate not found in this case.', 404)
        revision = next(r for r in manifest['revisions'] if r['id'] == candidate['currentRevisionId'])
        provenance = revision.get('provenance')
        if not provenance or provenance.get('operation') != MODEL_OPERATION:
            raise ReconstructionError('not-a-model-fix', 'This candidate is not a predicted fix.', 422)
        anatomy = sample['sourceAnatomy']
        stats = fix_statistics(self.repo.read_volume(project_id, anatomy['volumeId']),
                               self.repo.read_revision_volume(candidate_id, revision['id']), anatomy['spatial'])
        return {'candidateId': candidate_id, 'revisionId': revision['id'], 'fix': stats, 'mlRecord': ml_record(provenance)}

    # -- tailoring (R18, R19) -------------------------------------------------------------

    def adjust(self, candidate_id: str, command: AdjustCommand) -> dict:
        started = self.clock()
        manifest = self.repo.read_project_manifest(command.project_id)
        candidate = next((c for c in manifest['candidates'] if c['objectId'] == candidate_id), None)
        if candidate is None:
            raise ReconstructionError('candidate-not-found', 'Candidate not found in this project.', 404)
        sample = next(s for s in manifest['samples'] if s['id'] == candidate['sampleId'])
        if sample['caseId'] != command.case_id:
            raise ReconstructionError('candidate-not-found', 'Candidate not found in this case.', 404)
        if candidate['currentRevisionId'] != command.expected_revision_id:
            raise ReconstructionError('revision-changed', 'The fix changed; reload before adjusting.', 409)
        revision = next(r for r in manifest['revisions'] if r['id'] == command.expected_revision_id)
        previous = revision.get('provenance')
        asset = self._fix_asset(candidate_id)
        if asset is None or not previous or previous.get('operation') != MODEL_OPERATION:
            raise ReconstructionError('not-a-model-fix', 'Only a predicted fix can be adjusted this way.', 422)
        source = decode_binary_nrrd(self.repo.read_volume(command.project_id, sample['sourceAnatomy']['volumeId']))
        probability = decode_binary_nrrd(self.repo.read_volume(command.project_id, asset['probability_volume_id']), binary=False)
        threshold = previous['threshold'] if command.threshold is None else command.threshold
        region = command.region if command.region is not None else previous['region']
        if region is not None:
            try:
                validate_bounds(VoxelCommand.model_validate({
                    'project_id': command.project_id, 'case_id': command.case_id, 'expected_revision_id': command.expected_revision_id,
                    'operation': 'voxel.box', 'bounds': region, 'mode': 'fill'}), source.sizes)
            except (VoxelError, ValueError) as error:
                raise ReconstructionError('invalid-request', 'Region is outside the skull grid.') from error
        implant = self._threshold(probability.voxels, source, threshold, region)
        if not any(implant):
            raise ReconstructionError('empty-fix', 'This adjustment leaves no fix voxels.')
        provenance = {**previous, 'threshold': threshold, 'thresholdIsDefault': threshold == asset['default_threshold'],
                      'region': region, 'implantVoxels': sum(implant), 'inputRevisionId': revision['id'],
                      'totalSeconds': round(self.clock() - started, 3)}
        union = source.encode(bytes(a | b for a, b in zip(source.voxels, implant)))
        return self._commit_adjusted(candidate_id, command, revision, union, provenance)

    @staticmethod
    def _threshold(probability, source, threshold, region):
        cut = threshold * 255
        sx, sy, _ = source.sizes
        low, high = region if region is not None else ([0, 0, 0], [n - 1 for n in source.sizes])
        out = bytearray(len(probability))
        for k in range(low[2], high[2] + 1):
            for j in range(low[1], high[1] + 1):
                for i in range(low[0], high[0] + 1):
                    index = i + j * sx + k * sx * sy
                    if probability[index] >= cut and not source.voxels[index]:
                        out[index] = 1
        return bytes(out)

    def _fix_asset(self, candidate_id):
        with self.repo._db() as db:
            if not db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fix_assets'").fetchone():
                return None
            return db.execute('SELECT * FROM fix_assets WHERE candidate_id=?', (candidate_id,)).fetchone()

    # -- commits ----------------------------------------------------------------------

    def _publish(self, volumes, write):
        """Stage volume files, run write(db) in one transaction, then hard-link files into place.

        Either every row and file is published, or none is (same discipline as VoxelService._commit).
        """
        staged, published, committed = [], [], False
        try:
            with self.repo._db() as db:
                for volume_id, data in volumes:
                    handle, name = tempfile.mkstemp(prefix='.model-fix-', dir=self.repo.root)
                    with os.fdopen(handle, 'wb') as output:
                        output.write(data)
                    staged.append((Path(name), self.repo._volume_path(volume_id)))
                with self.repo._transaction(db):
                    for volume_id, data in volumes:
                        db.execute('INSERT INTO volume_assets VALUES(?,?,?,?)',
                                   (volume_id, 'volumes/' + volume_id + '.nrrd', hashlib.sha256(data).hexdigest(), len(data)))
                    write(db)
                    for stage, target in staged:
                        os.link(stage, target)
                        published.append(target)
                committed = True
        finally:
            if not committed:
                for target in published:
                    target.unlink(missing_ok=True)
            for stage, _ in staged:
                stage.unlink(missing_ok=True)

    def _commit_generated(self, context, source, implant, probability, provenance):
        sample, command = context['sample'], context['command']
        candidate_id, base_id, fix_id, volume_id, probability_id = (str(uuid4()) for _ in range(5))
        provenance = {**provenance, 'inputRevisionId': base_id}
        data = source.encode(bytes(a | b for a, b in zip(source.voxels, implant)))
        digest = hashlib.sha256(data).hexdigest()

        def write(db):
            row = db.execute('SELECT s.volume_id,s.volume_hash,s.case_id,k.project_id FROM samples s JOIN cases k ON k.id=s.case_id '
                             'WHERE s.id=?', (sample['id'],)).fetchone()
            if (not row or row['case_id'] != command.case_id or row['project_id'] != command.project_id
                    or row['volume_hash'] != provenance['sourceVolumeHash']):
                raise ReconstructionError('source-changed', 'The skull changed before the fix was saved.', 409)
            db.execute('INSERT INTO candidates VALUES(?,?,?,?)', (candidate_id, sample['id'], FIX_NAME, fix_id))
            db.execute('INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)',
                       (base_id, candidate_id, 0, row['volume_id'], json.dumps(IDENTITY_POSE), row['volume_hash']))
            db.execute('INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)',
                       (fix_id, candidate_id, 1, volume_id, json.dumps(IDENTITY_POSE), digest))
            db.execute(PROVENANCE_DDL)
            db.execute('INSERT INTO revision_operations VALUES(?,?)', (fix_id, json.dumps(provenance)))
            db.execute(FIX_ASSETS_DDL)
            db.execute('INSERT INTO fix_assets VALUES(?,?,?)', (candidate_id, probability_id, provenance['threshold']))

        self._publish([(volume_id, data), (probability_id, probability)], write)
        return {'candidateId': candidate_id, 'revisionId': fix_id, 'implantVoxels': provenance['implantVoxels']}

    def _commit_adjusted(self, candidate_id, command, previous, data, provenance):
        revision_id, volume_id = str(uuid4()), str(uuid4())
        digest = hashlib.sha256(data).hexdigest()

        def write(db):
            row = db.execute('SELECT current_revision_id FROM candidates WHERE id=?', (candidate_id,)).fetchone()
            if not row or row['current_revision_id'] != command.expected_revision_id:
                raise ReconstructionError('revision-changed', 'The fix changed; reload before adjusting.', 409)
            order = db.execute('SELECT COALESCE(MAX(ord),-1)+1 FROM candidate_revisions WHERE candidate_id=?', (candidate_id,)).fetchone()[0]
            db.execute('INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)',
                       (revision_id, candidate_id, order, volume_id, json.dumps(previous['pose']), digest))
            db.execute('UPDATE candidates SET current_revision_id=? WHERE id=?', (revision_id, candidate_id))
            db.execute(PROVENANCE_DDL)
            db.execute('INSERT INTO revision_operations VALUES(?,?)', (revision_id, json.dumps(provenance)))

        self._publish([(volume_id, data)], write)
        return {'candidateId': candidate_id, 'revisionId': revision_id, 'implantVoxels': provenance['implantVoxels'],
                'threshold': provenance['threshold'], 'thresholdIsDefault': provenance['thresholdIsDefault']}
