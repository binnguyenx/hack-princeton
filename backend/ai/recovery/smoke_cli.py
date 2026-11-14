"""Launch the documented CLI twice; HTTP CRUD and restart use disposable storage."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[3]


def request(origin, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    with urlopen(Request(origin + path, data=data, headers={'content-type': 'application/json'}), timeout=3) as response:
        return response.status, json.load(response)


def launch(root, log, action):
    environment = {**os.environ, 'PYTHONPATH': str(REPO / 'backend/ai/src'), 'PYTHONDONTWRITEBYTECODE': '1'}
    with log.open('w') as output:
        process = subprocess.Popen([sys.executable, '-m', 'skullfix_ai.api', '--storage-root', str(root),
                                    '--host', '127.0.0.1', '--port', '0'], cwd=REPO, env=environment,
                                   stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                text = log.read_text()
                match = re.search(r'Uvicorn running on (http://127\.0\.0\.1:\d+)', text)
                if match:
                    return action(match.group(1))
                if process.poll() is not None:
                    raise RuntimeError(text)
                time.sleep(0.05)
            raise TimeoutError(log.read_text())
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def main():
    with tempfile.TemporaryDirectory(prefix='fastapi-recovery-') as temporary:
        directory = Path(temporary)
        root = directory / 'storage'

        def first(origin):
            assert request(origin, '/api/projects') == (200, [])
            status, result = request(origin, '/api/projects', {'name': 'Disposable CLI proof'})
            assert status == 201, result
            return result['projectId']

        project_id = launch(root, directory / 'first.log', first)

        def second(origin):
            status, projects = request(origin, '/api/projects')
            assert status == 200 and projects[0]['id'] == project_id, projects
            status, manifest = request(origin, '/api/projects/' + project_id)
            assert status == 200 and manifest['project']['id'] == project_id, manifest
            status, _ = request(origin, '/api/projects/' + project_id + '/cases', {'name': 'After restart'})
            assert status == 201
            try:
                request(origin, '/api/not-a-route')
                raise AssertionError('Unknown API returned success')
            except HTTPError as error:
                assert error.code == 404 and error.headers.get_content_type() == 'application/json'

        launch(root, directory / 'second.log', second)
        print('PASS: CLI boot, GET /api/projects, create, restart, continued writes, unknown API JSON; disposable storage only')


if __name__ == '__main__':
    main()
