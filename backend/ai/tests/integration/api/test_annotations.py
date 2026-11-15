"""Revision-scoped mechanical annotation CRUD (client contract from apiClient)."""
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

META = {
    "units": "mm",
    "space": "left-posterior-superior",
    "sizes": [5, 6, 2],
    "spacings": [1, 1, 2],
    "bboxMm": [5, 6, 4],
    "spaceOrigin": [10, 20, 30],
}


class AnnotationApiTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "app"
        self.repo = ApplicationRepository(self.root)
        self.project = self.repo.create_project("Annot")
        self.case = self.repo.add_case(self.project["id"], "Case")
        self.sample = self.repo.add_sample(
            self.project["id"], self.case["id"], "Source", True, META, b"vol"
        )
        created = self.repo.create_candidate(self.sample["id"])
        self.candidate_id = created["candidateId"]
        self.revision_id = created["revisionId"]
        self.client = TestClient(create_app(self.root, repository=self.repo))
        self.addCleanup(self.client.close)
        self.list_url = f"/api/revisions/{self.revision_id}/annotations"

    def test_create_list_update_delete_and_manifest_join(self):
        missing = self.client.post(
            "/api/revisions/missing-revision/annotations",
            json={"type": "text_note", "name": "A", "points": [[0, 0, 0]]},
        )
        self.assertEqual(missing.status_code, 404, missing.text)

        bad = self.client.post(
            self.list_url, json={"type": "text_note", "points": [[0, 0, 0]]}
        )
        self.assertEqual(bad.status_code, 400, bad.text)

        created = self.client.post(
            self.list_url,
            json={
                "type": "highlight",
                "name": "Brush",
                "points": [[1.0, 2.0, 3.0]],
                "meta": {"color": "amber", "triangleIndices": [0, 1, 2]},
                "locked": False,
                "visible": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["revisionId"], self.revision_id)
        self.assertEqual(body["type"], "highlight")
        self.assertEqual(body["name"], "Brush")
        self.assertEqual(body["points"], [[1.0, 2.0, 3.0]])
        self.assertEqual(body["meta"]["color"], "amber")
        self.assertFalse(body["locked"])
        self.assertTrue(body["visible"])
        self.assertIn("id", body)
        self.assertIn("createdAt", body)

        listed = self.client.get(self.list_url)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual([a["id"] for a in listed.json()], [body["id"]])

        patched = self.client.patch(
            f"/api/annotations/{body['id']}",
            json={"name": "Brush 2", "meta": {"color": "rose"}, "visible": False},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["name"], "Brush 2")
        self.assertEqual(patched.json()["meta"]["color"], "rose")
        self.assertFalse(patched.json()["visible"])

        manifest = self.client.get(f"/api/projects/{self.project['id']}")
        self.assertEqual(manifest.status_code, 200, manifest.text)
        anns = manifest.json().get("annotations") or []
        self.assertEqual(len(anns), 1)
        self.assertEqual(anns[0]["id"], body["id"])
        self.assertEqual(anns[0]["name"], "Brush 2")

        deleted = self.client.delete(f"/api/annotations/{body['id']}")
        self.assertEqual(deleted.status_code, 204, deleted.text)
        self.assertEqual(self.client.get(self.list_url).json(), [])

        gone = self.client.patch(
            f"/api/annotations/{body['id']}", json={"name": "x"}
        )
        self.assertEqual(gone.status_code, 404, gone.text)

    def test_candidate_delete_cascades_annotations(self):
        created = self.client.post(
            self.list_url,
            json={"type": "line", "name": "L", "points": [[0, 0, 0], [1, 0, 0]]},
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(
            self.client.delete(f"/api/candidates/{self.candidate_id}").status_code,
            204,
        )
        self.assertEqual(self.client.get(self.list_url).json(), [])
        self.assertEqual(
            self.client.get(f"/api/projects/{self.project['id']}").json().get(
                "annotations", []
            ),
            [],
        )


if __name__ == "__main__":
    unittest.main()
