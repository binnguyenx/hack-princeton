"""HTTP-to-graph capability audit for the current read-only fake-model tool set."""
import hashlib
import unittest
from dataclasses import replace
from unittest.mock import Mock, patch

import test_chat_context as chat_cases
from skullfix_ai.agent.workflow import FakeToolModel
from skullfix_ai.tools import ToolObservation
from skullfix_ai.tools.inspection import metadata_tool


class FakeModelToolsE2ETest(unittest.TestCase):
    setUp = chat_cases.ChatContextTest.setUp

    def files(self):
        return {str(path.relative_to(self.repo.root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in self.repo.root.rglob('*') if path.is_file()}

    def test_unknown_tools_invalid_args_and_proposals_do_not_execute_or_write(self):
        before = self.files()
        for name, arguments, expected in [
            ('candidate.place_rigid', {}, 'tool-unsupported'),
            ('generate.candidate', {'fixture_variant':'box-corner'}, 'tool-unsupported'),
            ('measure.candidate', {}, 'tool-unsupported'),
            ('workspace.describe_selection', {'include_pose':'yes'}, 'tool-arguments-invalid'),
            ('workspace.describe_selection', {'project_id':'foreign'}, 'tool-arguments-invalid')]:
            with self.subTest(tool=name, arguments=arguments):
                definition = metadata_tool()
                execute = Mock(wraps=definition.execute)
                with patch('skullfix_ai.api.routes.chat.FakeToolModel', return_value=FakeToolModel(name, arguments)), \
                     patch('skullfix_ai.api.routes.chat.metadata_tool', return_value=replace(definition, execute=execute)):
                    response = self.client.post('/api/ai/chat', json=self.payload)
                self.assertEqual(response.status_code, 200)
                outcome = response.json()['outcome']
                self.assertEqual(outcome['code'], expected)
                self.assertIsNone(outcome['observation'])
                execute.assert_not_called()
                self.assertEqual(self.files(), before)

        model = FakeToolModel()
        with patch.object(model, 'propose', return_value={'name':'workspace.describe_selection','arguments':[]}):
            with patch('skullfix_ai.api.routes.chat.FakeToolModel',return_value=model):
                malformed = self.client.post('/api/ai/chat',json=self.payload)
        self.assertEqual(malformed.json()['outcome']['code'],'tool-proposal-invalid')
        self.assertEqual(self.files(),before)

    def test_unavailable_and_failed_tool_return_grounded_errors_without_side_effects(self):
        before = self.files()
        def broken(*_): raise RuntimeError('/private/secret-geometry-path')
        for execute, status, code in [(None, 'unavailable', 'operation-contract-missing'),
                                      (broken, 'failed', 'tool-execution-failed')]:
            with self.subTest(code=code):
                with patch('skullfix_ai.api.routes.chat.metadata_tool', return_value=replace(metadata_tool(), execute=execute)):
                    response = self.client.post('/api/ai/chat', json=self.payload)
                outcome = response.json()['outcome']
                self.assertEqual((outcome['status'],outcome['code']), (status,code))
                self.assertNotIn('secret-geometry-path',outcome['explanation'])
                self.assertNotIn('Read-only reconstruction brief',outcome['explanation'])
                self.assertEqual(self.files(),before)

        model = FakeToolModel()
        with patch.object(model,'propose',side_effect=RuntimeError('/private/secret-model-path')):
            with patch('skullfix_ai.api.routes.chat.FakeToolModel',return_value=model):
                failed = self.client.post('/api/ai/chat',json=self.payload).json()['outcome']
        self.assertEqual(failed['code'],'model-failed')
        self.assertNotIn('secret-model-path',failed['explanation'])
        self.assertEqual(self.files(),before)

    def test_fabricated_tool_facts_are_rejected_before_explanation(self):
        before = self.files()
        def fabricated(arguments, context, request_id):
            data = context.model_dump(mode='json')
            data['volume_hash'] = 'fabricated-volume-hash'
            return ToolObservation(scope='application-read',metadata=data)
        with patch('skullfix_ai.api.routes.chat.metadata_tool',return_value=replace(metadata_tool(),execute=fabricated)):
            outcome = self.client.post('/api/ai/chat',json=self.payload).json()['outcome']
        self.assertEqual(outcome['code'],'tool-output-invalid')
        self.assertNotIn('fabricated-volume-hash',outcome['explanation'])
        self.assertEqual(self.files(),before)

    def test_restored_revision_is_reloaded_and_stale_input_stops_before_model(self):
        candidate = self.repo.create_candidate(self.sample['id'])
        pose = [1,0,0,5,0,1,0,0,0,0,1,0,0,0,0,1]
        newer = self.repo.commit_transform(candidate['candidateId'],pose)
        self.repo.restore_revision(candidate['candidateId'],candidate['revisionId'])
        before = self.files()
        payload = {**self.payload,'object_id':candidate['candidateId'],'expected_revision_id':candidate['revisionId'],
                   'message':'Apply placement, restore, then generate a candidate'}
        response = self.client.post('/api/ai/chat',json=payload)
        outcome = response.json()['outcome']
        self.assertEqual(outcome['status'],'completed')
        self.assertEqual(outcome['steps'],['load_context','propose','validate','execute','explain'])
        self.assertEqual(outcome['context']['revision_id'],candidate['revisionId'])
        self.assertEqual(outcome['observation']['metadata']['revision_id'],candidate['revisionId'])
        self.assertIn(candidate['revisionId'],outcome['explanation'])
        self.assertIn('cannot',outcome['explanation'])
        with patch('skullfix_ai.api.routes.chat.FakeToolModel') as model:
            stale = self.client.post('/api/ai/chat',json={**payload,'expected_revision_id':newer})
        # Construction of the fake is harmless; stale context must never invoke it.
        model.return_value.propose.assert_not_called()
        self.assertEqual(stale.json()['outcome']['code'],'stale-revision')
        self.assertEqual(self.files(),before)

if __name__ == '__main__': unittest.main()
