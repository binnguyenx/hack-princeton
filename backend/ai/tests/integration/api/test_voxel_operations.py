"""Literal binary grids verify actual geometry rather than a mock result."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from fastapi.testclient import TestClient
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository,IDENTITY_POSE

META={'units':'mm','space':'left-posterior-superior','sizes':[4,2,1],'spacings':[1,1,1],'bboxMm':[4,2,1]}
HEADER=b'NRRD0005\ntype: unsigned char\ndimension: 3\nsizes: 4 2 1\nencoding: raw\n\n'
VOXELS=bytes([1,0,0,0,0,1,0,0])

class VoxelTest(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name)/'application';self.repo=ApplicationRepository(self.root)
        project=self.repo.create_project('Volume');case=self.repo.add_case(project['id'],'Case')
        self.project_id=project['id'];self.case_id=case['id']
        self.source=self.repo.add_sample(project['id'],case['id'],'Source',True,META,HEADER+VOXELS)
        self.candidate=self.repo.create_candidate(self.source['id'])
        self.app=create_app(self.root,repository=self.repo)
        self.client=TestClient(self.app);self.addCleanup(self.client.close)
        self.url='/api/candidates/'+self.candidate['candidateId']+'/voxel-operation'
        self.command={'project_id':project['id'],'case_id':case['id'],'expected_revision_id':self.candidate['revisionId'],
                      'operation':'voxel.box','bounds':[[1,0,0],[1,0,0]],'mode':'fill'}
    def files(self):return {str(p.relative_to(self.root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.root/'volumes').iterdir() if p.is_file()}
    def test_box_changes_only_requested_candidate_voxels_with_new_immutable_revision(self):
        before=self.repo.get_project_manifest(self.project_id)
        response=self.client.post(self.url,json=self.command);self.assertEqual(response.status_code,201,response.text)
        result=response.json();self.assertEqual(result['changedVoxels'],1)
        actual=self.repo.read_revision_volume(self.candidate['candidateId'],result['revisionId'])
        self.assertEqual(actual,HEADER+bytes([1,1,0,0,0,1,0,0]))
        after=self.repo.get_project_manifest(self.project_id)
        self.assertEqual(after['samples'],before['samples']);self.assertEqual(after['revisions'][0],before['revisions'][0])
        self.assertNotEqual(after['revisions'][1]['volumeId'],before['revisions'][0]['volumeId'])
        self.assertEqual(after['revisions'][1]['volumeHash'],hashlib.sha256(actual).hexdigest())
        self.assertEqual(after['revisions'][1]['provenance']['operation'],'voxel.box')
        self.repo.restore_revision(self.candidate['candidateId'],self.candidate['revisionId'])
        self.assertEqual(self.repo.read_revision_volume(self.candidate['candidateId'],self.candidate['revisionId']),HEADER+VOXELS)
    def test_mirror_completes_real_missing_voxels_only_in_one_sided_explicit_roi(self):
        command={k:v for k,v in self.command.items() if k!='mode'}
        command.update(operation='reconstruct.mirror-roi',plane_i=1.5,bounds=[[2,0,0],[3,1,0]])
        response=self.client.post(self.url,json=command);self.assertEqual(response.status_code,201,response.text)
        result=response.json();self.assertEqual(result['changedVoxels'],2)
        self.assertEqual(self.repo.read_revision_volume(self.candidate['candidateId'],result['revisionId']),HEADER+bytes([1,0,0,1,0,1,1,0]))
        self.assertEqual(self.repo.read_volume(self.project_id,self.source['sourceAnatomy']['volumeId']),HEADER+VOXELS)
        copied=ApplicationRepository(self.root).get_project_manifest(self.project_id)
        self.assertEqual(copied['candidates'][0]['currentRevisionId'],result['revisionId'])
    def test_stale_cross_case_bounds_no_change_pose_and_type_fail_without_new_files(self):
        before=self.files()
        invalid=[({'expected_revision_id':'stale'},409),({'case_id':'other'},409),({'bounds':[[-1,0,0],[1,0,0]]},422),
                 ({'bounds':[[1,0,0],[1,0,0]],'mode':'erase'},422),({'operation':'unknown'},422),({'bounds':[[True,0,0],[1,0,0]]},422)]
        for change,status in invalid:
            response=self.client.post(self.url,json={**self.command,**change});self.assertEqual(response.status_code,status,response.text)
            self.assertEqual(self.files(),before)
        mirror={k:v for k,v in self.command.items() if k!='mode'}
        mirror.update(operation='reconstruct.mirror-roi',plane_i=1.5,bounds=[[0,0,0],[3,1,0]])
        self.assertEqual(self.client.post(self.url,json=mirror).status_code,422)
        pose=list(IDENTITY_POSE);pose[3]=1
        rid=self.repo.commit_transform(self.candidate['candidateId'],pose)
        self.assertEqual(self.client.post(self.url,json={**self.command,'expected_revision_id':rid}).status_code,422)
        self.assertEqual(self.files(),before)
    def test_adapter_failure_and_stage_publish_commit_faults_preserve_prior_graph_and_files(self):
        before=self.repo.get_project_manifest(self.project_id);files=self.files()
        class Failing:
            def execute(self,*args,**kwargs):raise RuntimeError('controlled adapter failure')
        original=self.app.state.voxel_adapter;self.app.state.voxel_adapter=Failing()
        self.assertEqual(self.client.post(self.url,json=self.command).status_code,500)
        self.app.state.voxel_adapter=original
        for fault in ('voxel_after_stage','voxel_after_publish','before_commit'):
            self.repo.faults[fault]=True
            self.assertEqual(self.client.post(self.url,json=self.command).status_code,500)
            self.assertEqual(self.repo.get_project_manifest(self.project_id),before);self.assertEqual(self.files(),files)
            self.assertFalse(list(self.root.glob('.voxel-*')));self.repo.faults.clear()
        success=self.client.post(self.url,json=self.command);self.assertEqual(success.status_code,201)
        self.assertEqual(self.client.post(self.url,json=self.command).status_code,409)
    def test_provenance_and_changed_volumes_survive_package_copy(self):
        response=self.client.post(self.url,json=self.command);self.assertEqual(response.status_code,201,response.text)
        exported=self.client.post('/api/projects/'+self.project_id+'/package',json={})
        self.assertEqual(exported.status_code,200,exported.text)
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:self.assertEqual(json.loads(archive.read('package.json'))['version'],2)
        imported=self.client.post('/api/packages/import',content=exported.content,headers={'content-type':'application/zip'})
        self.assertEqual(imported.status_code,201,imported.text)
        copy=self.repo.get_project_manifest(imported.json()['projectId'])
        provenance=copy['revisions'][1]['provenance']
        self.assertEqual(provenance['inputRevisionId'],copy['revisions'][0]['id'])
        self.assertEqual(provenance['operation'],'voxel.box');self.assertEqual(provenance['changedVoxels'],1)
        self.assertEqual(self.repo.read_revision_volume(copy['candidates'][0]['objectId'],copy['revisions'][1]['id']),HEADER+bytes([1,1,0,0,0,1,0,0]))

if __name__=='__main__':unittest.main()
