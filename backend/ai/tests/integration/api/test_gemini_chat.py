"""Native LangGraph (MessagesState/ToolNode/InMemorySaver) chat path with a scripted model.

No provider or network: the scripted model stands in for ChatGoogleGenerativeAI.
"""
import tempfile
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from skullfix_ai.agent.gemini_graph import GEMINI_MODEL, GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository


class ScriptedChatModel(BaseChatModel):
    responses: list[Any] = []
    seen: list[Any] = []
    bound: list[str] = []

    @property
    def _llm_type(self):
        return 'scripted'

    def bind_tools(self, tools, **kwargs):
        self.bound[:] = [tool.name for tool in tools]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def call(name, call_id='c1'):
    return AIMessage('', tool_calls=[{'name': name, 'args': {}, 'id': call_id, 'type': 'tool_call'}])


class GeminiChatTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.repo = ApplicationRepository(Path(temporary.name))
        self.project = self.repo.create_project('Gemini chat')
        self.case = self.repo.add_case(self.project['id'], 'Case')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Skull', True,
            {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [1, 1, 1], 'bboxMm': [2, 3, 4]}, b'protected')
        self.model = ScriptedChatModel(responses=[], seen=[], bound=[])
        self.agent = GeminiChatAgent(lambda: self.model)
        self.client = TestClient(create_app(self.repo.root, chat_agent=self.agent)); self.addCleanup(self.client.close)
        self.payload = dict(request_id='r1', conversation_id='conv-1', project_id=self.project['id'],
            case_id=self.case['id'], object_id=self.sample['sourceAnatomy']['objectId'],
            expected_revision_id=None, message='What is the grid size?')

    def post(self, **changes):
        response = self.client.post('/api/ai/chat', json={**self.payload, **changes})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_tool_round_trip_uses_authoritative_metadata_and_never_writes(self):
        before = self.repo.read_project_manifest(self.project['id'])
        self.model.responses += [call('describe_selection'), AIMessage('The grid is 2 × 3 × 4 voxels.')]
        body = self.post()
        self.assertEqual(body['mode'], 'gemini-read-only')
        outcome = body['outcome']
        self.assertEqual(outcome['status'], 'completed')
        self.assertEqual(outcome['explanation'], 'The grid is 2 × 3 × 4 voxels.')
        self.assertIn('tool:describe_selection', outcome['steps'])
        self.assertEqual(outcome['observation']['scope'], 'application-read')
        self.assertEqual(outcome['context']['selected_object_id'], self.payload['object_id'])
        self.assertEqual(sorted(self.model.bound), ['describe_selection', 'list_candidate_revisions', 'list_case_objects'])
        tool_result = [m for m in self.model.seen[1] if isinstance(m, ToolMessage)][0]
        self.assertIn(self.payload['object_id'], tool_result.content)
        self.assertEqual(self.repo.read_project_manifest(self.project['id']), before)

    def test_unregistered_write_tool_is_rejected_by_tool_node(self):
        before = self.repo.read_project_manifest(self.project['id'])
        self.model.responses += [call('commit_transform'), AIMessage('I cannot change data.')]
        outcome = self.post(message='Move the implant 5 mm')['outcome']
        self.assertEqual(outcome['status'], 'completed')
        tool_result = [m for m in self.model.seen[1] if isinstance(m, ToolMessage)][0]
        self.assertEqual(tool_result.status, 'error')
        self.assertEqual(self.repo.read_project_manifest(self.project['id']), before)

    def test_in_memory_checkpoint_keeps_turns_and_seeds_client_history_once(self):
        self.model.responses += [AIMessage('First answer.'), AIMessage('Second answer.')]
        self.post(history=[{'role': 'human', 'content': 'earlier question'}, {'role': 'assistant', 'content': 'earlier answer'}])
        self.post(request_id='r2', message='And then?', history=[{'role': 'human', 'content': 'ignored when checkpointed'}])
        humans = [m.content for m in self.model.seen[1] if isinstance(m, HumanMessage)]
        self.assertEqual(humans, ['earlier question', 'What is the grid size?', 'And then?'])
        # A different conversation id starts empty.
        self.model.responses.append(AIMessage('Fresh.'))
        self.post(request_id='r3', conversation_id='conv-2', message='Hi')
        self.assertEqual([m.content for m in self.model.seen[2] if isinstance(m, HumanMessage)], ['Hi'])

    def test_stale_revision_does_not_invoke_model(self):
        candidate = self.repo.create_candidate(self.sample['id'])
        self.repo.commit_transform(candidate['candidateId'], [1,0,0,5,0,1,0,0,0,0,1,0,0,0,0,1])
        outcome = self.post(object_id=candidate['candidateId'], expected_revision_id=candidate['revisionId'])['outcome']
        self.assertEqual((outcome['status'], outcome['code']), ('stale', 'stale-revision'))
        self.assertEqual(self.model.seen, [])

    def test_model_configuration_failure_is_unavailable_without_details(self):
        def broken():
            raise RuntimeError('secret-key-xyz invalid')
        client = TestClient(create_app(self.repo.root, chat_agent=GeminiChatAgent(broken))); self.addCleanup(client.close)
        outcome = client.post('/api/ai/chat', json=self.payload).json()['outcome']
        self.assertEqual((outcome['status'], outcome['code']), ('unavailable', 'model-unavailable'))
        self.assertNotIn('secret-key-xyz', outcome['explanation'])

    def test_cors_allows_vite_dev_origin_only(self):
        for origin, allowed in [('http://127.0.0.1:5174', True), ('http://localhost:5174', True), ('http://evil.test', False)]:
            response = self.client.options('/api/ai/chat', headers={'Origin': origin, 'Access-Control-Request-Method': 'POST',
                                                                     'Access-Control-Request-Headers': 'content-type'})
            self.assertEqual(response.headers.get('access-control-allow-origin') == origin, allowed, origin)

    def test_default_model_is_gemini_flash(self):
        self.assertEqual(GEMINI_MODEL, 'gemini-3-flash-preview')


if __name__ == '__main__': unittest.main()
