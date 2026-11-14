"""Built-frontend serving checks; real browser verification is separate."""
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app


class ReadOnlyRepository:
    def list_projects(self):
        return []


class BuiltFrontendTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        build = self.root / 'dist'
        (build / 'assets').mkdir(parents=True)
        (build / 'index.html').write_text('<html><body>test frontend</body></html>')
        (build / 'assets' / 'app.js').write_text('console.log("test asset")')
        (self.root / 'outside.txt').write_text('must not be served')
        self.client = TestClient(create_app(self.root / 'storage', frontend_dir=build, repository=ReadOnlyRepository()))

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_api_precedence_for_known_unknown_and_wrong_method_paths(self):
        self.assertEqual([], self.client.get('/api/projects').json())
        for method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']:
            response = self.client.request(method, '/api/unknown')
            self.assertEqual(404, response.status_code)
            self.assertIn('application/json', response.headers['content-type'])
        self.assertEqual({'error': 'API route not found'}, self.client.get('/api').json())

    def test_static_assets_client_route_refresh_and_missing_assets(self):
        page = self.client.get('/')
        self.assertEqual(200, page.status_code)
        self.assertIn('test frontend', page.text)
        refresh = self.client.get('/workspace/project-one')
        self.assertEqual(page.text, refresh.text)
        asset = self.client.get('/assets/app.js')
        self.assertEqual(200, asset.status_code)
        self.assertIn('javascript', asset.headers['content-type'])
        self.assertEqual(404, self.client.get('/assets/missing.js').status_code)
        self.assertEqual(404, self.client.get('/fixtures/missing').status_code)
        escaped = self.client.get('/%2e%2e/outside.txt')
        self.assertEqual(404, escaped.status_code)
        self.assertNotIn('must not be served', escaped.text)

    def test_readiness_and_required_build_directory_have_no_storage_side_effects(self):
        self.assertEqual({'status': 'ready'}, self.client.get('/healthz').json())
        self.assertFalse((self.root / 'storage').exists())
        with self.assertRaisesRegex(ValueError, 'index.html'):
            create_app(self.root / 'storage', frontend_dir=self.root / 'missing', repository=ReadOnlyRepository())


if __name__ == '__main__':
    unittest.main()
