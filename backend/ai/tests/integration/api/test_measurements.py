"""Live foreground-volume measurement through the public HTTP boundary."""
from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE


METHOD = "candidate.foreground-volume.label-voxel.v1"
LIMITATION_NEEDLES = ("labelmap", "orthogonal", "placement", "clinical")


def nrrd_bytes(*, sizes, spacings=None, directions=None, encoding="raw", voxels=None, type_name="unsigned char", extra_header=()):
    count = sizes[0] * sizes[1] * sizes[2]
    if voxels is None:
        voxels = bytes([1] * 12 + [0] * (count - 12)) if count >= 12 else bytes([1] * count)
    assert len(voxels) == count
    lines = [
        "NRRD0005",
        f"type: {type_name}",
        "dimension: 3",
        f"sizes: {sizes[0]} {sizes[1]} {sizes[2]}",
        f"encoding: {encoding}",
    ]
    if spacings is not None:
        lines.append(f"spacings: {spacings[0]} {spacings[1]} {spacings[2]}")
    if directions is not None:
        rendered = " ".join("(" + ",".join(str(v) for v in col) + ")" for col in directions)
        lines.append(f"space directions: {rendered}")
    lines.extend(extra_header)
    header = ("\n".join(lines) + "\n\n").encode("ascii")
    payload = gzip.compress(voxels, compresslevel=6, mtime=0) if encoding in ("gzip", "gz") else voxels
    return header + payload


def spatial(*, sizes, spacings, directions=None):
    meta = {
        "units": "mm",
        "sizes": list(sizes),
        "spacings": list(spacings),
        "bboxMm": [sizes[i] * spacings[i] for i in range(3)],
    }
    if directions is not None:
        meta["spaceDirections"] = [list(col) for col in directions]
    return meta


class ForegroundVolumeMeasurementTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.repo = ApplicationRepository(self.root)
        self.project = self.repo.create_project("Measure")
        self.case = self.repo.add_case(self.project["id"], "Foreground volume")
        self.client = TestClient(create_app(self.root))
        self.addCleanup(self.client.close)

    def _seed(self, *, sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0), directions=None, voxels=None, encoding="raw", type_name="unsigned char"):
        data = nrrd_bytes(
            sizes=sizes,
            spacings=spacings,
            directions=directions,
            encoding=encoding,
            voxels=voxels,
            type_name=type_name,
        )
        sample = self.repo.add_sample(
            self.project["id"],
            self.case["id"],
            "Labelmap",
            True,
            spatial(sizes=sizes, spacings=spacings, directions=directions),
            data,
        )
        candidate = self.repo.create_candidate(sample["id"])
        return sample, candidate, data

    def _payload(self, candidate, request_id="req-measure-1", **overrides):
        body = {
            "request_id": request_id,
            "project_id": self.project["id"],
            "case_id": self.case["id"],
            "expected_revision_id": candidate["revisionId"],
            "parameters": {"measure_kind": "foreground-volume"},
        }
        body.update(overrides)
        return body

    def _post(self, candidate_id, payload, client=None):
        client = self.client if client is None else client
        return client.post(f"/api/candidates/{candidate_id}/measurements", json=payload)

    def _get(self, candidate_id, revision_id):
        return self.client.get(f"/api/candidates/{candidate_id}/revisions/{revision_id}/measurements")

    def _assert_completed(self, body, *, value, voxel_mm3, count, revision_id, volume_hash, request_id="req-measure-1"):
        self.assertEqual(body["status"], "completed")
        self.assertEqual(body["operation_id"], "measure.candidate")
        self.assertEqual(body["source"], "real-operation")
        self.assertEqual(body["case_id"], self.case["id"])
        self.assertEqual(body["request_id"], request_id)
        self.assertIsNone(body["error"])
        output = body["output"]
        self.assertEqual(output["kind"], "candidate-measurement")
        self.assertEqual(output["method_id"], METHOD)
        self.assertEqual(output["measure_kind"], "foreground-volume")
        self.assertEqual(output["value"], value)
        self.assertEqual(output["unit"], "mm3")
        self.assertEqual(output["measured_revision_id"], revision_id)
        self.assertEqual(output["volume_hash"], volume_hash)
        self.assertEqual(output["foreground_voxel_count"], count)
        self.assertEqual(output["voxel_volume_mm3"], voxel_mm3)
        joined = " ".join(body["limitations"]).lower()
        for needle in LIMITATION_NEEDLES:
            self.assertIn(needle, joined)

    def test_at01_twelve_foreground_unit_spacing_yields_twelve_mm3(self):
        sample, candidate, data = self._seed(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0))
        response = self._post(candidate["candidateId"], self._payload(candidate))
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self._assert_completed(
            body,
            value=12,
            voxel_mm3=1.0,
            count=12,
            revision_id=candidate["revisionId"],
            volume_hash=hashlib.sha256(data).hexdigest(),
        )
        listed = self._get(candidate["candidateId"], candidate["revisionId"])
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["output"]["value"], 12)
        after = self.repo.get_project_manifest(self.project["id"])
        self.assertEqual(len(after["revisions"]), 1)
        self.assertEqual(after["candidates"][0]["currentRevisionId"], candidate["revisionId"])
        volume_id = after["revisions"][0]["volumeId"]
        self.assertEqual((self.root / "volumes" / f"{volume_id}.nrrd").read_bytes(), data)
        self.assertEqual(after["samples"][0]["sourceAnatomy"]["volumeHash"], sample["sourceAnatomy"]["volumeHash"])

    def test_at02_anisotropic_spacing_scales_volume(self):
        _, candidate, data = self._seed(sizes=(4, 3, 2), spacings=(2.0, 3.0, 4.0))
        response = self._post(candidate["candidateId"], self._payload(candidate))
        self.assertEqual(response.status_code, 200, response.text)
        self._assert_completed(
            response.json(),
            value=288,
            voxel_mm3=24.0,
            count=12,
            revision_id=candidate["revisionId"],
            volume_hash=hashlib.sha256(data).hexdigest(),
        )

    def test_at03_raw_and_gzip_equivalent(self):
        voxels = bytes([1] * 12 + [0] * 12)
        _, raw_candidate, raw_data = self._seed(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0), voxels=voxels, encoding="raw")
        _, gz_candidate, gz_data = self._seed(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0), voxels=voxels, encoding="gzip")
        raw = self._post(raw_candidate["candidateId"], self._payload(raw_candidate, request_id="req-raw"))
        gz = self._post(gz_candidate["candidateId"], self._payload(gz_candidate, request_id="req-gz"))
        self.assertEqual(raw.status_code, 200, raw.text)
        self.assertEqual(gz.status_code, 200, gz.text)
        self.assertEqual(raw.json()["output"]["value"], gz.json()["output"]["value"])
        self.assertEqual(raw.json()["output"]["foreground_voxel_count"], 12)
        self.assertNotEqual(hashlib.sha256(raw_data).hexdigest(), hashlib.sha256(gz_data).hexdigest())

    def test_at04_06_07_08_unsupported_inputs(self):
        _, bad_spacing_candidate, _ = self._seed(spacings=(-1.0, 1.0, 1.0))
        response = self._post(bad_spacing_candidate["candidateId"], self._payload(bad_spacing_candidate, request_id="req-spacing"))
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["error"]["code"], "operation-unsupported")

        for label, data, meta in (
            ("bad-type", nrrd_bytes(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0), type_name="uint16"), spatial(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0))),
            ("dim2", b"NRRD0005\ntype: unsigned char\ndimension: 2\nsizes: 4 6\nencoding: raw\n\n" + bytes(24), spatial(sizes=(4, 6, 1), spacings=(1.0, 1.0, 1.0))),
            ("float-type", nrrd_bytes(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0), type_name="float"), spatial(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0))),
            ("extra", nrrd_bytes(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0)) + b"\x00", spatial(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0))),
            ("mismatch", nrrd_bytes(sizes=(4, 3, 2), spacings=(2.0, 2.0, 2.0)), spatial(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0))),
        ):
            with self.subTest(label=label):
                sample = self.repo.add_sample(self.project["id"], self.case["id"], label, True, meta, data)
                candidate = self.repo.create_candidate(sample["id"])
                response = self._post(candidate["candidateId"], self._payload(candidate, request_id=f"req-{label}"))
                self.assertEqual(response.status_code, 422, response.text)
                body = response.json()
                self.assertEqual(body["status"], "unsupported")
                self.assertEqual(body["error"]["code"], "operation-unsupported")
                self.assertIsNone(body["output"])
                self.assertEqual(self._get(candidate["candidateId"], candidate["revisionId"]).json(), [])

        _, truncate_candidate, data = self._seed()
        manifest = self.repo.get_project_manifest(self.project["id"])
        revision = next(r for r in manifest["revisions"] if r["id"] == truncate_candidate["revisionId"])
        path = self.root / "volumes" / f"{revision['volumeId']}.nrrd"
        # Truncate decoded payload while keeping a matching stored hash of the corrupted file.
        header_end = data.find(b"\n\n") + 2
        truncated = data[: header_end + 20]
        self.assertNotEqual(len(truncated) - header_end, 24)
        path.write_bytes(truncated)
        digest = hashlib.sha256(truncated).hexdigest()
        with sqlite3.connect(self.root / "app-model.sqlite") as db:
            db.execute("UPDATE volume_assets SET sha256=?, byte_size=? WHERE id=?", (digest, len(truncated), revision["volumeId"]))
            db.execute("UPDATE samples SET volume_hash=? WHERE volume_id=?", (digest, revision["volumeId"]))
            db.execute("UPDATE candidate_revisions SET volume_hash=? WHERE volume_id=?", (digest, revision["volumeId"]))
            db.commit()
        response = self._post(truncate_candidate["candidateId"], self._payload(truncate_candidate, request_id="req-trunc"))
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["error"]["code"], "operation-unsupported")

    def test_at09_hash_mismatch_is_integrity_failure(self):
        _, candidate, data = self._seed()
        path = self.root / "volumes" / f"{self.repo.get_project_manifest(self.project['id'])['revisions'][0]['volumeId']}.nrrd"
        path.write_bytes(data + b"\x00")
        response = self._post(candidate["candidateId"], self._payload(candidate))
        self.assertEqual(response.status_code, 500, response.text)
        body = response.json()
        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["error"]["code"], "artifact-integrity-failure")
        self.assertIsNone(body["output"])
        self.assertNotIn(str(self.root), response.text)
        self.assertEqual(self._get(candidate["candidateId"], candidate["revisionId"]).json(), [])

    def test_at10_stale_revision_at_completion(self):
        _, candidate, _ = self._seed()
        pose = [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1]

        def advance():
            self.repo.commit_placement(
                candidate["candidateId"],
                self.project["id"],
                self.case["id"],
                candidate["revisionId"],
                pose,
            )

        self.repo.faults["measurement_before_complete"] = advance
        with TestClient(create_app(self.root, repository=self.repo)) as client:
            response = self._post(candidate["candidateId"], self._payload(candidate, request_id="req-stale"), client=client)
        self.assertEqual(response.status_code, 409, response.text)
        body = response.json()
        self.assertEqual(body["status"], "stale")
        self.assertEqual(body["error"]["code"], "stale-revision")
        self.assertIsNone(body["output"])
        manifest = self.repo.get_project_manifest(self.project["id"])
        self.assertNotEqual(manifest["candidates"][0]["currentRevisionId"], candidate["revisionId"])
        self.assertEqual(self._get(candidate["candidateId"], candidate["revisionId"]).json(), [])
    def test_at11_rigid_placement_preserves_intrinsic_volume(self):
        _, candidate, data = self._seed(spacings=(2.0, 3.0, 4.0))
        first = self._post(candidate["candidateId"], self._payload(candidate, request_id="req-before"))
        self.assertEqual(first.status_code, 200, first.text)
        pose = [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1]
        placed = self.client.post(
            f"/api/candidates/{candidate['candidateId']}/placement",
            json={
                "project_id": self.project["id"],
                "case_id": self.case["id"],
                "expected_revision_id": candidate["revisionId"],
                "pose": pose,
            },
        )
        self.assertEqual(placed.status_code, 201, placed.text)
        revision2 = placed.json()["revisionId"]
        second = self._post(
            candidate["candidateId"],
            self._payload(candidate, request_id="req-after", expected_revision_id=revision2),
        )
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["output"]["value"], second.json()["output"]["value"])
        self.assertEqual(first.json()["output"]["volume_hash"], second.json()["output"]["volume_hash"])
        self.assertEqual(second.json()["output"]["measured_revision_id"], revision2)
        self.assertEqual(hashlib.sha256(data).hexdigest(), second.json()["output"]["volume_hash"])

    def test_at12_historical_result_not_current_for_r2(self):
        _, candidate, _ = self._seed()
        first = self._post(candidate["candidateId"], self._payload(candidate, request_id="req-r1"))
        self.assertEqual(first.status_code, 200, first.text)
        placed = self.client.post(
            f"/api/candidates/{candidate['candidateId']}/placement",
            json={
                "project_id": self.project["id"],
                "case_id": self.case["id"],
                "expected_revision_id": candidate["revisionId"],
                "pose": [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1],
            },
        )
        self.assertEqual(placed.status_code, 201, placed.text)
        revision2 = placed.json()["revisionId"]
        history_r1 = self._get(candidate["candidateId"], candidate["revisionId"])
        history_r2 = self._get(candidate["candidateId"], revision2)
        self.assertEqual(len(history_r1.json()), 1)
        self.assertEqual(history_r1.json()[0]["output"]["measured_revision_id"], candidate["revisionId"])
        self.assertEqual(history_r2.json(), [])

    def test_at13_invalid_grid_orientation_rejected(self):
        for name, directions in (
            ("duplicate-cardinal", ((1.0, 0.0, 0.0), (2.0, 0.0, 0.0), (0.0, 0.0, 1.0))),
            ("singular", ((1.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0))),
            ("incomplete", ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0))),
        ):
            with self.subTest(name=name):
                if name == "incomplete":
                    data = nrrd_bytes(
                        sizes=(4, 3, 2),
                        spacings=(1.0, 1.0, 1.0),
                        extra_header=("space directions: (1,0,0) (0,1,0)",),
                    )
                    sample = self.repo.add_sample(
                        self.project["id"],
                        self.case["id"],
                        name,
                        True,
                        spatial(sizes=(4, 3, 2), spacings=(1.0, 1.0, 1.0)),
                        data,
                    )
                    candidate = self.repo.create_candidate(sample["id"])
                else:
                    _, candidate, _ = self._seed(
                        sizes=(4, 3, 2),
                        spacings=(1.0, 1.0, 1.0),
                        directions=directions,
                    )
                response = self._post(candidate["candidateId"], self._payload(candidate, request_id=f"req-{name}"))
                self.assertEqual(response.status_code, 422, response.text)
                body = response.json()
                self.assertEqual(body["error"]["code"], "operation-unsupported")
                self.assertIn("grid-orientation", json.dumps(body["error"].get("details", {})).lower() + body["error"].get("message", "").lower())

    def test_at14_all_background_zero_volume(self):
        voxels = bytes(24)
        _, candidate, data = self._seed(voxels=voxels)
        response = self._post(candidate["candidateId"], self._payload(candidate))
        self.assertEqual(response.status_code, 200, response.text)
        self._assert_completed(
            response.json(),
            value=0,
            voxel_mm3=1.0,
            count=0,
            revision_id=candidate["revisionId"],
            volume_hash=hashlib.sha256(data).hexdigest(),
        )

    def test_at15_completed_replay_before_freshness_after_revision_change(self):
        _, candidate, _ = self._seed()
        payload = self._payload(candidate, request_id="req-replay")
        first = self._post(candidate["candidateId"], payload)
        self.assertEqual(first.status_code, 200, first.text)
        placed = self.client.post(
            f"/api/candidates/{candidate['candidateId']}/placement",
            json={
                "project_id": self.project["id"],
                "case_id": self.case["id"],
                "expected_revision_id": candidate["revisionId"],
                "pose": [0, -1, 0, 8, 1, 0, 0, 5, 0, 0, 1, 3, 0, 0, 0, 1],
            },
        )
        self.assertEqual(placed.status_code, 201, placed.text)
        second = self._post(candidate["candidateId"], payload)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(second.json()["output"]["measured_revision_id"], candidate["revisionId"])
        listed = self._get(candidate["candidateId"], candidate["revisionId"])
        self.assertEqual(len(listed.json()), 1)

    def test_at16_request_id_conflict(self):
        _, candidate, _ = self._seed()
        first = self._post(candidate["candidateId"], self._payload(candidate, request_id="req-conflict"))
        self.assertEqual(first.status_code, 200, first.text)
        conflict = self._post(
            candidate["candidateId"],
            self._payload(candidate, request_id="req-conflict", expected_revision_id="other-revision"),
        )
        self.assertEqual(conflict.status_code, 409, conflict.text)
        body = conflict.json()
        self.assertEqual(body["error"]["code"], "request-id-conflict")
        self.assertEqual(len(self._get(candidate["candidateId"], candidate["revisionId"]).json()), 1)

    def test_at17_in_progress_bounded_wait_without_takeover(self):
        _, candidate, _ = self._seed()
        release = threading.Event()
        entered = threading.Event()
        original = self.repo.load_measurement_volume

        def slow_load(*args, **kwargs):
            entered.set()
            release.wait(timeout=5)
            return original(*args, **kwargs)

        self.repo.load_measurement_volume = slow_load
        with TestClient(create_app(self.root, repository=self.repo)) as client:
            def owner():
                return self._post(candidate["candidateId"], self._payload(candidate, request_id="req-wait"), client=client)

            def waiter():
                entered.wait(timeout=5)
                started = time.monotonic()
                response = self._post(candidate["candidateId"], self._payload(candidate, request_id="req-wait"), client=client)
                return response, time.monotonic() - started

            with ThreadPoolExecutor(max_workers=2) as pool:
                owner_future = pool.submit(owner)
                waiter_future = pool.submit(waiter)
                response, elapsed = waiter_future.result(timeout=8)
                release.set()
                owner_response = owner_future.result(timeout=8)
        self.assertEqual(owner_response.status_code, 200, owner_response.text)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["error"]["code"], "request-in-progress")
        self.assertGreaterEqual(elapsed, 1.5)
        self.assertLessEqual(elapsed, 3.0)
        self.assertEqual(len(self._get(candidate["candidateId"], candidate["revisionId"]).json()), 1)

    def test_at18_incomplete_reservation_requires_reconciliation(self):
        from skullfix_ai.application.foreground_volume import MeasurementCommand, canonical_measurement_identity

        _, candidate, _ = self._seed()
        payload = self._payload(candidate, request_id="req-crash")
        command = MeasurementCommand.model_validate({**payload, "candidate_id": candidate["candidateId"]})
        identity = canonical_measurement_identity(command)
        # Touch repository so additive measurement DDL is present before the crash fixture insert.
        self.assertEqual(self.repo.list_measurement_results(candidate["candidateId"], candidate["revisionId"]), [])
        with sqlite3.connect(self.root / "app-model.sqlite") as db:
            db.execute(
                "INSERT INTO measurement_request_reservations("
                "case_id, request_id, canonical_identity, state, run_id, result_id, result_json, created_at"
                ") VALUES (?,?,?,?,?,?,?,?)",
                (
                    self.case["id"],
                    "req-crash",
                    identity,
                    "incomplete",
                    str(uuid4()),
                    None,
                    None,
                    "2026-11-14T00:00:00.000Z",
                ),
            )
            db.commit()
        response = self._post(candidate["candidateId"], payload)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["error"]["code"], "reconciliation-required")
        self.assertEqual(self._get(candidate["candidateId"], candidate["revisionId"]).json(), [])

    def test_directions_present_use_abs_det_not_spacings_product(self):
        directions = ((2.0, 0.0, 0.0), (0.0, 3.0, 0.0), (0.0, 0.0, 4.0))
        _, candidate, data = self._seed(spacings=(9.0, 9.0, 9.0), directions=directions)
        response = self._post(candidate["candidateId"], self._payload(candidate))
        self.assertEqual(response.status_code, 200, response.text)
        self._assert_completed(
            response.json(),
            value=288,
            voxel_mm3=24.0,
            count=12,
            revision_id=candidate["revisionId"],
            volume_hash=hashlib.sha256(data).hexdigest(),
        )


if __name__ == "__main__":
    unittest.main()
