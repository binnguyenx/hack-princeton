"""Fix statistics and ML record for a predicted fix (cranial-reconstruction-candidate R14–R17, S7)."""
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository
from skullfix_ai.integrations.geometry.model_endpoint import EndpointPoll

SX, SY, SZ = 20, 16, 8


def grid(fn):
    return bytes(1 if fn(i, j, k) else 0 for k in range(SZ) for j in range(SY) for i in range(SX))


def in_plate(i, j, k):
    return 2 <= k <= 5


def in_hole(i, j, k):
    return 8 <= i <= 17 and 3 <= j <= 12


SOURCE = grid(lambda i, j, k: in_plate(i, j, k) and not in_hole(i, j, k))
FIX = grid(lambda i, j, k: in_plate(i, j, k) and in_hole(i, j, k))   # a 10 x 10 x 4 mm slab
HEADER = f'NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: {SX} {SY} {SZ}\nencoding: raw\n\n'.encode()
META = {'units': 'mm', 'space': 'left-posterior-superior', 'sizes': [SX, SY, SZ], 'spacings': [1, 1, 1],
        'bboxMm': [SX, SY, SZ]}


class SlabEndpoint:
    def submit(self, run_id, nrrd):
        return run_id

    def poll(self, handle):
        return EndpointPoll(status='done', implant=HEADER + FIX, probability=HEADER + bytes(220 * v for v in FIX),
                            metadata={'checkpoint_hash': 'sha256:' + 'a' * 64, 'freeze_run_id': 'run_test',
                                      'threshold': 0.5, 'model': 'cranial-unet-v2', 'inference_seconds': 3.0})


class FixReportTest(unittest.TestCase):
    def generate(self, meta=META):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name) / 'application'
        self.repo = ApplicationRepository(root)
        project = self.repo.create_project('Volume')
        case = self.repo.add_case(project['id'], 'Case')
        self.ids = {'project_id': project['id'], 'case_id': case['id']}
        sample = self.repo.add_sample(project['id'], case['id'], 'Skull', True, meta, HEADER + SOURCE)
        client = TestClient(create_app(root, repository=self.repo, model_endpoint=SlabEndpoint(),
                                       reconstruction_runner=lambda fn: fn()))
        self.addCleanup(client.close)
        run_id = client.post('/api/samples/' + sample['id'] + '/reconstructions', json=self.ids).json()['runId']
        fix = client.get('/api/reconstructions/' + run_id).json()['result']
        response = client.get('/api/candidates/' + fix['candidateId'] + '/fix-report', params=self.ids)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_slab_fix_statistics_match_known_geometry(self):
        report = self.generate()
        metrics = {m['key']: m for m in report['fix']['metrics']}
        self.assertTrue(all(m['unit'] and m['method'] for m in metrics.values()))
        self.assertAlmostEqual(metrics['volume']['value'], 0.4, places=3)                 # 400 mm³ = 0.4 mL
        self.assertEqual(metrics['volume']['unit'], 'mL')
        self.assertAlmostEqual(metrics['outer_surface_area']['value'], 200, delta=1)      # top + bottom faces
        self.assertEqual(metrics['bounding_box']['value'], [10, 10, 4])
        self.assertAlmostEqual(metrics['mean_thickness']['value'], 4, delta=1)
        self.assertAlmostEqual(metrics['min_thickness']['value'], 4, delta=1)
        # 272 surface voxels (2 x 100 faces + 2 x 36 inner rings); the 4 x 36 ring voxels touch bone.
        self.assertAlmostEqual(metrics['bone_contact']['value'], 52.9, delta=0.1)
        self.assertEqual(metrics['side']['value'], 'left')        # fix sits at +i = LPS +x = patient left
        self.assertEqual(metrics['centroid']['value'], [-12.5, -7.5, 3.5])               # RAS mm
        self.assertEqual(metrics['centroid']['unit'], 'mm (RAS)')
        self.assertIn('not a clinical assessment', report['fix']['label'])

    def test_metrics_needing_mm_spacing_are_not_available_without_it(self):
        report = self.generate({**META, 'units': 'voxel'})
        metrics = {m['key']: m for m in report['fix']['metrics']}
        for key in ('volume', 'outer_surface_area', 'bounding_box', 'mean_thickness', 'min_thickness', 'centroid'):
            with self.subTest(key):
                self.assertIsNone(metrics[key]['value'])
                self.assertEqual(metrics[key]['status'], 'not-available')
                self.assertTrue(metrics[key]['reason'])

    def test_ml_record_comes_from_freeze_and_eval_files(self):
        record = self.generate()['mlRecord']
        self.assertEqual(record['checkpointHash'], 'sha256:' + 'a' * 64)
        self.assertEqual(record['runId'], 'run_test')
        self.assertEqual((record['threshold'], record['thresholdIsDefault']), (0.5, True))
        self.assertEqual(record['inferenceSeconds'], 3.0)
        held_out = record['heldOut']
        self.assertAlmostEqual(held_out['test']['meanDice'], 0.811, places=3)
        self.assertAlmostEqual(held_out['test']['medianHd95Mm'], 2.49, places=2)
        self.assertEqual((held_out['test']['cases'], held_out['test']['failures']), (20, 0))
        low, high = held_out['test']['meanDice95Ci']
        self.assertTrue(0.75 < low < 0.811 < high < 0.86, (low, high))
        self.assertAlmostEqual(held_out['validation']['meanDice'], 0.835, places=3)
        self.assertIn('U-Net', record['model']['architecture'])
        self.assertIn('parietotemporal', record['trainingData'])
        self.assertEqual(record['limitation'], 'Trained on synthetic parietotemporal defects. Other defect types and '
                                               'real patient scans have no measured accuracy. Not a clinical design.')

    def test_missing_model_card_is_a_coded_503_not_a_crash(self):
        import os
        from unittest import mock
        with mock.patch.dict(os.environ, {'CRANIAL_MODEL_CARD': '/nonexistent/model_card.json'}):
            temporary = tempfile.TemporaryDirectory()
            self.addCleanup(temporary.cleanup)
            root = Path(temporary.name) / 'application'
            repo = ApplicationRepository(root)
            project = repo.create_project('Volume')
            case = repo.add_case(project['id'], 'Case')
            ids = {'project_id': project['id'], 'case_id': case['id']}
            sample = repo.add_sample(project['id'], case['id'], 'Skull', True, META, HEADER + SOURCE)
            client = TestClient(create_app(root, repository=repo, model_endpoint=SlabEndpoint(),
                                           reconstruction_runner=lambda fn: fn()))
            self.addCleanup(client.close)
            run_id = client.post('/api/samples/' + sample['id'] + '/reconstructions', json=ids).json()['runId']
            fix = client.get('/api/reconstructions/' + run_id).json()['result']
            response = client.get('/api/candidates/' + fix['candidateId'] + '/fix-report', params=ids)
        self.assertEqual((response.status_code, response.json()['code']), (503, 'model-record-unavailable'))


if __name__ == '__main__':
    unittest.main()
