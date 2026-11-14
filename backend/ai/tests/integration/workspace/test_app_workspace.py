"""App-contract context reads must not create a second project store."""

import copy
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from skullfix_ai.integrations.workspace import AppWorkspaceAdapter, WorkspaceError
from skullfix_ai.storage import SQLiteApplicationStorage, StorageError


ROOT = Path(__file__).resolve().parents[5]


class ManifestReader:
    def __init__(self, manifest):
        self.manifest = manifest
        self.reads = 0

    def get_project(self, project_id):
        self.reads += 1
        return copy.deepcopy(self.manifest)


class AppWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((ROOT / "data/fixtures/demo-project/manifest.json").read_text())
        # The portable fixture permits an absent hash. Live imports have SHA-256.
        self.manifest["samples"][0]["sourceAnatomy"]["volumeHash"] = "a" * 64
        pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        self.manifest["candidates"] = [{
            "objectId": "candidate-ui", "sampleId": "sample-000",
            "currentRevisionId": "revision-ui-0",
        }]
        self.manifest["revisions"] = [{
            "id": "revision-ui-0", "candidateId": "candidate-ui", "order": 0,
            "volumeId": "vol-source-000", "pose": pose, "volumeHash": "a" * 64,
        }, {
            "id": "revision-ui-1", "candidateId": "candidate-ui", "order": 1,
            "volumeId": "vol-source-000", "pose": [*pose[:3], 5, *pose[4:]],
            "volumeHash": "a" * 64,
        }]
        self.reader = ManifestReader(self.manifest)
        self.adapter = AppWorkspaceAdapter(self.reader)

    def test_resolves_real_hierarchy_without_inventing_source_revision(self):
        context = self.adapter.load_context("proj-demo", "sample-000")
        self.assertEqual(context.project_id, "proj-demo")
        self.assertEqual(context.case_id, "case-1")
        self.assertEqual(context.sample_id, "sample-000")
        self.assertEqual(context.source_object_id, "obj-source-000")
        self.assertEqual(context.volume_id, "vol-source-000")
        self.assertEqual(context.volume_hash, "a" * 64)
        self.assertIsNone(context.revision_id)
        self.assertEqual(context.spatial.units, "mm")
        self.assertEqual(context.spatial.space, "left-posterior-superior")
        source = self.adapter.load_context("proj-demo", "obj-source-000")
        self.assertEqual(source.sample_id, context.sample_id)

    def test_restore_pointer_wins_over_revision_order_and_reads_are_fresh(self):
        context = self.adapter.load_context("proj-demo", "candidate-ui")
        self.assertEqual(context.revision_id, "revision-ui-0")
        self.assertEqual(context.pose[3], 0)
        self.reader.manifest["candidates"][0]["currentRevisionId"] = "revision-ui-1"
        updated = self.adapter.load_context("proj-demo", "candidate-ui")
        self.assertEqual(updated.revision_id, "revision-ui-1")
        self.assertEqual(updated.pose[3], 5)
        self.assertEqual(self.reader.reads, 2)

    def test_membership_and_expected_revision_mismatch_are_explicit(self):
        for kwargs, code in [
            ({"case_id": "case-2"}, "cross-case-reference"),
            ({"expected_revision_id": "revision-ui-1"}, "stale-revision"),
        ]:
            with self.assertRaises(WorkspaceError) as caught:
                self.adapter.load_context("proj-demo", "candidate-ui", **kwargs)
            self.assertEqual(caught.exception.code, code)
        self.reader.manifest["revisions"][0]["candidateId"] = "some-other-candidate"
        with self.assertRaises(WorkspaceError) as caught:
            self.adapter.load_context("proj-demo", "candidate-ui")
        self.assertEqual(caught.exception.code, "workspace-contract-invalid")

    def test_app_mutation_is_blocked_without_touching_reader(self):
        with self.assertRaises(WorkspaceError) as caught:
            self.adapter.execute_mutation("transformCandidate", {})
        self.assertEqual(caught.exception.code, "app-mutation-contract-missing")
        self.assertEqual(self.reader.reads, 0)

    def test_sandbox_refuses_existing_app_database_without_changing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            # Renaming the database must not bypass schema detection.
            database = Path(directory) / "renamed.sqlite"
            with sqlite3.connect(database) as connection:
                connection.executescript("CREATE TABLE projects(id TEXT); CREATE TABLE samples(id TEXT); CREATE TABLE volume_assets(id TEXT); INSERT INTO projects VALUES ('keep-me');")
            before = database.read_bytes()
            sandbox = SQLiteApplicationStorage(database)
            with self.assertRaises(StorageError):
                sandbox.initialize()
            sandbox.close()
            self.assertEqual(database.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
