"""Capability preflight gate and staged-proposal human write-gate (scripted model, no network)."""
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool

from skullfix_ai.agent.gemini_graph import GeminiChatAgent
from skullfix_ai.agent.preflight import run_preflight
from skullfix_ai.agent.staging import ProposalStore, StagingError
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.agent.context import RepositoryManifestReader
from skullfix_ai.schemas.workspace import AppProjectManifest


class ScriptedChatModel(BaseChatModel):
    responses: list[Any] = []
    seen: list[Any] = []
    bound: list[str] = []

    @property
    def _llm_type(self):
        return 'scripted'

    def bind_tools(self, tools, **kwargs):
        self.bound[:] = [item.name for item in tools]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def call(name, call_id='c1', **args):
    return AIMessage('', tool_calls=[{'name': name, 'args': args, 'id': call_id, 'type': 'tool_call'}])


def shift_pose_factory(sink, context):
    """Test-only proposal producer: stages a translation; it cannot write or accept."""
    @tool
    def suggest_pose_shift(dx_mm: float) -> str:
        """Stage a candidate translation along x for human review."""
        pose = [1.0, 0, 0, dx_mm, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
        proposal = sink.stage(kind='rigid_pose', summary=f'Shift the candidate {dx_mm} mm along x', payload={'pose': pose})
        return json.dumps({'status': 'STAGED', 'proposal_id': proposal.proposal_id})
    return suggest_pose_shift


class HarnessGateBase(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.repo = ApplicationRepository(Path(temporary.name))
        self.project = self.repo.create_project('Gates')
        self.case = self.repo.add_case(self.project['id'], 'Case')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Skull', True,
            {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [0.5, 0.5, 2.0], 'bboxMm': [1, 1.5, 8]}, b'\x00' * 24)
        self.candidate = self.repo.create_candidate(self.sample['id'])
        self.model = ScriptedChatModel(responses=[], seen=[], bound=[])

    def client(self, **agent_options):
        agent = GeminiChatAgent(lambda: self.model, **agent_options)
        client = TestClient(create_app(self.repo.root, chat_agent=agent)); self.addCleanup(client.close)
        return client

    def payload(self, **changes):
        return {'request_id': 'r1', 'conversation_id': 'conv', 'project_id': self.project['id'], 'case_id': self.case['id'],
                'object_id': self.sample['sourceAnatomy']['objectId'], 'expected_revision_id': None,
                'message': 'hello', **changes}

    def candidate_payload(self, **changes):
        return self.payload(object_id=self.candidate['candidateId'], expected_revision_id=self.current_revision(), **changes)

    def current_revision(self):
        manifest = self.repo.read_project_manifest(self.project['id'])
        return next(c['currentRevisionId'] for c in manifest['candidates'] if c['objectId'] == self.candidate['candidateId'])

    def tool_results(self, index=1):
        return [json.loads(m.content) for m in self.model.seen[index] if isinstance(m, ToolMessage)]


class PreflightTest(HarnessGateBase):
    def context(self, object_id, revision=None):
        reader = RepositoryManifestReader(self.repo)
        context = AppWorkspaceAdapter(reader).load_context(self.project['id'], object_id, case_id=self.case['id'],
                                                           expected_revision_id=revision)
        return context, AppProjectManifest.model_validate(self.repo.read_project_manifest(self.project['id']))

    def test_verified_source_capabilities(self):
        capabilities = run_preflight(self.repo, *self.context(self.sample['sourceAnatomy']['objectId']))
        self.assertTrue(capabilities.has_source_mesh)
        self.assertFalse(capabilities.has_candidate_mesh)
        self.assertTrue(capabilities.has_valid_spacing_mm)
        self.assertFalse(capabilities.has_anatomical_landmarks)
        self.assertEqual(capabilities.spacing_mm, [0.5, 0.5, 2.0])
        self.assertIn('voxel_volume', capabilities.executable_checks)
        self.assertIn('rim_thickness', capabilities.executable_checks)
        self.assertTrue(capabilities.has_bone_thickness_map)
        self.assertIn('sinus clearance', capabilities.blocked_reason('fixation_safety'))
        self.assertNotIn('cortical bone thickness map', capabilities.blocked_reason('fixation_safety'))
        self.assertEqual(capabilities.blocked_reason('implant_fit'), 'No implant candidate is selected')
        self.assertIn('Workspace capabilities for this selection', capabilities.prompt_block())

    def test_candidate_and_unverified_spacing(self):
        capabilities = run_preflight(self.repo, *self.context(self.candidate['candidateId'], self.current_revision()))
        self.assertEqual(capabilities.selection_kind, 'candidate')
        self.assertTrue(capabilities.has_candidate_mesh)
        unverified = self.repo.add_sample(self.project['id'], self.case['id'], 'Unverified', False,
            {'units': 'mm', 'sizes': [2, 2, 2], 'spacings': [1, 1, 1], 'bboxMm': [2, 2, 2]}, b'\x00' * 8)
        blocked = run_preflight(self.repo, *self.context(unverified['sourceAnatomy']['objectId']))
        self.assertFalse(blocked.has_valid_spacing_mm)
        self.assertIsNone(blocked.spacing_mm)
        self.assertNotIn('voxel_volume', blocked.executable_checks)
        self.assertIn('verified voxel spacing', blocked.blocked_reason('fixation_safety'))

    def test_manifest_reaches_system_prompt_and_gates_tools(self):
        client = self.client()
        self.model.responses += [AIMessage('', tool_calls=[
            {'name': 'calculate_voxel_volume', 'args': {'voxel_count': 1000}, 'id': 'v', 'type': 'tool_call'},
            {'name': 'evaluate_fixation_safety', 'args': {}, 'id': 'f', 'type': 'tool_call'}]), AIMessage('Done.')]
        body = client.post('/api/ai/chat', json=self.payload(message='Volume of 1000 voxels? Is fixation safe?')).json()
        system = self.model.seen[0][0]
        self.assertIsInstance(system, SystemMessage)
        self.assertIn('Verified millimetre voxel spacing: yes (0.5 × 0.5 × 2 mm)', system.content)
        volume, fixation = self.tool_results()
        self.assertEqual((volume['status'], volume['volume_mm3']), ('OK', 500.0))
        self.assertIn('workspace', volume['spacing_source'])
        self.assertEqual(fixation['status'], 'INDETERMINATE')
        self.assertEqual(fixation['gate'], 'capability-preflight')
        self.assertIn('sinus clearance', fixation['reason'])
        self.assertIn('preflight', body['outcome']['steps'])
        self.assertTrue(body['outcome']['capabilities']['has_bone_thickness_map'])
        self.assertIsNone(body['staged_proposal'])


class StagedProposalTest(HarnessGateBase):
    def stage(self, client, dx=5.0):
        self.model.responses += [call('suggest_pose_shift', dx_mm=dx), AIMessage('I staged a shift for your review.')]
        return client.post('/api/ai/chat', json=self.candidate_payload(message='Shift it 5 mm')).json()

    def confirmation(self, proposal, **changes):
        return {'project_id': proposal['project_id'], 'case_id': proposal['case_id'],
                'candidate_id': proposal['candidate_id'], 'base_revision_id': proposal['base_revision_id'], **changes}

    def test_default_agent_binds_no_proposal_tools(self):
        self.model.responses.append(AIMessage('Hi.'))
        self.client().post('/api/ai/chat', json=self.payload())
        self.assertEqual(len(self.model.bound), 10)  # 7 read-only + 3 read-only geometry measurements
        self.assertFalse(any('suggest' in name or 'stage' in name for name in self.model.bound))

    def test_staging_writes_nothing_and_accept_requires_human_confirmation(self):
        client = self.client(proposal_tool_factories=[shift_pose_factory])
        before = self.repo.read_project_manifest(self.project['id'])
        base = self.current_revision()
        body = self.stage(client)
        proposal = body['staged_proposal']
        self.assertEqual((proposal['status'], proposal['kind'], proposal['base_revision_id']), ('pending', 'rigid_pose', base))
        self.assertEqual(self.repo.read_project_manifest(self.project['id']), before)
        self.assertNotIn('suggest_pose_shift', body['outcome']['explanation'])
        self.assertEqual(client.get(f"/api/ai/proposals/{proposal['proposal_id']}").json()['proposal']['status'], 'pending')
        wrong = client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json=self.confirmation(proposal, base_revision_id='other'))
        self.assertEqual((wrong.status_code, wrong.json()['code']), (409, 'proposal-identity-mismatch'))
        self.assertEqual(self.repo.read_project_manifest(self.project['id']), before)
        accepted = client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json=self.confirmation(proposal))
        self.assertEqual(accepted.status_code, 200, accepted.text)
        result = accepted.json()['proposal']
        self.assertEqual(result['status'], 'accepted')
        self.assertEqual(self.current_revision(), result['resolved_revision_id'])
        self.assertNotEqual(result['resolved_revision_id'], base)
        again = client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json=self.confirmation(proposal))
        self.assertEqual((again.status_code, again.json()['code']), (409, 'proposal-accepted'))

    def test_revision_advance_makes_proposal_stale_and_blocks_accept(self):
        client = self.client(proposal_tool_factories=[shift_pose_factory])
        proposal = self.stage(client)['staged_proposal']
        self.repo.commit_transform(self.candidate['candidateId'], [1, 0, 0, 9, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        advanced = self.current_revision()
        self.assertEqual(client.get(f"/api/ai/proposals/{proposal['proposal_id']}").json()['proposal']['status'], 'stale')
        rejected = client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json=self.confirmation(proposal))
        self.assertEqual((rejected.status_code, rejected.json()['code']), (409, 'stale-revision'))
        self.assertEqual(self.current_revision(), advanced)

    def test_discard_and_source_selection_cannot_stage(self):
        client = self.client(proposal_tool_factories=[shift_pose_factory])
        proposal = self.stage(client)['staged_proposal']
        self.assertEqual(client.post(f"/api/ai/proposals/{proposal['proposal_id']}/discard").json()['proposal']['status'], 'discarded')
        late = client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json=self.confirmation(proposal))
        self.assertEqual(late.json()['code'], 'proposal-discarded')
        self.model.responses += [call('suggest_pose_shift', dx_mm=1.0), AIMessage('Cannot stage on a source.')]
        body = client.post('/api/ai/chat', json=self.payload(conversation_id='source-conv')).json()
        self.assertIsNone(body['staged_proposal'])
        error = [m for m in self.model.seen[-1] if isinstance(m, ToolMessage)][0]
        self.assertEqual(error.status, 'error')
        self.assertEqual(client.get('/api/ai/proposals/missing').status_code, 404)

    def test_store_rejects_non_rigid_payload_and_expires(self):
        clock = [1000.0]
        store = ProposalStore(ttl_seconds=10, clock=lambda: clock[0])
        reader = RepositoryManifestReader(self.repo)
        context = AppWorkspaceAdapter(reader).load_context(self.project['id'], self.candidate['candidateId'])
        with self.assertRaises(StagingError):
            store.stage(context, conversation_id='c', kind='rigid_pose', summary='bad', payload={'pose': [2] * 16})
        proposal = store.stage(context, conversation_id='c', kind='rigid_pose', summary='ok',
                               payload={'pose': [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]})
        clock[0] += 11
        self.assertEqual(store.get(proposal.proposal_id).status, 'expired')


if __name__ == '__main__':
    unittest.main()
