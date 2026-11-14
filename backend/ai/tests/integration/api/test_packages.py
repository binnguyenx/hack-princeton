"""Versioned portable packages over the real disposable application repository."""
import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE

SPATIAL = {'units': 'mm', 'space': 'left-posterior-superior', 'sizes': [2, 3, 4],
           'spacings': [1, 2, 3], 'bboxMm': [2, 6, 12], 'spaceOrigin': [7, 8, 9]}
VOLUME = b'NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 2 3 4\nencoding: raw\n\n' + bytes([1] * 24)


class PackageTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / 'storage'
        self.repo = ApplicationRepository(self.root)
        self.project = self.repo.create_project('Portable study')
        self.case = self.repo.add_case(self.project['id'], 'Primary')
        self.repo.add_case(self.project['id'], 'Empty case')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Prepared source', True, SPATIAL, VOLUME)
        self.candidate = self.repo.create_candidate(self.sample['id'])
        pose = list(IDENTITY_POSE); pose[3] = 27
        self.newer = self.repo.commit_transform(self.candidate['candidateId'], pose)
        self.repo.restore_revision(self.candidate['candidateId'], self.candidate['revisionId'])
        self.client = TestClient(create_app(self.root, repository=self.repo)); self.addCleanup(self.client.close)
        self.export_url = '/api/projects/' + self.project['id'] + '/package'

    def files(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob('*') if p.is_file()}

    def export(self, presentation=None):
        result = self.client.post(self.export_url, json=presentation or {})
        self.assertEqual(result.status_code, 200, result.text if result.status_code != 200 else '')
        return result.content

    def test_export_contains_committed_restored_pointer_and_hashed_volume_without_writes(self):
        before = self.files()
        response = self.client.post(self.export_url, json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('application/zip', response.headers['content-type'])
        self.assertIn('attachment;', response.headers['content-disposition'])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(json.loads(archive.read('package.json')), {'format': 'project-package', 'version': 1})
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest['candidates'][0]['currentRevisionId'], self.candidate['revisionId'])
            self.assertEqual(len(manifest['revisions']), 2)
            volume_id = self.sample['sourceAnatomy']['volumeId']
            self.assertEqual(archive.read('volumes/' + volume_id + '.nrrd'), VOLUME)
            self.assertEqual(len(archive.namelist()), 3)
        self.assertEqual(self.files(), before)

    def test_import_creates_a_new_persistent_copy_with_remapped_graph_and_current_pointer(self):
        original = self.repo.get_project_manifest(self.project['id'])
        from copy import deepcopy
        view = deepcopy(original['viewState'])
        view['selectionObjectId'] = self.candidate['candidateId']
        view['visibility'] = {self.sample['sourceAnatomy']['objectId']: False}
        presentation = {'viewState': view, 'openDocuments': [{'kind': 'candidate', 'id': self.candidate['candidateId']}],
                        'activeDocumentId': self.candidate['candidateId']}
        package = self.export(presentation)
        response = self.client.post('/api/packages/import', content=package, headers={'content-type': 'application/zip'})
        self.assertEqual(response.status_code, 201, response.text)
        result = response.json()
        self.assertNotEqual(result['projectId'], self.project['id'])
        copied = ApplicationRepository(self.root).get_project_manifest(result['projectId'])
        self.assertEqual(copied['project']['name'], 'Portable study (imported)')
        self.assertEqual(len(copied['cases']), 2)
        self.assertNotEqual(copied['samples'][0]['id'], self.sample['id'])
        self.assertEqual(copied['samples'][0]['sourceAnatomy']['spatial'], SPATIAL)
        self.assertEqual(copied['samples'][0]['sourceAnatomy']['volumeHash'], hashlib.sha256(VOLUME).hexdigest())
        candidate = copied['candidates'][0]
        self.assertEqual(candidate['sampleId'], copied['samples'][0]['id'])
        self.assertEqual(candidate['currentRevisionId'], copied['revisions'][0]['id'])
        self.assertEqual([r['order'] for r in copied['revisions']], [0, 1])
        self.assertEqual(copied['revisions'][1]['pose'][3], 27)
        self.assertEqual(copied['revisions'][0]['volumeId'], copied['revisions'][1]['volumeId'])
        self.assertEqual(result['presentation']['activeDocumentId'], candidate['objectId'])
        self.assertEqual(result['presentation']['viewState']['selectionObjectId'], candidate['objectId'])
        self.assertEqual(result['presentation']['viewState']['visibility'], {copied['samples'][0]['sourceAnatomy']['objectId']: False})
        self.assertEqual(self.repo.get_project_manifest(self.project['id']), original)

    @staticmethod
    def rewrite(package, change=None, marker=None, extra=None, omit=None):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(package)) as old, zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as new:
            for name in old.namelist():
                if name == omit:
                    continue
                data = old.read(name)
                if name == 'manifest.json' and change:
                    document = json.loads(data); change(document); data = json.dumps(document).encode()
                if name == 'package.json' and marker is not None:
                    data = json.dumps(marker).encode()
                new.writestr(name, data)
            if extra:
                new.writestr(*extra)
        return output.getvalue()

    def test_invalid_versions_and_graph_hashes_never_initialize_or_mutate_storage(self):
        package = self.export()
        before = self.files()
        mutations = [lambda m: m['cases'][0].update(projectId='another-project'),
                     lambda m: m['candidates'][0].update(currentRevisionId='missing-revision'),
                     lambda m: m['revisions'][1].update(order=0),
                     lambda m: m['samples'][0]['sourceAnatomy'].update(volumeHash='0' * 64),
                     lambda m: m['samples'].append(m['samples'][0]),
                     lambda m: m['revisions'][0].update(pose=['1'] * 16)]
        for mutate in mutations:
            bad = self.rewrite(package, change=mutate)
            response = self.client.post('/api/packages/import', content=bad, headers={'content-type': 'application/zip'})
            self.assertEqual(response.status_code, 422, response.text)
        for version in (3, True):
            bad = self.rewrite(package, marker={'format': 'project-package', 'version': version})
            response = self.client.post('/api/packages/import', content=bad, headers={'content-type': 'application/zip'})
            self.assertEqual(response.status_code, 422, response.text)
        absent = self.root.parent / 'absent'
        with TestClient(create_app(absent)) as client:
            self.assertEqual(client.post('/api/packages/import', content=b'not zip', headers={'content-type': 'application/zip'}).status_code, 422)
        self.assertFalse(absent.exists())
        self.assertEqual(self.files(), before)

    def test_unsafe_duplicate_symlink_missing_and_corrupt_zip_entries_are_rejected(self):
        package = self.export()
        before = self.files()
        volume = 'volumes/' + self.sample['sourceAnatomy']['volumeId'] + '.nrrd'
        symlink = zipfile.ZipInfo('volumes/link.nrrd'); symlink.external_attr = (0o120777 << 16)
        cases = [self.rewrite(package, extra=('../escape', b'x')),
                 self.rewrite(package, extra=('volumes/../../escape.nrrd', b'x')),
                 self.rewrite(package, extra=('manifest.json', b'{}')),
                 self.rewrite(package, extra=(symlink, b'target')),
                 self.rewrite(package, omit=volume), b'not a zip', package[:-22]]
        for data in cases:
            response = self.client.post('/api/packages/import', content=data, headers={'content-type': 'application/zip'})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.files(), before)
        self.assertFalse((self.root.parent / 'escape').exists())

    def test_failed_import_rolls_back_records_and_published_files(self):
        package = self.export()
        original = self.repo.get_project_manifest(self.project['id'])
        paths = set(self.files())
        for fault in ('package_after_stage', 'package_after_publish', 'before_commit'):
            with self.subTest(fault=fault):
                self.repo.faults[fault] = True
                response = self.client.post('/api/packages/import', content=package, headers={'content-type': 'application/zip'})
                self.repo.faults.clear()
                self.assertEqual(response.status_code, 500)
                self.assertEqual(len(self.repo.list_projects()), 1)
                self.assertEqual(self.repo.get_project_manifest(self.project['id']), original)
                self.assertEqual(set(self.files()), paths)
                self.assertEqual(list(self.root.glob('.package-import-*')), [])

    def test_repeated_imports_and_reexport_never_overwrite_original_ids_or_volumes(self):
        package = self.export()
        original = self.repo.get_project_manifest(self.project['id'])
        identities = []
        for _ in range(2):
            response = self.client.post('/api/packages/import', content=package, headers={'content-type': 'application/zip'})
            self.assertEqual(response.status_code, 201)
            identities.append(response.json()['projectId'])
        self.assertEqual(len(set(identities + [self.project['id']])), 3)
        self.assertEqual(len(list((self.root / 'volumes').glob('*.nrrd'))), 3)
        self.assertEqual(self.repo.get_project_manifest(self.project['id']), original)
        exported = self.client.post('/api/projects/' + identities[0] + '/package', json={})
        self.assertEqual(exported.status_code, 200)
        self.assertTrue(zipfile.is_zipfile(io.BytesIO(exported.content)))

    def test_distinct_revision_content_and_ownership_survive_import_and_reads(self):
        package = self.export()
        different = VOLUME[:-1] + b'\x02'
        def mutate(manifest):
            manifest['revisions'][1].update(volumeId='distinct-volume', volumeHash=hashlib.sha256(different).hexdigest())
            manifest['candidates'][0]['currentRevisionId'] = manifest['revisions'][1]['id']
        archive = self.rewrite(package, change=mutate, extra=('volumes/distinct-volume.nrrd', different))
        response = self.client.post('/api/packages/import', content=archive, headers={'content-type': 'application/zip'})
        self.assertEqual(response.status_code, 201, response.text)
        copied = self.repo.get_project_manifest(response.json()['projectId'])
        candidate = copied['candidates'][0]
        revision = copied['revisions'][1]
        url = '/api/candidates/' + candidate['objectId'] + '/revisions/' + revision['id'] + '/volume'
        self.assertEqual(self.client.get(url).content, different)
        wrong = '/api/candidates/' + self.candidate['candidateId'] + '/revisions/' + revision['id'] + '/volume'
        self.assertEqual(self.client.get(wrong).status_code, 404)
        self.assertEqual(self.repo.read_volume(self.project['id'], self.sample['sourceAnatomy']['volumeId']), VOLUME)

    def test_limits_and_media_type_fail_without_storage_mutation(self):
        before = self.files()
        response = self.client.post('/api/packages/import', json={})
        self.assertEqual(response.status_code, 415)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for index in range(513):
                archive.writestr('volumes/v' + str(index) + '.nrrd', b'')
        self.assertEqual(self.client.post('/api/packages/import', content=output.getvalue(), headers={'content-type': 'application/zip'}).status_code, 413)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('package.json', json.dumps({'format': 'project-package', 'version': 1}))
            archive.writestr('manifest.json', b' ' * (4 * 1024 * 1024 + 1))
        self.assertEqual(self.client.post('/api/packages/import', content=output.getvalue(), headers={'content-type': 'application/zip'}).status_code, 413)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            with archive.open('volumes/bomb.nrrd', 'w') as stream:
                for _ in range(257):
                    stream.write(bytes(1024 * 1024))
        self.assertLess(len(output.getvalue()), 1024 * 1024)
        self.assertEqual(self.client.post('/api/packages/import', content=output.getvalue(), headers={'content-type': 'application/zip'}).status_code, 413)
        self.assertEqual(self.client.post('/api/packages/import', content=bytes(64 * 1024 * 1024 + 1), headers={'content-type': 'application/zip'}).status_code, 413)
        self.assertEqual(self.files(), before)

    def test_empty_project_unverified_metadata_and_external_paths_have_explicit_boundaries(self):
        empty = self.repo.create_project('Empty')
        archive = self.client.post('/api/projects/' + empty['id'] + '/package', json={}).content
        imported = self.client.post('/api/packages/import', content=archive, headers={'content-type': 'application/zip'})
        self.assertEqual(imported.status_code, 201)
        self.assertEqual(self.repo.get_project_manifest(imported.json()['projectId'])['samples'], [])
        sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Unverified', False, {'note': None}, b'unverified bytes')
        archive = self.export()
        def paths(manifest):
            manifest['samples'][0]['sourceSampleDir'] = '/private/source'
            manifest['samples'][0]['displayMeshAsset'] = 'https://untrusted.invalid/mesh.glb'
        imported = self.client.post('/api/packages/import', content=self.rewrite(archive, change=paths), headers={'content-type': 'application/zip'})
        self.assertEqual(imported.status_code, 201)
        manifest = self.repo.get_project_manifest(imported.json()['projectId'])
        unverified = next(item for item in manifest['samples'] if item.get('displayName') == 'Unverified')
        self.assertEqual(unverified['sourceAnatomy']['spatial'], {'note': None})
        self.assertFalse(unverified['spatiallyVerified'])
        self.assertTrue(all('displayMeshAsset' not in item and 'sourceSampleDir' not in item for item in manifest['samples']))

    def test_export_missing_or_corrupt_source_and_invalid_presentation_never_succeed(self):
        response = self.client.post(self.export_url, json={'viewState': {}})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post('/api/projects/missing/package', json={}).status_code, 404)
        path = self.root / 'volumes' / (self.sample['sourceAnatomy']['volumeId'] + '.nrrd')
        path.write_bytes(b'corrupted')
        self.assertEqual(self.client.post(self.export_url, json={}).status_code, 409)
        path.unlink()
        self.assertEqual(self.client.post(self.export_url, json={}).status_code, 409)
