"""Public HTTP and route inventory checks for the opt-in application API."""
import tempfile
import gzip
import zlib
import brotli
import zstandard
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app

EXPECTED = {
    ('POST', '/api/candidates/{id}/voxel-operation'),
    ('POST', '/api/samples/{id}/reconstructions'), ('GET', '/api/reconstructions/{run_id}'),
    ('POST', '/api/candidates/{id}/fix-adjustment'), ('GET', '/api/candidates/{id}/fix-report'),
    ('GET', '/api/samples/{id}/landmarks'), ('POST', '/api/samples/{id}/landmarks'),
    ('DELETE', '/api/samples/{id}/landmarks/{landmark_id}'),
    ('GET', '/api/revisions/{revision_id}/annotations'),
    ('POST', '/api/revisions/{revision_id}/annotations'),
    ('PATCH', '/api/annotations/{annotation_id}'),
    ('DELETE', '/api/annotations/{annotation_id}'),
    ('POST', '/api/projects/{id}/package'), ('POST', '/api/packages/import'),
    ('GET', '/api/candidates/{id}/revisions/{revision_id}/volume'),
    ('POST', '/api/ai/chat'), ('POST', '/api/ai/chat/stream'), ('GET', '/api/ai/proposals/{proposal_id}'), ('POST', '/api/ai/proposals/{proposal_id}/discard'), ('POST', '/api/ai/proposals/{proposal_id}/accept'), ('POST', '/api/candidates/{id}/placement'),
    ('POST', '/api/candidates/{id}/measurements'),
    ('GET', '/api/candidates/{id}/revisions/{revision_id}/measurements'),
    ('GET', '/api/projects'), ('POST', '/api/projects'),
    ('GET', '/api/projects/{id}'), ('DELETE', '/api/projects/{id}'),
    ('GET', '/api/projects/{id}/samples'),
    ('POST', '/api/projects/{id}/cases'),
    ('DELETE', '/api/projects/{id}/cases/{case_id}'),
    ('POST', '/api/projects/{id}/cases/{case_id}/samples'),
    ('GET', '/api/samples/{id}/volume'), ('DELETE', '/api/samples/{id}'),
    ('POST', '/api/samples/{id}/candidates'),
    ('POST', '/api/candidates/{id}/transform'),
    ('POST', '/api/candidates/{id}/restore'), ('DELETE', '/api/candidates/{id}'),
}


class FakeRepository:
    def __init__(self):
        self.created = []

    def list_projects(self):
        return []

    def add_sample(self, project_id, case_id, display_name, spatially_verified, meta, data):
        self.created.append(display_name)
        return {'id': 'sample-one', 'spatiallyVerified': spatially_verified}

    def create_project(self, name):
        self.created.append(name)
        return {'id': 'project-one'}


class ApiTransportTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.repo = FakeRepository()
        self.app = create_app(self.root / 'storage', repository=self.repo)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_real_router_inventory_and_no_import_or_factory_storage_writes(self):
        actual = {(method.upper(), path) for path, operations in self.app.openapi()['paths'].items()
                  for method in operations if method in {'get', 'post', 'delete', 'put', 'patch'}}
        self.assertEqual(EXPECTED, actual)
        self.assertFalse((self.root / 'storage').exists())
        self.assertEqual([], self.client.get('/api/projects').json())
        response = self.client.post('/api/projects', json={'name': 'Project'})
        self.assertEqual(201, response.status_code)
        self.assertEqual({'projectId': 'project-one'}, response.json())
        self.assertEqual(['Project'], self.repo.created)

    def test_current_parser_errors_remain_explicit_baselines_without_writes(self):
        missing = self.client.post('/api/projects')
        self.assertEqual(500, missing.status_code)
        self.assertEqual({'error'}, set(missing.json()))
        malformed = self.client.post('/api/projects', content='{"name":', headers={'content-type': 'application/json'})
        self.assertEqual(400, malformed.status_code)
        self.assertIn('text/html', malformed.headers['content-type'])
        oversized = self.client.post('/api/projects', content='{"name":"' + 'x' * (10 * 1024 * 1024) + '"}', headers={'content-type': 'application/json'})
        self.assertEqual(413, oversized.status_code)
        self.assertIn('text/html', oversized.headers['content-type'])
        self.assertEqual([], self.repo.created)

    def test_unexpected_file_fields_preserve_middleware_error_baseline(self):
        response = self.client.post('/api/projects/project/cases/case/samples',
                                    files={'unexpected': ('test.nrrd', b'test bytes')})
        self.assertEqual(500, response.status_code)
        self.assertIn('text/html', response.headers['content-type'])
        self.assertEqual([], self.repo.created)

    def test_nonstandard_json_tokens_are_parser_errors_not_repository_inputs(self):
        response = self.client.post('/api/projects', content='{"name": NaN}',
                                    headers={'content-type': 'application/json'})
        self.assertEqual(400, response.status_code)
        self.assertIn('text/html', response.headers['content-type'])
        self.assertEqual([], self.repo.created)

    def test_malformed_multipart_boundary_keeps_middleware_error_baseline(self):
        response = self.client.post('/api/projects/project/cases/case/samples',
                                    content='not multipart', headers={'content-type': 'multipart/form-data'})
        self.assertEqual(500, response.status_code)
        self.assertIn('text/html', response.headers['content-type'])
        self.assertEqual([], self.repo.created)

    def test_compressed_json_and_decoded_size_limit_match_express(self):
        payload = b'{"name":"compressed project"}'
        encoders = [('gzip', gzip.compress), ('deflate', zlib.compress),
                    ('br', lambda data: brotli.compress(data, quality=1)),
                    ('zstd', zstandard.ZstdCompressor().compress)]
        for encoding, encode in encoders:
            with self.subTest(encoding=encoding):
                response = self.client.post('/api/projects', content=encode(payload),
                    headers={'content-type': 'application/json', 'content-encoding': encoding})
                self.assertEqual(201, response.status_code)
                self.assertEqual({'projectId': 'project-one'}, response.json())
                oversized = b'{"name":"' + b'x' * (10 * 1024 * 1024) + b'"}'
                too_large = self.client.post('/api/projects', content=encode(oversized),
                    headers={'content-type': 'application/json', 'content-encoding': encoding})
                self.assertEqual(413, too_large.status_code)
                self.assertIn('text/html', too_large.headers['content-type'])
        self.assertEqual(['compressed project'] * 4, self.repo.created)
        unsupported = self.client.post('/api/projects', content=payload,
                    headers={'content-type': 'application/json', 'content-encoding': 'unknown'})
        self.assertEqual(415, unsupported.status_code)
        self.assertIn('text/html', unsupported.headers['content-type'])
        broken = self.client.post('/api/projects', content=b'not gzip',
                    headers={'content-type': 'application/json', 'content-encoding': 'gzip'})
        self.assertEqual(400, broken.status_code)
        self.assertIn('text/html', broken.headers['content-type'])

    def test_uploaded_filename_fallback_strips_posix_and_windows_paths(self):
        for filename in ['folder/source.nrrd', r'folder\source.nrrd', r'C:\fakepath\source.nrrd']:
            response = self.client.post('/api/projects/project/cases/case/samples',
                files={'file': (filename, b'synthetic test bytes')})
            self.assertEqual(201, response.status_code)
        self.assertEqual(['source.nrrd'] * 3, self.repo.created)


if __name__ == '__main__':
    unittest.main()
