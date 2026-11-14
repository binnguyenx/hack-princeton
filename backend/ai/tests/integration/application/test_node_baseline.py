"""Immutable Node-produced fixture keeps pre-migration data compatibility executable."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures/node-application-baseline'


class FrozenNodeBaselineTest(unittest.TestCase):
    def test_frozen_node_data_roundtrips_restored_pointer_and_new_python_writes(self):
        expected = json.loads((FIXTURE / 'expected.json').read_text())
        hashes = json.loads((FIXTURE / 'sha256.json').read_text())
        for relative, digest in hashes.items():
            self.assertEqual(hashlib.sha256((FIXTURE / relative).read_bytes()).hexdigest(), digest)
        with tempfile.TemporaryDirectory(prefix='hp-frozen-node-') as temporary:
            root = Path(temporary) / 'copy'
            shutil.copytree(FIXTURE, root)
            repo = ApplicationRepository(root)
            self.assertEqual(repo.list_projects(), expected['projects'])
            before = repo.get_project_manifest(expected['projectId'])
            self.assertEqual(before, expected['manifest'])
            self.assertEqual(before['candidates'][0]['currentRevisionId'], expected['restoredRevisionId'])
            volume_id = before['samples'][0]['sourceAnatomy']['volumeId']
            self.assertEqual(repo.read_volume(expected['projectId'], volume_id), bytes(expected['bytes']))
            pose = list(IDENTITY_POSE)
            pose[3] = 41
            revision = repo.commit_transform(expected['candidateId'], pose)
            after = ApplicationRepository(root).get_project_manifest(expected['projectId'])
            self.assertEqual(after['revisions'][:2], before['revisions'])
            self.assertEqual(after['revisions'][-1]['id'], revision)
            self.assertEqual(after['revisions'][-1]['order'], 2)
            self.assertEqual(after['revisions'][-1]['volumeHash'], before['revisions'][0]['volumeHash'])
            self.assertEqual(after['candidates'][0]['currentRevisionId'], revision)
            repo.restore_revision(expected['candidateId'], expected['restoredRevisionId'])
            self.assertEqual(ApplicationRepository(root).get_project_manifest(expected['projectId'])['candidates'][0]['currentRevisionId'], expected['restoredRevisionId'])
            repo.add_case(expected['projectId'], 'New Python write after frozen Node baseline')
            self.assertEqual(repo.list_projects()[0]['caseCount'], 3)
        for relative, digest in hashes.items():
            self.assertEqual(hashlib.sha256((FIXTURE / relative).read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
