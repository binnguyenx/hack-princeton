"""Operational backup proof on disposable app data, including uncheckpointed WAL."""
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from skullfix_ai.application import ApplicationRepository

spec = importlib.util.spec_from_file_location('application_snapshot', Path(__file__).resolve().parents[3] / 'scripts/application_snapshot.py')
snapshots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshots)
META = {'units': 'mm', 'sizes': [1, 1, 1], 'spacings': [1, 1, 1], 'bboxMm': [1, 1, 1]}


class ApplicationSnapshotTest(unittest.TestCase):
    def test_backup_restores_all_records_files_and_committed_wal_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            repository = ApplicationRepository(root)
            repository.list_projects()
            keeper = sqlite3.connect(root / 'app-model.sqlite')
            self.addCleanup(keeper.close)
            self.assertEqual(keeper.execute('PRAGMA journal_mode=WAL').fetchone()[0], 'wal')
            keeper.execute('SELECT count(*) FROM users').fetchone()
            project = repository.create_project('Written after WAL enabled')
            case = repository.add_case(project['id'], 'Snapshot case')
            sample = repository.add_sample(project['id'], case['id'], 'Synthetic snapshot bytes', True, META, b'snapshot-test-bytes')
            candidate = repository.create_candidate(sample['id'])
            expected = repository.get_project_manifest(project['id'])
            self.assertTrue((root / 'app-model.sqlite-wal').exists())
            backup = Path(directory) / 'backup'
            copied = snapshots.snapshot(root, backup)
            self.assertEqual(snapshots.inspect(root), copied)
            restored = ApplicationRepository(backup)
            self.assertEqual(restored.get_project_manifest(project['id']), expected)
            self.assertEqual(restored.read_volume(project['id'], sample['sourceAnatomy']['volumeId']), b'snapshot-test-bytes')
            self.assertEqual(expected['candidates'][0]['currentRevisionId'], candidate['revisionId'])

    def test_verifier_rejects_changed_volume_and_nested_backup_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            repository = ApplicationRepository(root)
            project = repository.create_project('Integrity probe')
            case = repository.add_case(project['id'], 'Case')
            sample = repository.add_sample(project['id'], case['id'], 'Synthetic', True, META, b'original')
            with self.assertRaisesRegex(ValueError, 'outside'):
                snapshots.snapshot(root, root / 'nested-backup')
            (root / 'volumes' / (sample['sourceAnatomy']['volumeId'] + '.nrrd')).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                snapshots.inspect(root)


if __name__ == '__main__':
    unittest.main()
