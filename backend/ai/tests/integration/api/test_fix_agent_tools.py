"""Agent model-fix tools: stage-only proposals and a read-only fix report (cranial-reconstruction-candidate R20, R21, S9)."""
import json
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage

from skullfix_ai.agent.gemini_graph import GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository
from skullfix_ai.tools.fix_tools import propose_predicted_fix_factory

from test_harness_gates import ScriptedChatModel, call
from test_reconstruction_routes import FakeEndpoint, HEADER, META, SOURCE


class FixAgentToolTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.repo = ApplicationRepository(Path(temporary.name) / 'application')
        project = self.repo.create_project('Agent')
        case = self.repo.add_case(project['id'], 'Case')
        self.project_id, self.case_id = project['id'], case['id']
        self.sample = self.repo.add_sample(project['id'], case['id'], 'Skull', True, META, HEADER + SOURCE)
        self.model = ScriptedChatModel(responses=[], seen=[], bound=[])
        self.endpoint = FakeEndpoint()
        agent = GeminiChatAgent(lambda: self.model, proposal_tool_factories=[propose_predicted_fix_factory])
        self.client = TestClient(create_app(self.repo.root, repository=self.repo, chat_agent=agent,
                                            model_endpoint=self.endpoint, reconstruction_runner=lambda fn: fn()))
        self.addCleanup(self.client.close)

    def chat(self, object_id, revision_id, *responses, conversation='conv'):
        self.model.responses += list(responses)
        response = self.client.post('/api/ai/chat', json={
            'request_id': 'r-' + conversation, 'conversation_id': conversation, 'project_id': self.project_id,
            'case_id': self.case_id, 'object_id': object_id, 'expected_revision_id': revision_id, 'message': 'fill this defect'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def accept(self, proposal):
        return self.client.post(f"/api/ai/proposals/{proposal['proposal_id']}/accept", json={
            'project_id': proposal['project_id'], 'case_id': proposal['case_id'],
            'candidate_id': proposal['candidate_id'], 'base_revision_id': proposal['base_revision_id']})

    def fix_candidates(self):
        return [c for c in self.repo.get_project_manifest(self.project_id)['candidates'] if c.get('displayName') == 'Predicted fix']

    def test_generate_proposal_stages_from_skull_and_only_accept_runs_the_model(self):
        body = self.chat(self.sample['sourceAnatomy']['objectId'], None,
                         call('propose_predicted_fix', action='generate', summary='Generate a predicted fix'),
                         AIMessage('I staged a predicted fix for you to accept.'))
        proposal = body['staged_proposal']
        self.assertEqual((proposal['kind'], proposal['status'], proposal['sample_id']), ('model_fix', 'pending', self.sample['id']))
        self.assertEqual(self.fix_candidates(), [])
        self.assertEqual(self.endpoint.submitted, [])
        accepted = self.accept(proposal)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        result = accepted.json()['proposal']
        self.assertEqual(result['status'], 'accepted')
        run = self.client.get('/api/reconstructions/' + result['resolved_run_id']).json()
        self.assertEqual(run['status'], 'succeeded')
        self.assertEqual(len(self.fix_candidates()), 1)
        self.assertEqual(len(self.endpoint.submitted), 1)

    def generated_fix(self):
        run_id = self.client.post('/api/samples/' + self.sample['id'] + '/reconstructions',
                                  json={'project_id': self.project_id, 'case_id': self.case_id}).json()['runId']
        return self.client.get('/api/reconstructions/' + run_id).json()['result']

    def test_threshold_proposal_on_fix_commits_new_revision_after_accept(self):
        fix = self.generated_fix()
        body = self.chat(fix['candidateId'], fix['revisionId'],
                         call('propose_predicted_fix', action='threshold', threshold=0.7, summary='Tighten the fix'),
                         AIMessage('Staged a tighter threshold.'), conversation='tighten')
        proposal = body['staged_proposal']
        self.assertEqual((proposal['candidate_id'], proposal['base_revision_id']), (fix['candidateId'], fix['revisionId']))
        self.assertEqual(self.fix_candidates()[0]['currentRevisionId'], fix['revisionId'])
        result = self.accept(proposal).json()['proposal']
        self.assertEqual(result['status'], 'accepted')
        self.assertEqual(self.fix_candidates()[0]['currentRevisionId'], result['resolved_revision_id'])
        self.assertEqual(len(self.endpoint.submitted), 1)

    def test_describe_tool_returns_fix_report_numbers(self):
        fix = self.generated_fix()
        self.chat(fix['candidateId'], fix['revisionId'], call('describe_predicted_fix'),
                  AIMessage('Here is the fix.'), conversation='describe')
        observation = [m for m in self.model.seen[-1] if isinstance(m, ToolMessage)][0]
        report = json.loads(observation.content)
        metrics = {m['key']: m for m in report['fix']['metrics']}
        self.assertEqual(metrics['volume']['unit'], 'mL')
        self.assertAlmostEqual(metrics['volume']['value'], 0.008, places=4)   # 8 fix voxels at 1 mm³
        self.assertEqual(report['mlRecord']['runId'], 'run_test')
        self.assertIn('Not a clinical design', report['mlRecord']['limitation'])


if __name__ == '__main__':
    unittest.main()
