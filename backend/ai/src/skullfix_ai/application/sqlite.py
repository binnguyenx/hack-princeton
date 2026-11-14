"""Authoritative application repository preserving the shipped Node storage contract.

This is distinct from skullfix_ai.storage (synthetic sandbox). Every caller supplies
an explicit root; no test or library caller implicitly opens the live data root.
D1–D5 hardening proposals are not implemented here.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

IDENTITY_POSE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
DDL = """
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      case_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS volume_assets (
      id TEXT PRIMARY KEY,
      rel_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      display_name TEXT,
      license TEXT NOT NULL,
      spatially_verified INTEGER NOT NULL,
      source_object_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      spatial_json TEXT NOT NULL,
      volume_hash TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES volume_assets(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL,
      display_name TEXT,
      current_revision_id TEXT NOT NULL,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS candidate_revisions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      ord INTEGER NOT NULL,
      volume_id TEXT NOT NULL,
      pose_json TEXT NOT NULL,
      volume_hash TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES volume_assets(id)
    );
  """


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _json(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


class ApplicationRepository:
    """Synchronous application service/repository, with one connection per call.

    ``faults`` is an optional test-only mapping. Production composition leaves it
    empty. File cleanup remains the characterized baseline until D5 is approved.
    """

    def __init__(self, root: Path | str, faults: dict | None = None):
        self.root = Path(root).resolve()
        self.faults = faults if faults is not None else {}

    def _fault(self, name):
        if self.faults.get(name):
            raise RuntimeError(f"injected fault: {name}")

    @contextmanager
    def _db(self):
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "volumes").mkdir(exist_ok=True)
        db = sqlite3.connect(self.root / "app-model.sqlite", isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys=ON")
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            # Never initialize over the separate AI sandbox's incompatible schema.
            if "sources" in tables or "operation_runs" in tables or "artifacts" in tables:
                raise ValueError("Application repository cannot open sandbox storage")
            db.executescript(DDL)
            db.execute("INSERT OR IGNORE INTO users(id,display_name) VALUES(?,?)", ("local-dev", "Local Dev"))
            yield db
        finally:
            db.close()

    @contextmanager
    def _transaction(self, db):
        db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self._fault("before_commit")
            db.execute("COMMIT")
        except BaseException:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise

    @staticmethod
    def _project(db, project_id):
        row = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        if row is None:
            raise ValueError(f"Project {project_id} not found")
        return row

    def _volume_path(self, volume_id):
        # Database-issued UUID ids are file basenames, not caller-selected paths.
        if not volume_id or Path(volume_id).name != volume_id or "/" in volume_id or "\\" in volume_id:
            raise ValueError("Volume not found")
        path = self.root / "volumes" / f"{volume_id}.nrrd"
        if not path.resolve().is_relative_to((self.root / "volumes").resolve()):
            raise ValueError("Volume not found")
        return path

    def list_projects(self):
        with self._db() as db:
            return [{"id": r["id"], "name": r["name"], "updatedAt": r["updated_at"], "caseCount": r["case_count"]}
                    for r in db.execute("SELECT * FROM projects ORDER BY updated_at DESC")]

    def create_project(self, name):
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("Project name is required")
        with self._db() as db:
            pid, stamp = str(uuid4()), _now()
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?)", (pid, "local-dev", trimmed, stamp, 0))
            return {"id": pid, "name": trimmed, "updatedAt": stamp, "caseCount": 0}

    def get_project_manifest(self, project_id):
        with self._db() as db:
            project = self._project(db, project_id)
            cases = [{"id": r["id"], "projectId": r["project_id"], "name": r["name"]}
                     for r in db.execute("SELECT * FROM cases WHERE project_id=? ORDER BY id", (project_id,))]
            samples = []
            for r in db.execute("SELECT s.* FROM samples s JOIN cases c ON c.id=s.case_id WHERE c.project_id=? ORDER BY s.id", (project_id,)):
                sample = {"id": r["id"], "caseId": r["case_id"], "license": r["license"], "spatiallyVerified": r["spatially_verified"] == 1,
                          "sourceAnatomy": {"objectId": r["source_object_id"], "sampleId": r["id"], "volumeId": r["volume_id"], "spatial": json.loads(r["spatial_json"]), "volumeHash": r["volume_hash"]}}
                if r["display_name"] is not None:
                    sample["displayName"] = r["display_name"]
                samples.append(sample)
            candidates = []
            for r in db.execute("SELECT c.* FROM candidates c JOIN samples s ON s.id=c.sample_id JOIN cases k ON k.id=s.case_id WHERE k.project_id=? ORDER BY c.id", (project_id,)):
                candidate = {"objectId": r["id"], "sampleId": r["sample_id"], "currentRevisionId": r["current_revision_id"]}
                if r["display_name"] is not None:
                    candidate["displayName"] = r["display_name"]
                candidates.append(candidate)
            revisions = [{"id": r["id"], "candidateId": r["candidate_id"], "order": r["ord"], "volumeId": r["volume_id"], "pose": json.loads(r["pose_json"]), "volumeHash": r["volume_hash"]}
                         for r in db.execute("SELECT r.* FROM candidate_revisions r JOIN candidates c ON c.id=r.candidate_id JOIN samples s ON s.id=c.sample_id JOIN cases k ON k.id=s.case_id WHERE k.project_id=? ORDER BY r.candidate_id,r.ord", (project_id,))]
            return {"formatVersion": 1, "user": {"id": "local-dev", "displayName": "Local Dev"},
                    "project": {"id": project["id"], "ownerUserId": project["owner_user_id"], "name": project["name"]},
                    "cases": cases, "samples": samples, "candidates": candidates, "revisions": revisions,
                    "viewState": {"selectionObjectId": None, "camera": {"position": [0,0,500], "target": [0,0,0]}, "visibility": {}, "inspectionPlane": {"enabled": False,"axis": "z","offset": 0}},
                    "openDocuments": [], "activeDocumentId": None}

    def add_case(self, project_id, name):
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("Case name is required")
        with self._db() as db:
            self._project(db, project_id)
            case_id = str(uuid4())
            with self._transaction(db):
                db.execute("INSERT INTO cases VALUES(?,?,?)", (case_id, project_id, trimmed))
                db.execute("UPDATE projects SET case_count=(SELECT COUNT(*) FROM cases WHERE project_id=?),updated_at=? WHERE id=?", (project_id, _now(), project_id))
            return {"id": case_id, "projectId": project_id, "name": trimmed}

    def add_sample(self, project_id, case_id, display_name, spatially_verified, meta, data):
        with self._db() as db:
            self._project(db, project_id)
            if db.execute("SELECT id FROM cases WHERE id=? AND project_id=?", (case_id, project_id)).fetchone() is None:
                raise ValueError(f"Case {case_id} not found")
            sample_id, volume_id, object_id = str(uuid4()), str(uuid4()), str(uuid4())
            label = display_name.strip() or sample_id
            digest = hashlib.sha256(data).hexdigest()
            path = self._volume_path(volume_id)
            wrote = False
            try:
                path.write_bytes(data)
                wrote = True
                self._fault("failAfterVolumeWrite")
                with self._transaction(db):
                    db.execute("INSERT INTO volume_assets VALUES(?,?,?,?)", (volume_id, f"volumes/{volume_id}.nrrd", digest, len(data)))
                    db.execute("INSERT INTO samples VALUES(?,?,?,?,?,?,?,?,?)", (sample_id, case_id, label, "unknown", int(bool(spatially_verified)), object_id, volume_id, _json(meta), digest))
                    db.execute("UPDATE projects SET updated_at=? WHERE id=?", (_now(), project_id))
            except BaseException:
                if wrote:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass
                raise
            return {"id": sample_id, "caseId": case_id, "displayName": label, "license": "unknown", "spatiallyVerified": bool(spatially_verified),
                    "sourceAnatomy": {"objectId": object_id, "sampleId": sample_id, "volumeId": volume_id, "spatial": meta, "volumeHash": digest}}

    def find_sample_volume(self, sample_id):
        context = self.find_sample_context(sample_id)
        return None if context is None else {"projectId": context["projectId"], "volumeId": context["volumeId"]}

    def find_sample_context(self, sample_id):
        with self._db() as db:
            row = db.execute("SELECT c.project_id,s.case_id,s.volume_id FROM samples s JOIN cases c ON c.id=s.case_id WHERE s.id=?", (sample_id,)).fetchone()
            return None if row is None else {"projectId": row["project_id"], "caseId": row["case_id"], "volumeId": row["volume_id"]}

    def read_volume(self, project_id, volume_id):
        return self._volume_path(volume_id).read_bytes()

    def create_candidate(self, sample_id):
        with self._db() as db:
            sample = db.execute("SELECT * FROM samples WHERE id=?", (sample_id,)).fetchone()
            if sample is None:
                raise ValueError(f"Sample {sample_id} not found")
            if sample["spatially_verified"] != 1:
                raise ValueError("Sample is not spatially verified")
            cid, rid = str(uuid4()), str(uuid4())
            with self._transaction(db):
                db.execute("INSERT INTO candidates VALUES(?,?,?,?)", (cid, sample_id, None, rid))
                db.execute("INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)", (rid, cid, 0, sample["volume_id"], _json(IDENTITY_POSE), sample["volume_hash"]))
            return {"candidateId": cid, "revisionId": rid}

    def commit_transform(self, candidate_id, pose):
        with self._db() as db:
            with self._transaction(db):
                current = db.execute("SELECT current_revision_id FROM candidates WHERE id=?", (candidate_id,)).fetchone()
                if current is None:
                    raise ValueError(f"Candidate {candidate_id} not found")
                previous = db.execute("SELECT volume_id,volume_hash FROM candidate_revisions WHERE id=?", (current[0],)).fetchone()
                if previous is None:
                    raise ValueError(f"Missing revision {current[0]}")
                order = db.execute("SELECT COUNT(*) FROM candidate_revisions WHERE candidate_id=?", (candidate_id,)).fetchone()[0]
                rid = str(uuid4())
                db.execute("INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)", (rid, candidate_id, order, previous["volume_id"], _json(list(pose)), previous["volume_hash"]))
                db.execute("UPDATE candidates SET current_revision_id=? WHERE id=?", (rid, candidate_id))
            return rid

    def restore_revision(self, candidate_id, revision_id):
        with self._db() as db:
            if db.execute("SELECT id FROM candidate_revisions WHERE id=? AND candidate_id=?", (revision_id, candidate_id)).fetchone() is None:
                raise ValueError(f"Revision {revision_id} not found for candidate {candidate_id}")
            db.execute("UPDATE candidates SET current_revision_id=? WHERE id=?", (revision_id, candidate_id))

    def delete_candidate(self, candidate_id):
        with self._db() as db:
            db.execute("DELETE FROM candidates WHERE id=?", (candidate_id,))

    def remove_sample(self, project_id, case_id, sample_id):
        self._fault("failBeforeSampleDelete")
        context = self.find_sample_context(sample_id)
        if context is None or context["projectId"] != project_id or context["caseId"] != case_id:
            raise ValueError(f"Sample {sample_id} not found")
        path = self._volume_path(context["volumeId"])
        path.stat()
        parked = path.with_name(path.name + ".pending-delete")
        path.rename(parked)
        try:
            with self._db() as db:
                with self._transaction(db):
                    db.execute("DELETE FROM samples WHERE id=?", (sample_id,))
                    db.execute("DELETE FROM volume_assets WHERE id=?", (context["volumeId"],))
                    db.execute("UPDATE projects SET updated_at=? WHERE id=?", (_now(), project_id))
            self._fault("after_sample_delete_commit")
            parked.unlink()
        except BaseException:
            try:
                parked.rename(path)
            except OSError:
                pass
            raise

    def _best_effort_cleanup(self, volume_ids):
        for volume_id in volume_ids:
            try:
                self._fault("before_volume_cleanup")
                self._volume_path(volume_id).unlink(missing_ok=True)
            except (OSError, RuntimeError):
                # Characterized Node baseline; D5 proposed hardening is not accepted.
                pass

    def remove_case(self, project_id, case_id):
        with self._db() as db:
            self._project(db, project_id)
            with self._transaction(db):
                volume_ids = [r[0] for r in db.execute("SELECT volume_id FROM samples WHERE case_id=?", (case_id,))]
                # Preserve characterized D4 wrong-owner behavior until approved.
                db.execute("DELETE FROM cases WHERE id=? AND project_id=?", (case_id, project_id))
                for volume_id in volume_ids:
                    db.execute("DELETE FROM volume_assets WHERE id=?", (volume_id,))
                db.execute("UPDATE projects SET case_count=(SELECT COUNT(*) FROM cases WHERE project_id=?),updated_at=? WHERE id=?", (project_id, _now(), project_id))
        self._best_effort_cleanup(volume_ids)

    def delete_project(self, project_id):
        with self._db() as db:
            with self._transaction(db):
                volume_ids = [r[0] for r in db.execute("SELECT DISTINCT s.volume_id FROM samples s JOIN cases c ON c.id=s.case_id WHERE c.project_id=?", (project_id,))]
                db.execute("DELETE FROM projects WHERE id=?", (project_id,))
                for volume_id in volume_ids:
                    db.execute("DELETE FROM volume_assets WHERE id=?", (volume_id,))
        self._best_effort_cleanup(volume_ids)

    def find_candidate_project(self, candidate_id):
        with self._db() as db:
            row = db.execute("SELECT k.project_id FROM candidates c JOIN samples s ON s.id=c.sample_id JOIN cases k ON k.id=s.case_id WHERE c.id=?", (candidate_id,)).fetchone()
            return None if row is None else row[0]
