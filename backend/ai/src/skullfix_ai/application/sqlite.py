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
import time
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

    CREATE TABLE IF NOT EXISTS measurement_request_reservations (
      case_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      canonical_identity TEXT NOT NULL,
      state TEXT NOT NULL,
      run_id TEXT NOT NULL,
      result_id TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (case_id, request_id)
    );

    CREATE TABLE IF NOT EXISTS candidate_measurement_results (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      method_id TEXT NOT NULL,
      measure_kind TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
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
            return self._project_manifest(db, project_id)

    def search_project_samples(self, project_id, q=""):
        """Return sample rows for a project, optionally filtered by display/case name."""
        needle = (q or "").strip().lower()
        with self._db() as db:
            self._project(db, project_id)
            rows = db.execute(
                """
                SELECT s.id AS id, s.display_name AS display_name,
                       s.case_id AS case_id, c.name AS case_name
                FROM samples s
                JOIN cases c ON c.id = s.case_id
                WHERE c.project_id = ?
                ORDER BY s.id
                """,
                (project_id,),
            ).fetchall()
            results = []
            for r in rows:
                display = r["display_name"] or ""
                case_name = r["case_name"] or ""
                if needle and needle not in display.lower() and needle not in case_name.lower():
                    continue
                results.append({
                    "id": r["id"],
                    "displayName": display,
                    "caseId": r["case_id"],
                    "caseName": case_name,
                })
            return results

    def read_project_manifest(self, project_id):
        """Read one consistent snapshot without bootstrapping or writing application data."""
        database = self.root / "app-model.sqlite"
        db = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            return self._project_manifest(db, project_id)
        finally:
            db.close()

    def _project_manifest(self, db, project_id):
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
        result = {"formatVersion": 1, "user": {"id": "local-dev", "displayName": "Local Dev"},
                "project": {"id": project["id"], "ownerUserId": project["owner_user_id"], "name": project["name"]},
                "cases": cases, "samples": samples, "candidates": candidates, "revisions": revisions,
                "viewState": {"selectionObjectId": None, "camera": {"position": [0,0,500], "target": [0,0,0]}, "visibility": {}, "inspectionPlane": {"enabled": False,"axis": "z","offset": 0}},
                "openDocuments": [], "activeDocumentId": None}
        from .voxel_operations import provenance_records
        provenance = provenance_records(db)
        for revision in revisions:
            if revision['id'] in provenance:
                revision['provenance'] = provenance[revision['id']]
        from .landmarks import records
        points = records(db, [sample['id'] for sample in samples])
        if points:
            result['landmarks'] = points
        return result

    def read_package_snapshot(self, project_id):
        """One read-only metadata snapshot; missing/corrupt blobs abort the export."""
        from .packages import PackageError, MAX_EXPANDED
        database = self.root / 'app-model.sqlite'
        if not database.is_file():
            raise PackageError('project-not-found', 'Project not found.', 404)
        db = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN')
            try:
                manifest = self._project_manifest(db, project_id)
            except ValueError as error:
                raise PackageError('project-not-found', 'Project not found.', 404) from error
            identities = {s['sourceAnatomy']['volumeId'] for s in manifest['samples']} | {r['volumeId'] for r in manifest['revisions']}
            volumes = {}
            size = 0
            for identity in identities:
                asset = db.execute('SELECT * FROM volume_assets WHERE id=?', (identity,)).fetchone()
                try:
                    path = self._volume_path(identity)
                    size += path.stat().st_size
                    if size > MAX_EXPANDED:
                        raise PackageError('package-too-large', 'Project volumes exceed package limits.', 413)
                    with path.open('rb') as source:
                        data = source.read(MAX_EXPANDED - sum(map(len, volumes.values())) + 1)
                    if sum(map(len, volumes.values())) + len(data) > MAX_EXPANDED:
                        raise PackageError('package-too-large', 'Project volumes exceed package limits.', 413)
                except (OSError, ValueError) as error:
                    if isinstance(error, PackageError):
                        raise
                    raise PackageError('package-source-unavailable', 'Project volume is unavailable.', 409) from error
                if asset is None or len(data) != asset['byte_size'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
                    raise PackageError('package-source-unavailable', 'Project volume integrity check failed.', 409)
                volumes[identity] = data
            return manifest, volumes
        finally:
            db.close()

    def import_package_copy(self, manifest, volumes):
        """Publish a validated new copy; never overwrite original ids or files."""
        import os
        import shutil
        import tempfile
        from copy import deepcopy
        project_id = str(uuid4())
        maps = {key: {item[field]: str(uuid4()) for item in manifest[key]} for key, field in
                (('cases', 'id'), ('samples', 'id'), ('candidates', 'objectId'), ('revisions', 'id'))}
        source_ids = {s['sourceAnatomy']['objectId']: str(uuid4()) for s in manifest['samples']}
        volume_ids = {identity: str(uuid4()) for identity in volumes}
        objects = {**source_ids, **maps['candidates']}
        documents = {**maps['samples'], **maps['candidates']}
        presentation = deepcopy({key: manifest[key] for key in ('viewState', 'openDocuments', 'activeDocumentId')})
        presentation['viewState']['selectionObjectId'] = objects.get(presentation['viewState']['selectionObjectId'])
        presentation['viewState']['visibility'] = {objects[key]: value for key, value in presentation['viewState']['visibility'].items()}
        for doc in presentation['openDocuments']:
            doc['id'] = documents[doc['id']]
        presentation['activeDocumentId'] = documents.get(presentation['activeDocumentId'])
        published, committed = [], False
        with self._db() as db:
            stage = Path(tempfile.mkdtemp(prefix='.package-import-', dir=self.root))
            try:
                for identity, data in volumes.items():
                    (stage / (volume_ids[identity] + '.nrrd')).write_bytes(data)
                self._fault('package_after_stage')
                with self._transaction(db):
                    db.execute('INSERT INTO projects VALUES(?,?,?,?,?)',
                               (project_id, 'local-dev', manifest['project']['name'] + ' (imported)', _now(), len(manifest['cases'])))
                    for case in manifest['cases']:
                        db.execute('INSERT INTO cases VALUES(?,?,?)', (maps['cases'][case['id']], project_id, case['name']))
                    for identity, data in volumes.items():
                        vid = volume_ids[identity]
                        db.execute('INSERT INTO volume_assets VALUES(?,?,?,?)',
                                   (vid, 'volumes/' + vid + '.nrrd', hashlib.sha256(data).hexdigest(), len(data)))
                    for sample in manifest['samples']:
                        source = sample['sourceAnatomy']
                        db.execute('INSERT INTO samples VALUES(?,?,?,?,?,?,?,?,?)',
                            (maps['samples'][sample['id']], maps['cases'][sample['caseId']], sample.get('displayName'),
                             sample['license'], int(sample['spatiallyVerified']), source_ids[source['objectId']],
                             volume_ids[source['volumeId']], _json(source['spatial']), source['volumeHash']))
                    for candidate in manifest['candidates']:
                        db.execute('INSERT INTO candidates VALUES(?,?,?,?)',
                            (maps['candidates'][candidate['objectId']], maps['samples'][candidate['sampleId']],
                             candidate.get('displayName'), maps['revisions'][candidate['currentRevisionId']]))
                    for revision in manifest['revisions']:
                        db.execute('INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)',
                            (maps['revisions'][revision['id']], maps['candidates'][revision['candidateId']], revision['order'],
                             volume_ids[revision['volumeId']], _json(revision['pose']), revision['volumeHash']))
                    provenance_revisions = [r for r in manifest['revisions'] if r.get('provenance')]
                    if provenance_revisions:
                        from .voxel_operations import PROVENANCE_DDL
                        db.execute(PROVENANCE_DDL)
                        for revision in provenance_revisions:
                            provenance = deepcopy(revision['provenance'])
                            provenance['inputRevisionId'] = maps['revisions'][provenance['inputRevisionId']]
                            db.execute('INSERT INTO revision_operations VALUES(?,?)', (maps['revisions'][revision['id']], _json(provenance)))
                    points = manifest.get('landmarks', [])
                    if points:
                        from .landmarks import LANDMARK_DDL
                        db.execute(LANDMARK_DDL)
                        for point in points:
                            db.execute('INSERT INTO source_landmarks VALUES(?,?,?,?,?,?)',
                                (str(uuid4()), maps['samples'][point['sampleId']], point['label'], _json(point['ijk']),
                                 _json(point['ras']), point['volumeHash']))
                    for identity in volumes:
                        target = self._volume_path(volume_ids[identity])
                        # Link a complete staged blob exclusively; an existing path is never overwritten.
                        os.link(stage / (volume_ids[identity] + '.nrrd'), target)
                        published.append(target)
                        self._fault('package_after_publish')
                committed = True
            finally:
                if not committed:
                    for target in published:
                        try:
                            target.unlink(missing_ok=True)
                        except OSError:
                            pass  # Non-authoritative file; never claim a committed partial project.
                shutil.rmtree(stage, ignore_errors=True)
        return {'projectId': project_id, 'presentation': presentation}

    def read_revision_volume(self, candidate_id, revision_id):
        """Read immutable revision content with candidate membership and hash checks."""
        from .packages import PackageError, MAX_EXPANDED
        database = self.root / 'app-model.sqlite'
        if not database.is_file():
            raise PackageError('revision-not-found', 'Candidate revision not found.', 404)
        db = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
        db.row_factory = sqlite3.Row
        try:
            row = db.execute('SELECT a.*,r.volume_hash AS revision_hash FROM candidate_revisions r JOIN candidates c ON c.id=r.candidate_id '
                             'JOIN volume_assets a ON a.id=r.volume_id WHERE c.id=? AND r.id=?', (candidate_id, revision_id)).fetchone()
            if row is None:
                raise PackageError('revision-not-found', 'Candidate revision not found.', 404)
            try:
                path = self._volume_path(row['id'])
                if path.stat().st_size > MAX_EXPANDED:
                    raise PackageError('package-too-large', 'Revision volume exceeds supported limits.', 413)
                with path.open('rb') as source:
                    data = source.read(MAX_EXPANDED + 1)
                if len(data) > MAX_EXPANDED:
                    raise PackageError('package-too-large', 'Revision volume exceeds supported limits.', 413)
            except OSError as error:
                raise PackageError('revision-volume-unavailable', 'Revision volume is unavailable.', 409) from error
            if len(data) != row['byte_size'] or hashlib.sha256(data).hexdigest() != row['sha256'] or row['revision_hash'] != row['sha256']:
                raise PackageError('revision-volume-unavailable', 'Revision volume integrity failed.', 409)
            return data
        finally:
            db.close()

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

    def commit_placement(self, candidate_id, project_id, case_id, expected_revision_id, pose):
        """Atomic manual commit; source volume and all prior revisions remain unchanged."""
        from .placement import PlacementError, is_rigid_pose
        if not is_rigid_pose(pose):
            raise PlacementError('invalid-pose', 'A finite rigid matrix is required.', 422)
        with self._db() as db:
            with self._transaction(db):
                current = db.execute("SELECT c.current_revision_id,s.case_id,s.spatially_verified,s.spatial_json,k.project_id "
                                     "FROM candidates c JOIN samples s ON s.id=c.sample_id JOIN cases k ON k.id=s.case_id "
                                     "WHERE c.id=?", (candidate_id,)).fetchone()
                if current is None:
                    raise PlacementError('candidate-not-found', 'Candidate not found.', 404)
                if current['case_id'] != case_id or current['project_id'] != project_id:
                    raise PlacementError('cross-case-reference', 'Candidate does not belong to the requested project/case.')
                if current['current_revision_id'] != expected_revision_id:
                    raise PlacementError('stale-revision', 'Candidate revision changed; reload before placement.')
                metadata = json.loads(current['spatial_json'])
                if not current['spatially_verified'] or not isinstance(metadata, dict) or metadata.get('units') != 'mm':
                    raise PlacementError('placement-unavailable', 'Placement requires verified millimetre spatial metadata.', 422)
                previous = db.execute("SELECT * FROM candidate_revisions WHERE id=? AND candidate_id=?", (expected_revision_id, candidate_id)).fetchone()
                if previous is None or not is_rigid_pose(json.loads(previous['pose_json'])):
                    raise PlacementError('placement-unavailable', 'Current revision has no valid rigid pose.', 422)
                if all(abs(a - b) <= 1e-9 for a, b in zip(json.loads(previous['pose_json']), pose)):
                    raise PlacementError('unchanged-pose', 'Placement does not change the candidate.', 422)
                order = db.execute("SELECT COALESCE(MAX(ord),-1)+1 FROM candidate_revisions WHERE candidate_id=?", (candidate_id,)).fetchone()[0]
                rid = str(uuid4())
                db.execute("INSERT INTO candidate_revisions VALUES(?,?,?,?,?,?)", (rid, candidate_id, order, previous['volume_id'], _json(list(pose)), previous['volume_hash']))
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

    def claim_measurement_reservation(self, *, case_id, request_id, canonical_identity):
        """Short BEGIN IMMEDIATE claim/check for live measurement idempotency."""
        with self._db() as db:
            with self._transaction(db):
                row = db.execute(
                    "SELECT * FROM measurement_request_reservations WHERE case_id=? AND request_id=?",
                    (case_id, request_id),
                ).fetchone()
                if row is None:
                    run_id = str(uuid4())
                    db.execute(
                        "INSERT INTO measurement_request_reservations "
                        "(case_id, request_id, canonical_identity, state, run_id, result_id, result_json, created_at) "
                        "VALUES (?,?,?,?,?,?,?,?)",
                        (case_id, request_id, canonical_identity, "in_progress", run_id, None, None, _now()),
                    )
                    return {"action": "execute", "run_id": run_id}
                if row["canonical_identity"] != canonical_identity:
                    return {"action": "conflict"}
                if row["state"] == "completed" and row["result_json"]:
                    return {"action": "replay", "result": json.loads(row["result_json"])}
                if row["state"] == "incomplete":
                    return {"action": "reconciliation"}
                return {"action": "in_progress", "run_id": row["run_id"]}

    def wait_for_measurement_result(self, case_id, request_id, *, timeout_ms=2000, poll_ms=50):
        deadline = time.monotonic() + (timeout_ms / 1000.0)
        while True:
            with self._db() as db:
                row = db.execute(
                    "SELECT state, result_json FROM measurement_request_reservations WHERE case_id=? AND request_id=?",
                    (case_id, request_id),
                ).fetchone()
            if row is not None and row["state"] == "completed" and row["result_json"]:
                return json.loads(row["result_json"])
            if time.monotonic() >= deadline:
                return None
            time.sleep(max(poll_ms, 1) / 1000.0)

    def load_measurement_volume(self, *, project_id, case_id, candidate_id, expected_revision_id):
        """Load revision bytes and verified spatial context for measurement (no package integrity mapping)."""
        from .foreground_volume import MeasurementError, MeasurementOutcome

        with self._db() as db:
            row = db.execute(
                "SELECT c.current_revision_id, c.sample_id, s.case_id, s.spatially_verified, s.spatial_json, "
                "s.volume_hash AS sample_hash, k.project_id, r.volume_id, r.volume_hash, a.sha256, a.byte_size "
                "FROM candidates c "
                "JOIN samples s ON s.id=c.sample_id "
                "JOIN cases k ON k.id=s.case_id "
                "JOIN candidate_revisions r ON r.id=? AND r.candidate_id=c.id "
                "JOIN volume_assets a ON a.id=r.volume_id "
                "WHERE c.id=?",
                (expected_revision_id, candidate_id),
            ).fetchone()
            if row is None:
                raise MeasurementError("candidate-not-found", "Candidate revision not found.", 404)
            if row["project_id"] != project_id or row["case_id"] != case_id:
                raise MeasurementError("cross-case-reference", "Candidate does not belong to the requested project/case.")
            if row["current_revision_id"] != expected_revision_id:
                raise MeasurementOutcome(
                    409,
                    {
                        "run_id": None,
                        "request_id": None,
                        "case_id": case_id,
                        "operation_id": "measure.candidate",
                        "status": "stale",
                        "input_revisions": {"expected_revision_id": expected_revision_id},
                        "output_candidate_id": None,
                        "output_revision_id": None,
                        "artifacts": [],
                        "output": None,
                        "source": None,
                        "limitations": [],
                        "error": {
                            "code": "stale-revision",
                            "message": "Candidate revision changed; reload before measurement.",
                            "details": {},
                        },
                    },
                )
            spatial = json.loads(row["spatial_json"])
            if not row["spatially_verified"] or not isinstance(spatial, dict) or spatial.get("units") != "mm":
                raise MeasurementOutcome(
                    422,
                    {
                        "run_id": None,
                        "request_id": None,
                        "case_id": case_id,
                        "operation_id": "measure.candidate",
                        "status": "unsupported",
                        "input_revisions": {"expected_revision_id": expected_revision_id},
                        "output_candidate_id": None,
                        "output_revision_id": None,
                        "artifacts": [],
                        "output": None,
                        "source": None,
                        "limitations": [],
                        "error": {
                            "code": "operation-unsupported",
                            "message": "Foreground-volume requires verified millimetre spatial metadata.",
                            "details": {"reason": "spatial"},
                        },
                    },
                )
            path = self._volume_path(row["volume_id"])
            try:
                data = path.read_bytes()
            except OSError as error:
                raise MeasurementError("volume-unavailable", "Revision volume is unavailable.", 500) from error
            return {
                "bytes": data,
                "volume_hash": row["volume_hash"],
                "asset_hash": row["sha256"],
                "spatial": spatial,
                "current_revision_id": row["current_revision_id"],
            }

    def complete_measurement_reservation(
        self,
        *,
        case_id,
        request_id,
        candidate_id,
        expected_revision_id,
        result_id,
        run_id,
        result,
        persist_success_row=True,
    ):
        hook = self.faults.get("measurement_before_complete")
        if callable(hook):
            hook()
        with self._db() as db:
            with self._transaction(db):
                current = db.execute(
                    "SELECT current_revision_id FROM candidates WHERE id=?",
                    (candidate_id,),
                ).fetchone()
                if current is None or current["current_revision_id"] != expected_revision_id:
                    stale = {
                        "run_id": run_id,
                        "request_id": request_id,
                        "case_id": case_id,
                        "operation_id": "measure.candidate",
                        "status": "stale",
                        "input_revisions": {"expected_revision_id": expected_revision_id},
                        "output_candidate_id": None,
                        "output_revision_id": None,
                        "artifacts": [],
                        "output": None,
                        "source": "real-operation",
                        "limitations": [],
                        "error": {
                            "code": "stale-revision",
                            "message": "Candidate revision changed before measurement persistence.",
                            "details": {},
                        },
                    }
                    db.execute(
                        "UPDATE measurement_request_reservations "
                        "SET state='completed', result_id=NULL, result_json=? "
                        "WHERE case_id=? AND request_id=?",
                        (_json(stale), case_id, request_id),
                    )
                    return {"action": "stale", "result": stale}
                payload = _json(result)
                if persist_success_row:
                    db.execute(
                        "INSERT INTO candidate_measurement_results "
                        "(id, case_id, candidate_id, revision_id, request_id, run_id, method_id, measure_kind, result_json, created_at) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (
                            result_id,
                            case_id,
                            candidate_id,
                            expected_revision_id,
                            request_id,
                            run_id,
                            "candidate.foreground-volume.label-voxel.v1",
                            "foreground-volume",
                            payload,
                            _now(),
                        ),
                    )
                db.execute(
                    "UPDATE measurement_request_reservations "
                    "SET state='completed', result_id=?, result_json=? "
                    "WHERE case_id=? AND request_id=?",
                    (result_id if persist_success_row else None, payload, case_id, request_id),
                )
                return {"action": "completed", "result": result}

    def mark_measurement_reservation_incomplete(self, case_id, request_id):
        with self._db() as db:
            with self._transaction(db):
                db.execute(
                    "UPDATE measurement_request_reservations "
                    "SET state='incomplete', result_id=NULL, result_json=NULL "
                    "WHERE case_id=? AND request_id=?",
                    (case_id, request_id),
                )

    def finish_measurement_reservation(self, *, case_id, request_id, result):
        """Persist a terminal non-success envelope without a measurement success row."""
        with self._db() as db:
            with self._transaction(db):
                db.execute(
                    "UPDATE measurement_request_reservations "
                    "SET state='completed', result_id=NULL, result_json=? "
                    "WHERE case_id=? AND request_id=?",
                    (_json(result), case_id, request_id),
                )

    def list_measurement_results(self, candidate_id, revision_id):
        with self._db() as db:
            rows = db.execute(
                "SELECT result_json FROM candidate_measurement_results "
                "WHERE candidate_id=? AND revision_id=? ORDER BY created_at, id",
                (candidate_id, revision_id),
            ).fetchall()
            return [json.loads(row["result_json"]) for row in rows]
