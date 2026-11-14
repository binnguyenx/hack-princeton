"""Manual source landmarks: immutable source coordinates, separate from AI tools."""
import hashlib
import json
import math
import sqlite3
from uuid import uuid4

LANDMARK_DDL = '''CREATE TABLE IF NOT EXISTS source_landmarks (
 id TEXT PRIMARY KEY, sample_id TEXT NOT NULL, label TEXT NOT NULL,
 ijk_json TEXT NOT NULL, ras_json TEXT NOT NULL, volume_hash TEXT NOT NULL,
 FOREIGN KEY(sample_id) REFERENCES samples(id) ON DELETE CASCADE)'''

class LandmarkError(ValueError):
    def __init__(self, message, status=422):
        self.status = status
        super().__init__(message)

def vector(value):
    if not isinstance(value,list) or len(value)!=3:
        raise LandmarkError('Coordinates require three finite numbers')
    try:
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in value):
            raise LandmarkError('Coordinates require three finite numbers')
    except OverflowError as error:
        raise LandmarkError('Coordinates exceed supported range') from error
    return value

def patient_point(spatial, ijk):
    """Use direction columns, origin and one explicit LPS-to-RAS conversion."""
    ijk=vector(ijk)
    try:
        if spatial['units']!='mm': raise LandmarkError('Landmarks require verified millimetre metadata')
        sizes=spatial['sizes']
        if len(sizes)!=3 or any(type(n) is not int or n<=0 for n in sizes):raise LandmarkError('Invalid source grid')
        if any(x<0 or x>size-1 for x,size in zip(ijk,sizes)):raise LandmarkError('Landmark lies outside the source volume')
        origin=vector(spatial.get('spaceOrigin',[0,0,0]))
        spacing=vector(spatial['spacings'])
        columns=spatial.get('spaceDirections',[[spacing[0],0,0],[0,spacing[1],0],[0,0,spacing[2]]])
        if not isinstance(columns,list) or len(columns)!=3:raise LandmarkError('Invalid source directions')
        a,b,c=[vector(column) for column in columns]
        determinant=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1])
        if not math.isfinite(determinant) or abs(determinant)<1e-12:raise LandmarkError('Source affine is singular')
        basis=spatial.get('patientBasis')
        if basis is None:
            space=spatial.get('space','left-posterior-superior').lower()
            if space not in ('right-anterior-superior','left-posterior-superior','ras','lps'):raise LandmarkError('Unsupported patient coordinate basis')
            basis='RAS' if space in ('right-anterior-superior','ras') else 'LPS'
        if basis not in ('RAS','LPS'):raise LandmarkError('Unsupported patient coordinate basis')
        result=[origin[axis]+sum(column[axis]*component for column,component in zip((a,b,c),ijk)) for axis in range(3)]
        vector(result)
        return result if basis=='RAS' else [-result[0],-result[1],result[2]]
    except (KeyError,TypeError,OverflowError,AttributeError) as error:
        raise LandmarkError('Source spatial metadata is invalid') from error

def validate_record(point, samples):
    if not isinstance(point,dict) or set(point)!={'id','sampleId','sourceObjectId','volumeHash','label','ijk','ras'}:
        raise LandmarkError('Invalid landmark record')
    sample=samples.get(point['sampleId']) if isinstance(point.get('sampleId'),str) else None
    if not sample or not sample['spatiallyVerified']:raise LandmarkError('Landmark source is unavailable or unverified')
    source=sample['sourceAnatomy']
    if point['sourceObjectId']!=source['objectId'] or point['volumeHash']!=source['volumeHash']:raise LandmarkError('Landmark source identity/hash differs')
    if not isinstance(point['label'],str) or not point['label'].strip() or len(point['label'])>80:raise LandmarkError('Landmark label must contain 1–80 characters')
    expected=patient_point(source['spatial'],point['ijk'])
    if any(abs(x-y)>1e-6 for x,y in zip(vector(point['ras']),expected)):raise LandmarkError('Landmark RAS differs from the source affine')
    return point

def extension_exists(db):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_landmarks'").fetchone() is not None

def records(db, sample_ids):
    if not extension_exists(db) or not sample_ids:return []
    rows=db.execute('SELECT l.*,s.source_object_id FROM source_landmarks l JOIN samples s ON s.id=l.sample_id WHERE l.sample_id IN ('+','.join('?' for _ in sample_ids)+') ORDER BY l.id',tuple(sample_ids))
    return [{'id':r['id'],'sampleId':r['sample_id'],'sourceObjectId':r['source_object_id'],'label':r['label'],
             'ijk':json.loads(r['ijk_json']),'ras':json.loads(r['ras_json']),'volumeHash':r['volume_hash']} for r in rows]

class LandmarkService:
    def __init__(self,repository):self.repo=repository
    def _source(self,db,sample_id,body=None):
        source=db.execute('SELECT s.*,c.project_id,a.sha256,a.byte_size FROM samples s JOIN cases c ON c.id=s.case_id JOIN volume_assets a ON a.id=s.volume_id WHERE s.id=?',(sample_id,)).fetchone()
        if source is None:raise LandmarkError('Source sample not found',404)
        if body is not None:
            if any(body.get(key)!=source[column] for key,column in [('projectId','project_id'),('caseId','case_id'),('volumeHash','volume_hash')]):raise LandmarkError('Source context or volume hash changed',409)
        return source
    def list(self,sample_id):
        database=self.repo.root/'app-model.sqlite'
        if not database.is_file():raise LandmarkError('Source sample not found',404)
        db=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN');self._source(db,sample_id)
            return records(db,[sample_id])
        finally:db.close()
    def create(self,sample_id,body):
        if not isinstance(body,dict) or set(body)!={'projectId','caseId','volumeHash','ijk','label'}:raise LandmarkError('Invalid landmark request')
        label=body.get('label')
        if not isinstance(label,str) or not label.strip() or len(label)>80:raise LandmarkError('Landmark label must contain 1–80 characters')
        with self.repo._db() as db:
            with self.repo._transaction(db):
                source=self._source(db,sample_id,body)
                if not source['spatially_verified']:raise LandmarkError('Landmarks require verified source data')
                ras=patient_point(json.loads(source['spatial_json']),body['ijk'])
                digest=hashlib.sha256();size=0
                try:
                    with self.repo._volume_path(source['volume_id']).open('rb') as volume:
                        while chunk:=volume.read(1024*1024):digest.update(chunk);size+=len(chunk)
                except OSError as error:raise LandmarkError('Source volume is unavailable',409) from error
                if size!=source['byte_size'] or digest.hexdigest()!=source['volume_hash'] or source['sha256']!=source['volume_hash']:raise LandmarkError('Source volume integrity failed',409)
                db.execute(LANDMARK_DDL)
                if db.execute('SELECT COUNT(*) FROM source_landmarks WHERE sample_id=?',(sample_id,)).fetchone()[0]>=1000:raise LandmarkError('Source landmark limit reached')
                identity=str(uuid4())
                db.execute('INSERT INTO source_landmarks VALUES(?,?,?,?,?,?)',(identity,sample_id,label.strip(),json.dumps(body['ijk']),json.dumps(ras),source['volume_hash']))
                return {'id':identity,'sampleId':sample_id,'sourceObjectId':source['source_object_id'],'volumeHash':source['volume_hash'],'label':label.strip(),'ijk':body['ijk'],'ras':ras}
    def delete(self,sample_id,identity,body):
        if not isinstance(body,dict) or set(body)!={'projectId','caseId','volumeHash'}:raise LandmarkError('Invalid landmark deletion context')
        with self.repo._db() as db:
            with self.repo._transaction(db):
                self._source(db,sample_id,body)
                if not extension_exists(db) or not db.execute('SELECT id FROM source_landmarks WHERE id=? AND sample_id=?',(identity,sample_id)).fetchone():raise LandmarkError('Source landmark not found',404)
                db.execute('DELETE FROM source_landmarks WHERE id=? AND sample_id=?',(identity,sample_id))
