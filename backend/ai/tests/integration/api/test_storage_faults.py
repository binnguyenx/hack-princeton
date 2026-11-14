"""Retained HTTP fault/cascade coverage after removal of the Express test harness."""
import json
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

META = {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [1, 2, 3], 'bboxMm': [2, 6, 12]}
DATA = b'synthetic HTTP storage fault bytes'


class ApplicationHttpStorageFaultTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='hp-http-storage-fault-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.faults = {}
        self.repo = ApplicationRepository(self.root, self.faults)
        self.client = TestClient(create_app(self.root, repository=self.repo))
        self.addCleanup(self.client.close)
        self.project = self.client.post('/api/projects', json={'name': 'Fault test'}).json()['projectId']
        self.case = self.client.post(f'/api/projects/{self.project}/cases', json={'name': 'Case'}).json()['caseId']

    def upload(self):
        return self.client.post(f'/api/projects/{self.project}/cases/{self.case}/samples',
            data={'meta': json.dumps(META), 'spatiallyVerified': 'true'},
            files={'file': ('synthetic.nrrd', DATA)})

    def manifest(self):
        response = self.client.get(f'/api/projects/{self.project}')
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_import_fault_has_no_partial_sample_or_volume_over_http(self):
        self.faults['failAfterVolumeWrite'] = True
        failed = self.upload()
        self.assertEqual(failed.status_code, 500)
        self.assertEqual(set(failed.json()), {'error'})
        self.faults.clear()
        self.assertEqual(self.manifest()['samples'], [])
        self.assertEqual(list((self.root / 'volumes').iterdir()), [])

    def test_missing_volume_serve_is_404_without_metadata_mutation(self):
        created = self.upload()
        self.assertEqual(created.status_code, 201)
        sample_id = created.json()['sampleId']
        before = self.manifest()
        source = before['samples'][0]['sourceAnatomy']
        (self.root / 'volumes' / f"{source['volumeId']}.nrrd").unlink()
        missing = self.client.get(f'/api/samples/{sample_id}/volume')
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(set(missing.json()), {'error'})
        self.assertEqual(self.manifest(), before)

    def test_precommit_delete_fault_preserves_sample_and_download_over_http(self):
        created = self.upload()
        self.assertEqual(created.status_code, 201)
        sample_id = created.json()['sampleId']
        before = self.manifest()
        self.faults['failBeforeSampleDelete'] = True
        failed = self.client.delete(f'/api/samples/{sample_id}')
        self.assertEqual(failed.status_code, 500)
        self.assertEqual(set(failed.json()), {'error'})
        self.faults.clear()
        self.assertEqual(self.manifest(), before)
        volume = self.client.get(f'/api/samples/{sample_id}/volume')
        self.assertEqual(volume.status_code, 200)
        self.assertEqual(volume.content, DATA)


if __name__ == '__main__':
    unittest.main()
