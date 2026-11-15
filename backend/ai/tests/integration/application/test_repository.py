"""Application repository behavior; cross-runtime fixture oracle lives in Vitest."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from threading import Barrier, Event
from tempfile import TemporaryDirectory
import sqlite3
import unittest

from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE
from skullfix_ai.storage import SQLiteApplicationStorage, StorageError

META = {"units": "mm", "sizes": [2, 3, 4], "spacings": [1, 2, 3], "bboxMm": [2, 6, 12]}
DATA = b"synthetic repository test volume, not geometry"


class ApplicationRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix="hp-python-app-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = ApplicationRepository(self.root)

    def fixture(self):
        p = self.repo.create_project(" Test ")
        c = self.repo.add_case(p["id"], " Case ")
        s = self.repo.add_sample(p["id"], c["id"], " Source ", True, META, DATA)
        return p, c, s

    def test_manifest_identity_hash_and_restart(self):
        import hashlib
        p, c, s = self.fixture()
        candidate = self.repo.create_candidate(s["id"])
        manifest = ApplicationRepository(self.root).get_project_manifest(p["id"])
        self.assertEqual(manifest["project"]["name"], "Test")
        self.assertEqual(manifest["cases"], [{"id": c["id"], "projectId": p["id"], "name": "Case"}])
        self.assertEqual(manifest["samples"][0]["sourceAnatomy"]["spatial"], META)
        self.assertEqual(manifest["revisions"][0]["volumeHash"], hashlib.sha256(DATA).hexdigest())
        self.assertNotIn("displayName", manifest["candidates"][0])
        self.assertEqual(manifest["candidates"][0]["currentRevisionId"], candidate["revisionId"])
        self.assertEqual(self.repo.read_volume(p["id"], s["sourceAnatomy"]["volumeId"]), DATA)


    def test_restore_below_max_then_append_preserves_old_revisions(self):
        p, _, sample = self.fixture()
        candidate = self.repo.create_candidate(sample["id"])
        pose = IDENTITY_POSE.copy()
        pose[3] = 25
        first = self.repo.commit_transform(candidate["candidateId"], pose)
        self.repo.restore_revision(candidate["candidateId"], candidate["revisionId"])
        before = self.repo.get_project_manifest(p["id"])
        self.assertEqual(before["candidates"][0]["currentRevisionId"], candidate["revisionId"])
        second = self.repo.commit_transform(candidate["candidateId"], IDENTITY_POSE)
        after = self.repo.get_project_manifest(p["id"])
        self.assertEqual(after["revisions"][:2], before["revisions"])
        self.assertEqual([r["order"] for r in after["revisions"]], [0, 1, 2])
        self.assertEqual([r["id"] for r in after["revisions"]], [candidate["revisionId"], first, second])
        self.assertEqual(after["candidates"][0]["currentRevisionId"], second)

    def test_concurrent_transforms_append_unique_ordered_immutable_revisions(self):
        project, _, sample = self.fixture()
        candidate = self.repo.create_candidate(sample["id"])
        before = self.repo.get_project_manifest(project["id"])
        gate = Barrier(2)

        class SimultaneousWriters(ApplicationRepository):
            @contextmanager
            def _transaction(self, db):
                # Force both public calls to reach the write-transaction seam
                # before either can acquire SQLite's lock. This deterministically
                # exposes stale pre-lock reads without asserting private SQL.
                gate.wait(timeout=5)
                with super()._transaction(db):
                    yield

        repository = SimultaneousWriters(self.root)
        poses = [IDENTITY_POSE.copy(), IDENTITY_POSE.copy()]
        poses[0][3], poses[1][3] = 7, 11
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(repository.commit_transform, candidate["candidateId"], pose)
                       for pose in poses]
            created = {future.result(timeout=10) for future in futures}

        after = self.repo.get_project_manifest(project["id"])
        revisions = after["revisions"]
        self.assertEqual([revision["order"] for revision in revisions], [0, 1, 2])
        self.assertEqual(revisions[0], before["revisions"][0])
        self.assertEqual({revision["id"] for revision in revisions[1:]}, created)
        self.assertEqual(len(created), 2)
        self.assertEqual({tuple(revision["pose"]) for revision in revisions[1:]},
                         {tuple(pose) for pose in poses})
        self.assertTrue(all(revision["volumeId"] == revisions[0]["volumeId"]
                            and revision["volumeHash"] == revisions[0]["volumeHash"]
                            for revision in revisions))
        self.assertEqual(after["candidates"][0]["currentRevisionId"], revisions[-1]["id"])

    def test_import_failure_rolls_back_file_and_database(self):
        p, c, sample = self.fixture()
        before = self.repo.get_project_manifest(p["id"])
        before_files = set((self.root / "volumes").iterdir())
        for fault in ["failAfterVolumeWrite", "before_commit"]:
            with self.subTest(fault=fault):
                faulty = ApplicationRepository(self.root, {fault: True})
                with self.assertRaisesRegex(RuntimeError, "injected fault"):
                    faulty.add_sample(p["id"], c["id"], "failed", True, META, DATA)
                self.assertEqual(self.repo.get_project_manifest(p["id"]), before)
                self.assertEqual(set((self.root / "volumes").iterdir()), before_files)

    def test_candidate_and_transform_transaction_failures_leave_no_partial_revision(self):
        p, _, sample = self.fixture()
        faulty = ApplicationRepository(self.root, {"before_commit": True})
        with self.assertRaisesRegex(RuntimeError, "before_commit"):
            faulty.create_candidate(sample["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"])["candidates"], [])
        candidate = self.repo.create_candidate(sample["id"])
        before = self.repo.get_project_manifest(p["id"])
        with self.assertRaisesRegex(RuntimeError, "before_commit"):
            faulty.commit_transform(candidate["candidateId"], IDENTITY_POSE)
        self.assertEqual(self.repo.get_project_manifest(p["id"]), before)

    def test_sample_delete_transaction_failure_restores_parked_file(self):
        p, c, sample = self.fixture()
        candidate = self.repo.create_candidate(sample["id"])
        before = self.repo.get_project_manifest(p["id"])
        faulty = ApplicationRepository(self.root, {"before_commit": True})
        with self.assertRaisesRegex(RuntimeError, "before_commit"):
            faulty.remove_sample(p["id"], c["id"], sample["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"]), before)
        self.assertEqual(self.repo.read_volume(p["id"], sample["sourceAnatomy"]["volumeId"]), DATA)
        self.assertEqual(list((self.root / "volumes").glob("*.pending-delete")), [])

    def test_candidate_delete_keeps_sample_volume_and_sample_delete_cascades(self):
        p, c, sample = self.fixture()
        candidate = self.repo.create_candidate(sample["id"])
        self.repo.delete_candidate(candidate["candidateId"])
        self.assertEqual(self.repo.get_project_manifest(p["id"])["revisions"], [])
        self.assertEqual(self.repo.read_volume(p["id"], sample["sourceAnatomy"]["volumeId"]), DATA)
        self.repo.create_candidate(sample["id"])
        self.repo.remove_sample(p["id"], c["id"], sample["id"])
        manifest = self.repo.get_project_manifest(p["id"])
        for key in ["samples", "candidates", "revisions"]:
            self.assertEqual(manifest[key], [])
        self.assertEqual(list((self.root / "volumes").iterdir()), [])

    def test_case_and_project_deletion_cascades_and_count(self):
        p, c, sample = self.fixture()
        self.repo.create_candidate(sample["id"])
        self.repo.remove_case(p["id"], c["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"])["cases"], [])
        self.assertEqual(self.repo.list_projects()[0]["caseCount"], 0)
        self.assertEqual(list((self.root / "volumes").iterdir()), [])
        second = self.repo.add_case(p["id"], "second")
        self.repo.add_sample(p["id"], second["id"], "again", True, META, DATA)
        self.repo.delete_project(p["id"])
        self.assertEqual(self.repo.list_projects(), [])
        self.assertEqual(list((self.root / "volumes").iterdir()), [])

    def test_deletion_captures_import_committed_before_its_write_lock(self):
        for method in ("remove_case", "delete_project"):
            with self.subTest(method=method), TemporaryDirectory(prefix="hp-delete-import-") as temp:
                root = Path(temp)
                repository = ApplicationRepository(root)
                project = repository.create_project("project")
                case = repository.add_case(project["id"], "case")
                reached, resume = Event(), Event()

                class PausedDeletion(ApplicationRepository):
                    @contextmanager
                    def _transaction(self, db):
                        # Complete a real import after deletion is requested but
                        # before its write lock. The cascade must capture it.
                        reached.set()
                        if not resume.wait(timeout=5):
                            raise TimeoutError("Deletion scheduling timed out")
                        with super()._transaction(db):
                            yield

                deleting = PausedDeletion(root)
                args = (project["id"], case["id"]) if method == "remove_case" else (project["id"],)
                with ThreadPoolExecutor(max_workers=1) as executor:
                    pending = executor.submit(getattr(deleting, method), *args)
                    try:
                        self.assertTrue(reached.wait(timeout=5))
                        sample = repository.add_sample(project["id"], case["id"], "imported", True, META, DATA)
                        self.assertEqual(repository.read_volume(project["id"], sample["sourceAnatomy"]["volumeId"]), DATA)
                    finally:
                        resume.set()
                    pending.result(timeout=10)

                if method == "remove_case":
                    self.assertEqual(repository.get_project_manifest(project["id"])["cases"], [])
                    self.assertEqual(repository.list_projects()[0]["caseCount"], 0)
                else:
                    self.assertEqual(repository.list_projects(), [])
                with sqlite3.connect(root / "app-model.sqlite") as db:
                    for table in ("samples", "candidates", "candidate_revisions", "volume_assets"):
                        self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0, table)
                self.assertEqual(list((root / "volumes").iterdir()), [])

    def test_wrong_owner_delete_preserves_characterized_baseline(self):
        import sqlite3
        p, c, sample = self.fixture()
        other = self.repo.create_project("other")
        before = self.repo.get_project_manifest(p["id"])
        with self.assertRaises(sqlite3.IntegrityError):
            self.repo.remove_case(other["id"], c["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"]), before)
        self.assertEqual(self.repo.read_volume(p["id"], sample["sourceAnatomy"]["volumeId"]), DATA)
        empty = self.repo.add_case(p["id"], "empty")
        self.repo.remove_case(other["id"], empty["id"])
        self.assertEqual(len(self.repo.get_project_manifest(p["id"])["cases"]), 2)

    def test_post_commit_file_cleanup_baseline_is_explicit(self):
        p, c, sample = self.fixture()
        path = self.root / "volumes" / (sample["sourceAnatomy"]["volumeId"] + ".nrrd")
        faulty = ApplicationRepository(self.root, {"after_sample_delete_commit": True})
        with self.assertRaisesRegex(RuntimeError, "after_sample_delete_commit"):
            faulty.remove_sample(p["id"], c["id"], sample["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"])["samples"], [])
        self.assertEqual(path.read_bytes(), DATA)  # Node baseline restores orphan bytes after commit failure.
        self.assertIsNone(self.repo.find_sample_context(sample["id"]))

    def test_case_cleanup_failure_keeps_orphan_bytes_as_current_baseline(self):
        p, c, sample = self.fixture()
        ApplicationRepository(self.root, {"before_volume_cleanup": True}).remove_case(p["id"], c["id"])
        self.assertEqual(self.repo.get_project_manifest(p["id"])["cases"], [])
        self.assertEqual(self.repo.read_volume(p["id"], sample["sourceAnatomy"]["volumeId"]), DATA)

    def test_sandbox_guard_rejects_application_database_without_modification(self):
        self.fixture()
        import hashlib
        path = self.root / "app-model.sqlite"
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        with self.assertRaises(StorageError):
            SQLiteApplicationStorage(path).initialize()
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)

    def test_cross_owner_import_and_restore_reject_without_mutation(self):
        p, c, sample = self.fixture()
        other = self.repo.create_project("other")
        with self.assertRaisesRegex(ValueError, "Case .* not found"):
            self.repo.add_sample(other["id"], c["id"], "wrong", True, META, DATA)
        first = self.repo.create_candidate(sample["id"])
        second = self.repo.create_candidate(sample["id"])
        before = self.repo.get_project_manifest(p["id"])
        with self.assertRaisesRegex(ValueError, "Revision .* not found"):
            self.repo.restore_revision(first["candidateId"], second["revisionId"])
        self.assertEqual(self.repo.get_project_manifest(p["id"]), before)

    def test_invalid_baseline_metadata_and_pose_are_preserved_not_hardened(self):
        p = self.repo.create_project("baseline")
        c = self.repo.add_case(p["id"], "case")
        sample = self.repo.add_sample(p["id"], c["id"], "source", True, {}, DATA)
        candidate = self.repo.create_candidate(sample["id"])
        pose = IDENTITY_POSE.copy()
        pose[4] = "not-a-number"
        pose[9] = None
        self.repo.commit_transform(candidate["candidateId"], pose)
        manifest = self.repo.get_project_manifest(p["id"])
        self.assertEqual(manifest["samples"][0]["sourceAnatomy"]["spatial"], {})
        self.assertEqual(manifest["revisions"][1]["pose"], pose)

    def test_path_containment_rejects_escape(self):
        with self.assertRaisesRegex(ValueError, "Volume not found"):
            self.repo.read_volume("unused", "../../private")

    def test_search_project_samples_filters_by_display_name_and_case_name(self):
        p = self.repo.create_project("Search")
        parietal = self.repo.add_case(p["id"], "Parietal Case")
        temporal = self.repo.add_case(p["id"], "Temporal Case")
        s1 = self.repo.add_sample(p["id"], parietal["id"], "skullbreak-000-complete", True, META, DATA)
        s2 = self.repo.add_sample(p["id"], temporal["id"], "other-sample", True, META, DATA)

        all_rows = self.repo.search_project_samples(p["id"], "")
        self.assertEqual({r["id"] for r in all_rows}, {s1["id"], s2["id"]})
        self.assertTrue(all({"id", "displayName", "caseId", "caseName"} <= set(r) for r in all_rows))

        by_display = self.repo.search_project_samples(p["id"], "skullbreak")
        self.assertEqual([r["id"] for r in by_display], [s1["id"]])
        self.assertEqual(by_display[0]["caseName"], "Parietal Case")

        by_case = self.repo.search_project_samples(p["id"], "temporal")
        self.assertEqual([r["id"] for r in by_case], [s2["id"]])

        none = self.repo.search_project_samples(p["id"], "zzzz-no-match")
        self.assertEqual(none, [])

        with self.assertRaisesRegex(ValueError, "not found"):
            self.repo.search_project_samples("missing-project", "")


if __name__ == "__main__":
    unittest.main()
