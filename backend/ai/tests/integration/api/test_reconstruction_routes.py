"""Model fix generation over HTTP with a fake SageMaker endpoint (cranial-reconstruction-candidate spec)."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

SIZES = [4, 4, 2]
META = {'units': 'mm', 'space': 'left-posterior-superior', 'sizes': SIZES, 'spacings': [1, 1, 1], 'bboxMm': [4, 4, 2]}
HEADER = b'NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 4 4 2\nencoding: raw\n\n'
# Source bone: the first slab row (j == 0) on both k slices; everything else is the "defect".
SOURCE = bytes(1 if j == 0 else 0 for k in range(2) for j in range(4) for i in range(4))


DEFECT_ROW = bytes(1 if j == 1 else 0 for k in range(2) for j in range(4) for i in range(4))
METADATA = {'checkpoint_hash': 'sha256:' + 'f' * 64, 'freeze_run_id': 'run_test', 'threshold': 0.5,
            'model': 'cranial-unet-v2', 'inference_seconds': 2.5}


def probability(voxels):
    """uint8 probability grid: 230 where the fake model is confident, 40 elsewhere (threshold 0.5 → 128)."""
    return HEADER + bytes(230 if v else 40 for v in voxels)


class FakeEndpoint:
    """Controlled SageMaker double: returns preset outputs and records submitted inputs."""

    def __init__(self, implant=DEFECT_ROW, metadata=METADATA, error=None, header=HEADER):
        self.implant, self.metadata, self.error, self.header = implant, metadata, error, header
        self.submitted = []

    def submit(self, run_id, nrrd):
        self.submitted.append((run_id, nrrd))
        return run_id

    def poll(self, handle):
        from skullfix_ai.integrations.geometry.model_endpoint import EndpointPoll
        if self.error:
            return EndpointPoll(status='failed', error=self.error)
        return EndpointPoll(status='done', implant=self.header + self.implant, probability=probability(self.implant),
                            metadata=dict(self.metadata))


def sync(fn):
    fn()


class ReconstructionRouteTest(unittest.TestCase):
    def make_app(self, endpoint=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'application'
        self.repo = ApplicationRepository(self.root)
        project = self.repo.create_project('Volume')
        case = self.repo.add_case(project['id'], 'Case')
        self.project_id, self.case_id = project['id'], case['id']
        self.sample = self.repo.add_sample(project['id'], case['id'], 'Skull', True, META, HEADER + SOURCE)
        client = TestClient(create_app(self.root, repository=self.repo, model_endpoint=endpoint,
                                       reconstruction_runner=sync))
        self.addCleanup(client.close)
        return client

    def files(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (self.root / 'volumes').iterdir() if p.is_file()}

    def start(self, client):
        return client.post('/api/samples/' + self.sample['id'] + '/reconstructions',
                           json={'project_id': self.project_id, 'case_id': self.case_id})

    def test_unconfigured_endpoint_reports_unavailable_and_writes_nothing(self):
        client = self.make_app(endpoint=None)
        before_manifest, before_files = self.repo.get_project_manifest(self.project_id), self.files()
        response = self.start(client)
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.json()['code'], 'model-endpoint-unconfigured')
        self.assertEqual(self.repo.get_project_manifest(self.project_id), before_manifest)
        self.assertEqual(self.files(), before_files)

    def test_generated_fix_is_new_candidate_with_source_plus_implant_and_full_provenance(self):
        endpoint = FakeEndpoint()
        client = self.make_app(endpoint)
        existing = self.repo.create_candidate(self.sample['id'])
        response = self.start(client)
        self.assertEqual(response.status_code, 202, response.text)
        run = client.get('/api/reconstructions/' + response.json()['runId']).json()
        self.assertEqual(run['status'], 'succeeded', run)
        self.assertEqual(endpoint.submitted[0][1], HEADER + SOURCE)
        manifest = self.repo.get_project_manifest(self.project_id)
        fix = next(c for c in manifest['candidates'] if c['objectId'] == run['result']['candidateId'])
        self.assertEqual(fix['displayName'], 'Predicted fix')
        revisions = sorted((r for r in manifest['revisions'] if r['candidateId'] == fix['objectId']), key=lambda r: r['order'])
        self.assertEqual([r['order'] for r in revisions], [0, 1])
        self.assertEqual(fix['currentRevisionId'], revisions[1]['id'])
        self.assertEqual(self.repo.read_revision_volume(fix['objectId'], revisions[0]['id']), HEADER + SOURCE)
        union = bytes(a | b for a, b in zip(SOURCE, DEFECT_ROW))
        self.assertEqual(self.repo.read_revision_volume(fix['objectId'], revisions[1]['id']), HEADER + union)
        provenance = revisions[1]['provenance']
        self.assertEqual(set(provenance), {'operation', 'model', 'checkpointHash', 'freezeRunId', 'threshold',
                                           'thresholdIsDefault', 'region', 'inputRevisionId', 'sourceVolumeHash',
                                           'implantVoxels', 'inferenceSeconds', 'totalSeconds'})
        self.assertEqual(provenance['operation'], 'reconstruct.model')
        self.assertEqual(provenance['checkpointHash'], METADATA['checkpoint_hash'])
        self.assertEqual(provenance['implantVoxels'], 8)
        self.assertTrue(provenance['thresholdIsDefault'])
        self.assertIsNone(provenance['region'])
        self.assertEqual(provenance['inputRevisionId'], revisions[0]['id'])
        old = next(c for c in manifest['candidates'] if c['objectId'] == existing['candidateId'])
        self.assertEqual(old['currentRevisionId'], existing['revisionId'])

    def test_invalid_model_outputs_fail_with_reason_and_commit_nothing(self):
        overlap = bytearray(DEFECT_ROW)
        overlap[0] = 1  # voxel (0,0,0) is source bone
        cases = {
            'empty-prediction': FakeEndpoint(implant=bytes(len(SOURCE))),
            'non-binary-prediction': FakeEndpoint(implant=bytes([2]) + DEFECT_ROW[1:]),
            'grid-mismatch': FakeEndpoint(implant=DEFECT_ROW[:16], header=HEADER.replace(b'sizes: 4 4 2', b'sizes: 4 4 1')),
            'overlaps-source-bone': FakeEndpoint(implant=bytes(overlap)),
            'endpoint-failed': FakeEndpoint(error='ModelError: out of memory'),
        }
        for code, endpoint in cases.items():
            with self.subTest(code):
                client = self.make_app(endpoint)
                before_manifest, before_files = self.repo.get_project_manifest(self.project_id), self.files()
                run_id = self.start(client).json()['runId']
                run = client.get('/api/reconstructions/' + run_id).json()
                self.assertEqual(run['status'], 'failed', run)
                self.assertEqual(run['error']['code'], code)
                self.assertTrue(run['error']['message'])
                self.assertEqual(self.repo.get_project_manifest(self.project_id), before_manifest)
                self.assertEqual(self.files(), before_files)

    def test_no_result_within_timeout_fails_and_commits_nothing(self):
        from skullfix_ai.application.model_reconstruction import ModelReconstructionService, RunRegistry, StartCommand
        from skullfix_ai.integrations.geometry.model_endpoint import EndpointPoll

        class Pending(FakeEndpoint):
            def poll(self, handle):
                return EndpointPoll(status='pending')
        self.make_app()
        now = [0.0]
        runs = RunRegistry(runner=sync)
        service = ModelReconstructionService(self.repo, Pending(), runs, clock=lambda: now[0],
                                             sleep=lambda s: now.__setitem__(0, now[0] + s),
                                             poll_interval_s=60, timeout_s=900)
        before = self.repo.get_project_manifest(self.project_id)
        run_id = service.start(self.sample['id'], StartCommand(project_id=self.project_id, case_id=self.case_id))
        run = service.status(run_id)
        self.assertEqual((run['status'], run['error']['code']), ('failed', 'timeout'))
        self.assertGreaterEqual(now[0], 900)
        self.assertEqual(self.repo.get_project_manifest(self.project_id), before)

    def test_unsupported_inputs_are_rejected_before_upload(self):
        endpoint = FakeEndpoint()
        client = self.make_app(endpoint)
        unverified = self.repo.add_sample(self.project_id, self.case_id, 'Unverified', False, META, HEADER + SOURCE)
        ct_like = self.repo.add_sample(self.project_id, self.case_id, 'CT', True, META, HEADER + bytes([200]) + SOURCE[1:])
        for sample in (unverified, ct_like):
            with self.subTest(sample['displayName'] if 'displayName' in sample else sample['id']):
                response = client.post('/api/samples/' + sample['id'] + '/reconstructions',
                                       json={'project_id': self.project_id, 'case_id': self.case_id})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()['code'], 'unsupported-input')
                self.assertIn('Only segmented skull masks (NRRD) are supported', response.json()['error'])
        self.assertEqual(endpoint.submitted, [])

    def test_second_run_on_same_skull_is_refused_while_first_is_active(self):
        queued = []
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.make_app()
        client = TestClient(create_app(self.root, repository=self.repo, model_endpoint=FakeEndpoint(),
                                       reconstruction_runner=queued.append))
        self.addCleanup(client.close)
        self.assertEqual(self.start(client).status_code, 202)
        second = self.start(client)
        self.assertEqual(second.status_code, 409, second.text)
        self.assertEqual(second.json()['error'], 'A fix is already being generated for this skull')
        queued[0]()
        self.assertEqual(self.start(client).status_code, 202)

    def test_run_reports_stages_in_spec_order_and_ends_on_real_result(self):
        from skullfix_ai.application.model_reconstruction import (
            STAGES, ModelReconstructionService, RunRegistry, StartCommand)
        from skullfix_ai.integrations.geometry.model_endpoint import EndpointPoll
        seen = []
        holder = {}

        class Observing(FakeEndpoint):
            def __init__(self):
                super().__init__()
                self.polls = 0

            def submit(self, run_id, nrrd):
                seen.append(holder['service'].status(run_id)['stage'])
                return run_id

            def poll(self, handle):
                seen.append(holder['service'].status(handle)['stage'])
                self.polls += 1
                return EndpointPoll(status='pending') if self.polls == 1 else super().poll(handle)
        self.make_app()
        service = ModelReconstructionService(self.repo, Observing(), RunRegistry(runner=sync), sleep=lambda s: None)
        holder['service'] = service
        run_id = service.start(self.sample['id'], StartCommand(project_id=self.project_id, case_id=self.case_id))
        final = service.status(run_id)
        seen.append(final['stage'])
        self.assertEqual(seen, ['Uploading skull', 'Waking model', 'Predicting missing bone', 'Saving candidate'])
        self.assertTrue(all(stage in STAGES for stage in seen))
        self.assertEqual(final['status'], 'succeeded')

    def test_project_with_model_fix_survives_package_save_and_open(self):
        client = self.make_app(FakeEndpoint())
        run = client.get('/api/reconstructions/' + self.start(client).json()['runId']).json()
        exported = client.post('/api/projects/' + self.project_id + '/package', json={})
        self.assertEqual(exported.status_code, 200, exported.text)
        imported = client.post('/api/packages/import', content=exported.content, headers={'content-type': 'application/zip'})
        self.assertEqual(imported.status_code, 201, imported.text)
        copy = self.repo.get_project_manifest(imported.json()['projectId'])
        fix = next(c for c in copy['candidates'] if c.get('displayName') == 'Predicted fix')
        revision = next(r for r in copy['revisions'] if r['id'] == fix['currentRevisionId'])
        self.assertEqual(revision['provenance']['operation'], 'reconstruct.model')
        self.assertEqual(revision['provenance']['implantVoxels'], run['result']['implantVoxels'])
        union = bytes(a | b for a, b in zip(SOURCE, DEFECT_ROW))
        self.assertEqual(self.repo.read_revision_volume(fix['objectId'], revision['id']), HEADER + union)

    def test_skull_removed_during_inference_fails_commit_and_leaves_no_files(self):
        test = self

        class RemovesSkull(FakeEndpoint):
            def poll(self, handle):
                test.repo.remove_sample(test.project_id, test.case_id, test.sample['id'])
                test.files_after_removal = test.files()
                return super().poll(handle)
        client = self.make_app(RemovesSkull())
        run = client.get('/api/reconstructions/' + self.start(client).json()['runId']).json()
        self.assertEqual((run['status'], run['error']['code']), ('failed', 'source-changed'))
        self.assertEqual(self.files(), self.files_after_removal)
        self.assertEqual(self.repo.get_project_manifest(self.project_id)['candidates'], [])
        self.assertEqual([p.name for p in self.root.iterdir() if p.name.startswith('.model-fix-')], [])

    def generate_graded_fix(self):
        """Fix row j == 1: i < 2 at p = 230/255, i >= 2 at p = 150/255; source bone at p = 250/255 (must stay excluded)."""
        graded = bytes(250 if j == 0 else (230 if i < 2 else 150) if j == 1 else 10
                       for k in range(2) for j in range(4) for i in range(4))

        class Graded(FakeEndpoint):
            def poll(self, handle):
                done = super().poll(handle)
                return type(done)(status='done', implant=done.implant, probability=HEADER + graded, metadata=done.metadata)
        self.endpoint = Graded()
        client = self.make_app(self.endpoint)
        run = client.get('/api/reconstructions/' + self.start(client).json()['runId']).json()
        return client, run['result']

    def adjust(self, client, fix, **change):
        body = {'project_id': self.project_id, 'case_id': self.case_id, 'expected_revision_id': fix['revisionId'], **change}
        return client.post('/api/candidates/' + fix['candidateId'] + '/fix-adjustment', json=body)

    def test_threshold_change_recomputes_fix_locally_as_new_revision(self):
        client, fix = self.generate_graded_fix()
        response = self.adjust(client, fix, threshold=0.7)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(self.endpoint.submitted), 1)
        manifest = self.repo.get_project_manifest(self.project_id)
        revision = next(r for r in manifest['revisions'] if r['id'] == response.json()['revisionId'])
        self.assertEqual((revision['candidateId'], revision['order']), (fix['candidateId'], 2))
        kept = bytes(1 if j == 1 and i < 2 else 0 for k in range(2) for j in range(4) for i in range(4))
        expected = bytes(a | b for a, b in zip(SOURCE, kept))
        self.assertEqual(self.repo.read_revision_volume(fix['candidateId'], revision['id']), HEADER + expected)
        provenance = revision['provenance']
        self.assertEqual((provenance['threshold'], provenance['thresholdIsDefault'], provenance['implantVoxels']), (0.7, False, 4))
        self.assertEqual(provenance['inputRevisionId'], fix['revisionId'])
        self.assertEqual(provenance['checkpointHash'], METADATA['checkpoint_hash'])

    def test_region_keeps_only_fix_voxels_inside_box(self):
        client, fix = self.generate_graded_fix()
        response = self.adjust(client, fix, region=[[0, 0, 0], [0, 3, 1]])
        self.assertEqual(response.status_code, 201, response.text)
        provenance = next(r for r in self.repo.get_project_manifest(self.project_id)['revisions']
                          if r['id'] == response.json()['revisionId'])['provenance']
        self.assertEqual((provenance['implantVoxels'], provenance['region'], provenance['thresholdIsDefault']),
                         (2, [[0, 0, 0], [0, 3, 1]], True))

    def test_invalid_adjustments_are_refused_without_new_revision(self):
        client, fix = self.generate_graded_fix()
        before = self.repo.get_project_manifest(self.project_id)
        for change, status, code in (({'threshold': 0.95}, 422, 'invalid-request'),
                                     ({'threshold': 0.05}, 422, 'invalid-request'),
                                     ({'region': [[3, 3, 0], [3, 3, 1]]}, 422, 'empty-fix'),
                                     ({'threshold': 0.7, 'expected_revision_id': 'stale'}, 409, 'revision-changed')):
            with self.subTest(change):
                response = self.adjust(client, fix, **change)
                self.assertEqual((response.status_code, response.json()['code']), (status, code), response.text)
        self.assertEqual(self.repo.get_project_manifest(self.project_id), before)

    def test_region_errors_name_the_actual_problem(self):
        client, fix = self.generate_graded_fix()
        outside = self.adjust(client, fix, region=[[0, 0, 0], [9, 3, 1]])
        self.assertEqual(outside.json()['error'], 'Region is outside the skull grid.')
        from unittest import mock
        with mock.patch('skullfix_ai.application.voxel_operations.MAX_ROI', 4):
            large = self.adjust(client, fix, region=[[0, 0, 0], [3, 3, 1]])
        self.assertEqual(large.status_code, 422)
        self.assertIn('too large', large.json()['error'])

    def test_unreadable_probability_volume_is_a_coded_error(self):
        client, fix = self.generate_graded_fix()
        from skullfix_ai.application.model_reconstruction import ModelReconstructionService
        asset = ModelReconstructionService(self.repo, None, None)._fix_asset(fix['candidateId'])
        path = self.repo._volume_path(asset['probability_volume_id'])
        path.write_bytes(b'not an nrrd')
        response = self.adjust(client, fix, threshold=0.7)
        self.assertEqual(response.status_code // 100, 4, response.text)
        self.assertIn('code', response.json())


class RunRegistryTest(unittest.TestCase):
    def test_finished_runs_are_pruned_and_running_runs_are_kept(self):
        from skullfix_ai.application.model_reconstruction import RunRegistry
        now = [0.0]
        runs = RunRegistry(retention_s=10, max_finished=2, clock=lambda: now[0])
        old = runs.create('a')
        runs.update(old, status='succeeded')
        active = runs.create('b')
        now[0] = 20
        recent = [runs.create(s) for s in ('c', 'd', 'e')]
        for run_id in recent:
            runs.update(run_id, status='failed')
        runs.create('f')  # prunes: `old` is past retention, and only the newest 2 finished runs are kept
        self.assertIsNone(runs.get(old))
        self.assertIsNone(runs.get(recent[0]))
        self.assertIsNotNone(runs.get(recent[2]))
        self.assertEqual(runs.get(active)['status'], 'running')

    def test_same_skull_can_run_again_once_finished(self):
        from skullfix_ai.application.model_reconstruction import ReconstructionError, RunRegistry
        runs = RunRegistry()
        first = runs.create('a')
        with self.assertRaises(ReconstructionError):
            runs.create('a')
        runs.update(first, status='failed')
        self.assertNotEqual(runs.create('a'), first)


if __name__ == '__main__':
    unittest.main()
