"""Recovery composition must run independently of the Vite CRUD plugin."""
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class RecoveryBootTest(unittest.TestCase):
    def test_projects_crud_survives_restart_and_unknown_api_is_json(self):
        from skullfix_ai.api.app import create_app
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'storage'
            with TestClient(create_app(root)) as client:
                self.assertEqual(client.get('/api/projects').json(), [])
                response = client.post('/api/projects', json={'name': 'Recovery proof'})
                self.assertEqual(response.status_code, 201, response.text)
                project_id = response.json()['projectId']
            with TestClient(create_app(root)) as client:
                projects = client.get('/api/projects')
                self.assertEqual(projects.status_code, 200)
                self.assertEqual(projects.json()[0]['id'], project_id)
                self.assertEqual(client.get('/api/projects/' + project_id).status_code, 200)
                missing = client.get('/api/no-such-route')
                self.assertEqual(missing.status_code, 404)
                self.assertEqual(missing.headers['content-type'], 'application/json')

    def test_chat_reads_current_context_without_mutation_even_for_write_language(self):
        from skullfix_ai.api.app import create_app
        from skullfix_ai.application import ApplicationRepository
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository = ApplicationRepository(root)
            project = repository.create_project('Read-only recovery')
            case = repository.add_case(project['id'], 'Case')
            sample = repository.add_sample(project['id'], case['id'], 'Source', True,
                {'units': 'mm', 'sizes': [2, 2, 2], 'spacings': [1, 1, 1], 'bboxMm': [2, 2, 2]}, b'volume')
            candidate = repository.create_candidate(sample['id'])
            before = repository.read_project_manifest(project['id'])
            with TestClient(create_app(root)) as client:
                response = client.post('/api/ai/chat', json={
                    'request_id': 'read-only-proof', 'conversation_id': 'session',
                    'project_id': project['id'], 'case_id': case['id'],
                    'object_id': candidate['candidateId'], 'expected_revision_id': candidate['revisionId'],
                    'message': 'Apply placement and generate a candidate'})
                self.assertEqual(response.status_code, 200, response.text)
                body = response.json()
                self.assertEqual(body['mode'], 'fake-read-only')
                self.assertEqual(body['outcome']['status'], 'completed', body)
                self.assertEqual(body['outcome']['observation']['scope'], 'application-read')
                self.assertEqual(body['outcome']['context']['revision_id'], candidate['revisionId'])
            self.assertEqual(repository.read_project_manifest(project['id']), before)


if __name__ == '__main__':
    unittest.main()
