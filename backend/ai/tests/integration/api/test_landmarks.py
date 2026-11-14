"""Manual source annotation lifecycle on disposable application data."""
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

META = {'units':'mm','space':'left-posterior-superior','sizes':[5,6,2], 'spacings':[1,1,2], 'bboxMm':[5,6,4], 'spaceOrigin':[10,20,30]}

class LandmarkTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)/'app'
        self.repo = ApplicationRepository(self.root)
        self.project = self.repo.create_project('Points')
        self.case = self.repo.add_case(self.project['id'], 'Case')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Source', True, META, b'protected source')
        self.client = TestClient(create_app(self.root, repository=self.repo)); self.addCleanup(self.client.close)
        self.url = '/api/samples/'+self.sample['id']+'/landmarks'
        self.body = {'projectId':self.project['id'],'caseId':self.case['id'],'volumeHash':self.sample['sourceAnatomy']['volumeHash'],'ijk':[0,0,0],'label':'A'}
    def create(self, **changes):
        return self.client.post(self.url,json={**self.body,**changes})
    def test_points_persist_with_derived_patient_coordinates_and_no_geometry_revision_write(self):
        before = self.repo.get_project_manifest(self.project['id'])
        first = self.create(); self.assertEqual(first.status_code,201,first.text)
        a = first.json()['landmark']; self.assertEqual(a['ras'],[-10,-20,30])
        b = self.create(ijk=[3,4,0],label='B').json()['landmark']
        self.assertEqual(b['ras'],[-13,-24,30])
        saved = ApplicationRepository(self.root).read_project_manifest(self.project['id'])
        self.assertEqual(len(saved['landmarks']),2)
        self.assertEqual(saved['revisions'],before['revisions'])
        self.assertEqual(saved['samples'],before['samples'])
        self.assertEqual(self.repo.read_volume(self.project['id'],self.sample['sourceAnatomy']['volumeId']),b'protected source')
        self.assertEqual(len(self.client.get(self.url).json()['landmarks']),2)
    def test_invalid_context_hash_coordinates_and_metadata_fail_without_annotation_writes(self):
        for change,status in [({'projectId':'other'},409),({'caseId':'other'},409),({'volumeHash':'0'*64},409),({'ijk':[5,0,0]},422),({'ijk':[True,0,0]},422),({'ijk':['0',0,0]},422),({'ijk':[0,0]},422),({'label':' '},422)]:
            response=self.create(**change);self.assertEqual(response.status_code,status,response.text)
        self.assertNotIn('landmarks',self.repo.read_project_manifest(self.project['id']))
        self.assertEqual(self.client.post('/api/samples/missing/landmarks',json=self.body).status_code,404)
        for meta,verified in [({**META,'units':'cm'},True),({**META,'spaceDirections':[[1,0,0],[2,0,0],[0,0,1]]},True),(META,False)]:
            source=self.repo.add_sample(self.project['id'],self.case['id'],'Invalid',verified,meta,b'source')
            body={**self.body,'volumeHash':source['sourceAnatomy']['volumeHash']}
            self.assertEqual(self.client.post('/api/samples/'+source['id']+'/landmarks',json=body).status_code,422)
    def test_delete_requires_sample_membership_and_faults_roll_back(self):
        first=self.create();self.assertEqual(first.status_code,201,first.text)
        identity=first.json()['landmark']['id']
        self.assertEqual(self.client.request('DELETE','/api/samples/other/landmarks/'+identity,json={key:self.body[key] for key in ('projectId','caseId','volumeHash')}).status_code,404)
        self.repo.faults['before_commit']=True
        self.assertEqual(self.create(label='fault').status_code,500)
        self.assertEqual(len(self.client.get(self.url).json()['landmarks']),1)
        self.assertEqual(self.client.request('DELETE',self.url+'/'+identity,json={key:self.body[key] for key in ('projectId','caseId','volumeHash')}).status_code,500)
        self.assertEqual(len(self.client.get(self.url).json()['landmarks']),1)
        self.repo.faults.clear()
        self.assertEqual(self.client.request('DELETE',self.url+'/'+identity,json={key:self.body[key] for key in ('projectId','caseId','volumeHash')}).status_code,204)
        self.assertEqual(self.client.get(self.url).json()['landmarks'],[])
    def test_annotations_round_trip_as_version_two_with_identity_hash_and_backup_integrity(self):
        self.assertEqual(self.create().status_code,201)
        exported=self.client.post('/api/projects/'+self.project['id']+'/package',json={});self.assertEqual(exported.status_code,200,exported.text)
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            self.assertEqual(json.loads(archive.read('package.json'))['version'],2)
        response=self.client.post('/api/packages/import',content=exported.content,headers={'content-type':'application/zip'})
        self.assertEqual(response.status_code,201,response.text)
        copied=self.repo.get_project_manifest(response.json()['projectId'])
        original=self.repo.get_project_manifest(self.project['id'])
        point=copied['landmarks'][0]
        self.assertNotEqual(point['id'],original['landmarks'][0]['id'])
        self.assertEqual(point['sampleId'],copied['samples'][0]['id'])
        self.assertEqual(point['sourceObjectId'],copied['samples'][0]['sourceAnatomy']['objectId'])
        self.assertEqual(point['ras'],[-10,-20,30]);self.assertEqual(point['volumeHash'],self.body['volumeHash'])
        sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'scripts'))
        from application_snapshot import snapshot,inspect
        saved=snapshot(self.root,self.root.parent/'backup')
        self.assertEqual(len(saved['tables']['source_landmarks']),2)
        self.assertEqual(saved,inspect(self.root.parent/'backup'))
        self.assertEqual(self.repo.read_project_manifest(self.project['id']),original)
    def test_oblique_affine_points_use_direction_columns_and_preserve_patient_basis(self):
        meta={**META,'patientBasis':'RAS','spaceDirections':[[0,2,0],[3,0,0],[0,0,4]]}
        source=self.repo.add_sample(self.project['id'],self.case['id'],'Oblique',True,meta,b'raw')
        response=self.client.post('/api/samples/'+source['id']+'/landmarks',json={**self.body,'volumeHash':source['sourceAnatomy']['volumeHash'],'ijk':[1,2,1]})
        self.assertEqual(response.status_code,201,response.text)
        self.assertEqual(response.json()['landmark']['ras'],[16,22,34])

if __name__=='__main__':unittest.main()
