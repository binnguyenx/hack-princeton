"""Real manual rigid placement through the public HTTP boundary."""
import hashlib
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE

SPATIAL = {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [1, 2, 3], 'bboxMm': [2, 6, 12]}


class PlacementTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.repo = ApplicationRepository(self.root)
        self.project = self.repo.create_project('Construction')
        self.case = self.repo.add_case(self.project['id'], 'Manual placement')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Protected source', True, SPATIAL, b'geometry bytes')
        self.candidate = self.repo.create_candidate(self.sample['id'])
        self.client = TestClient(create_app(self.root)); self.addCleanup(self.client.close)
        self.url = '/api/candidates/' + self.candidate['candidateId'] + '/placement'
        self.pose = [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1]
        self.payload = dict(project_id=self.project['id'], case_id=self.case['id'],
                            expected_revision_id=self.candidate['revisionId'], pose=self.pose)

    def test_manual_placement_commits_real_rotation_and_translation_preserving_source(self):
        before = self.repo.get_project_manifest(self.project['id'])
        volume = next((self.root / 'volumes').glob('*.nrrd')); original = volume.read_bytes()
        response = self.client.post(self.url, json=self.payload)
        self.assertEqual(response.status_code, 201, response.text)
        after = ApplicationRepository(self.root).get_project_manifest(self.project['id'])
        self.assertEqual(after['candidates'][0]['currentRevisionId'], response.json()['revisionId'])
        self.assertEqual(after['revisions'][0], before['revisions'][0])
        self.assertEqual(after['revisions'][1]['pose'], self.pose)
        self.assertEqual(after['revisions'][1]['volumeHash'], hashlib.sha256(original).hexdigest())
        self.assertEqual(after['samples'], before['samples'])
        self.assertEqual(volume.read_bytes(), original)
        self.assertEqual(len(list((self.root / 'volumes').glob('*'))), 1)

    def test_invalid_rigid_matrices_source_targets_and_ownership_cannot_mutate(self):
        before = self.repo.get_project_manifest(self.project['id'])
        invalid = [list(IDENTITY_POSE), [2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
                   [-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], self.pose[:15],
                   [True, *self.pose[1:]], ['1', *self.pose[1:]]]
        for pose in invalid:
            response = self.client.post(self.url, json={**self.payload, 'pose': pose})
            self.assertEqual(response.status_code, 422, response.text)
        for change in [{'case_id': 'wrong'}, {'project_id': 'wrong'}]:
            self.assertEqual(self.client.post(self.url, json={**self.payload, **change}).status_code, 409)
        source_url = '/api/candidates/' + self.sample['sourceAnatomy']['objectId'] + '/placement'
        self.assertEqual(self.client.post(source_url, json=self.payload).status_code, 404)
        self.assertEqual(self.repo.get_project_manifest(self.project['id']), before)

    def test_stale_submission_and_rollback_preserve_current_pointer(self):
        before = self.repo.get_project_manifest(self.project['id'])
        self.assertEqual(self.client.post(self.url, json={**self.payload, 'expected_revision_id': 'old'}).status_code, 409)
        self.repo.faults['before_commit'] = True
        with TestClient(create_app(self.root, repository=self.repo)) as client:
            failed = client.post(self.url, json=self.payload)
            self.assertEqual(failed.status_code, 500)
            self.assertEqual(failed.json()['code'], 'placement-failed')
        self.repo.faults.clear()
        self.assertEqual(self.repo.get_project_manifest(self.project['id']), before)

    def test_concurrent_expected_revision_allows_one_commit_and_restore_then_append(self):
        from threading import Barrier
        barrier = Barrier(2)
        def post():
            with TestClient(create_app(self.root)) as client:
                barrier.wait(timeout=5)
                return client.post(self.url, json=self.payload).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(post) for _ in range(2)]
            self.assertEqual(sorted(f.result() for f in futures), [201, 409])
        self.repo.restore_revision(self.candidate['candidateId'], self.candidate['revisionId'])
        response = self.client.post(self.url, json=self.payload)
        self.assertEqual(response.status_code, 201)
        manifest = self.repo.get_project_manifest(self.project['id'])
        self.assertEqual([r['order'] for r in manifest['revisions']], [0, 1, 2])
        self.assertEqual(manifest['revisions'][0]['pose'], IDENTITY_POSE)
        self.assertEqual(manifest['candidates'][0]['currentRevisionId'], response.json()['revisionId'])

    def test_rejected_product_writes_leave_manifest_unchanged(self):
        """HTTP placement failures must not append revisions (public boundary)."""
        before = self.repo.get_project_manifest(self.project['id'])
        unchanged = self.client.post(self.url, json={**self.payload, 'pose': list(IDENTITY_POSE)})
        self.assertEqual(unchanged.status_code, 422, unchanged.text)
        self.assertEqual(unchanged.json()['code'], 'unchanged-pose')
        self.assertEqual(self.repo.get_project_manifest(self.project['id']), before)
        self.assertEqual(len(before['revisions']), 1)

    def test_concurrent_distinct_valid_poses_commit_one_child_revision(self):
        from threading import Barrier
        from skullfix_ai.application.placement import is_rigid_pose
        pose_a = list(IDENTITY_POSE)
        pose_a[3] = 4.0
        pose_b = [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1]
        self.assertTrue(is_rigid_pose(pose_a) and is_rigid_pose(pose_b))
        barrier = Barrier(2)
        results = []

        def post(pose):
            with TestClient(create_app(self.root)) as client:
                barrier.wait(timeout=5)
                response = client.post(self.url, json={**self.payload, 'pose': pose})
                return response.status_code, response.json().get('revisionId')

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(post, pose) for pose in (pose_a, pose_b)]
            for future in futures:
                results.append(future.result())
        self.assertEqual(sorted(status for status, _ in results), [201, 409])
        manifest = self.repo.get_project_manifest(self.project['id'])
        self.assertEqual(len(manifest['revisions']), 2)
        winner_id = next(rid for status, rid in results if status == 201)
        self.assertEqual(manifest['candidates'][0]['currentRevisionId'], winner_id)
        self.assertEqual(manifest['revisions'][1]['id'], winner_id)
        self.assertIn(tuple(manifest['revisions'][1]['pose']), {tuple(pose_a), tuple(pose_b)})

    def test_unverified_or_non_mm_metadata_cannot_enable_placement(self):
        for verified, spatial in [(False, SPATIAL), (True, {**SPATIAL, 'units': 'cm'})]:
            sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Unavailable source', verified, spatial, b'geometry')
            # Legacy baseline rejects unverified candidate creation; exercise unsupported units here.
            if not verified:
                with self.assertRaises(ValueError):
                    self.repo.create_candidate(sample['id'])
                continue
            candidate = self.repo.create_candidate(sample['id'])
            response = self.client.post('/api/candidates/' + candidate['candidateId'] + '/placement',
                json={**self.payload, 'expected_revision_id': candidate['revisionId']})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()['code'], 'placement-unavailable')
