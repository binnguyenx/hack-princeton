"""Native LangGraph (MessagesState/ToolNode/InMemorySaver) chat path with a scripted model.

No provider or network: the scripted model stands in for ChatGoogleGenerativeAI.
"""
import json
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


def call(name, call_id='c1', **args):
    return AIMessage('', tool_calls=[{'name': name, 'args': args, 'id': call_id, 'type': 'tool_call'}])


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
        self.assertEqual(sorted(self.model.bound), ['calculate_voxel_volume', 'describe_selection', 'evaluate_fixation_safety',
                                                    'evaluate_implant_fit_metrics', 'list_candidate_revisions',
                                                    'list_case_objects', 'measure_defect_rim_thickness',
                                                    'measure_implant_rim_fit', 'measure_workspace_volumes',
                                                    'search_clinical_knowledge', 'task'])
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

    def test_knowledge_hit_is_cited_without_fallback_disclaimer(self):
        self.model.responses += [call('search_clinical_knowledge', query='PMMA exothermic thermal injury'),
                                 AIMessage('Per the biomaterial evidence summary, in-situ PMMA can exceed 80 °C.')]
        outcome = self.post(message='Is PMMA safe to mould in situ?')['outcome']
        tool_result = [m for m in self.model.seen[1] if isinstance(m, ToolMessage)][0]
        self.assertIn('"status": "FOUND"', tool_result.content)
        self.assertIn('biomaterials_selection.md § PMMA', tool_result.content)
        self.assertNotIn('Outside verified workspace protocols', outcome['explanation'])

    def test_knowledge_miss_forces_fallback_disclaimer(self):
        self.model.responses += [call('search_clinical_knowledge', query='glioblastoma temozolomide dosing'),
                                 AIMessage('Temozolomide dosing is typically weight based.')]
        text = self.post(message='What is the temozolomide dose?')['outcome']['explanation']
        tool_result = [m for m in self.model.seen[1] if isinstance(m, ToolMessage)][0]
        self.assertIn('NOT_FOUND', tool_result.content)
        self.assertTrue(text.startswith('**Outside verified workspace protocols:**'), text)

    def test_deterministic_calc_result_and_tool_names_are_abstracted(self):
        self.model.responses += [
            call('evaluate_fixation_safety', bone_thickness_mm=1.6, sinus_clearance_mm=7.0, screw_length_mm=4.0),
            AIMessage('I ran `evaluate_fixation_safety()` and search_clinical_knowledge: FAIL, bone 0.4 mm below policy.')]
        outcome = self.post(message='Bone is 1.6 mm, sinus 7 mm away, 4 mm screw. Safe?')['outcome']
        tool_result = [m for m in self.model.seen[1] if isinstance(m, ToolMessage)][0]
        self.assertIn('"status": "FAIL"', tool_result.content)
        self.assertIn('"margin_mm": -0.4', tool_result.content)
        text = outcome['explanation']
        for name in ('evaluate_fixation_safety', 'search_clinical_knowledge'):
            self.assertNotIn(name, text)
        self.assertIn('the fixation safety check', text)
        self.assertIn('tool:evaluate_fixation_safety', outcome['steps'])

    def stream(self, **changes):
        response = self.client.post('/api/ai/chat/stream', json={**self.payload, **changes})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.headers['content-type'].startswith('application/x-ndjson'))
        return [json.loads(line) for line in response.text.splitlines() if line.strip()]

    def test_stream_shows_reasoning_and_plain_language_steps_before_the_result(self):
        before = self.repo.read_project_manifest(self.project['id'])
        thinking = AIMessage(content=[{'type': 'thinking', 'thinking': 'I should call search_clinical_knowledge first.'}],
                             tool_calls=[{'name': 'search_clinical_knowledge', 'args': {'query': 'sinus clearance'},
                                          'id': 'k1', 'type': 'tool_call'}])
        self.model.responses += [thinking, AIMessage('Keep fixation at least 5 mm from the sinus (policy default).')]
        events = self.stream(message='How close can screws be to the sagittal sinus?')
        types = [event['type'] for event in events]
        self.assertEqual(types[0], 'metadata')
        self.assertEqual(types[-1], 'result')
        self.assertTrue(all(kind == 'thinking' for kind in types[1:-1]))
        thoughts = [event for event in events if event['type'] == 'thinking']
        reasoning = [event['text'] for event in thoughts if event['kind'] == 'reasoning']
        self.assertEqual(reasoning, ['I should call the clinical knowledge base first.'])
        steps = [(event['id'], event['text']) for event in thoughts if event['kind'] == 'step']
        self.assertEqual(steps[0][0], 'step-preflight')
        self.assertIn('Checked what this selection supports', steps[0][1])
        self.assertEqual(steps[1], ('step-k1', 'Searching the clinical knowledge base…'))
        self.assertEqual(steps[2][0], 'step-k1')
        self.assertIn('found Venous and air sinus clearance', steps[2][1])
        for event in thoughts:
            self.assertNotIn('search_clinical_knowledge', event['text'])
            self.assertNotIn('{', event['text'])
        result = events[-1]
        self.assertEqual((result['mode'], result['request_id'], result['conversation_id']), ('gemini-read-only', 'r1', 'conv-1'))
        self.assertEqual(result['outcome']['status'], 'completed')
        self.assertEqual(result['outcome']['explanation'], 'Keep fixation at least 5 mm from the sinus (policy default).')
        self.assertEqual(self.repo.read_project_manifest(self.project['id']), before)

    def test_stream_and_json_routes_share_the_outcome_and_memory(self):
        self.model.responses += [AIMessage('First.'), AIMessage('Second.')]
        self.assertEqual(self.stream()[-1]['outcome']['explanation'], 'First.')
        self.post(request_id='r2', message='And?')
        self.assertEqual([m.content for m in self.model.seen[1] if isinstance(m, HumanMessage)], ['What is the grid size?', 'And?'])

    def test_stream_stale_context_and_validation_errors(self):
        candidate = self.repo.create_candidate(self.sample['id'])
        self.repo.commit_transform(candidate['candidateId'], [1,0,0,5,0,1,0,0,0,0,1,0,0,0,0,1])
        events = self.stream(object_id=candidate['candidateId'], expected_revision_id=candidate['revisionId'])
        self.assertEqual([event['type'] for event in events], ['metadata', 'result'])
        self.assertEqual(events[-1]['outcome']['code'], 'stale-revision')
        self.assertEqual(self.model.seen, [])
        self.assertEqual(self.client.post('/api/ai/chat/stream', json={**self.payload, 'message': ' '}).status_code, 422)

    def test_stream_model_failure_ends_with_unavailable_result(self):
        client = TestClient(create_app(self.repo.root, chat_agent=GeminiChatAgent(lambda: (_ for _ in ()).throw(RuntimeError('k'))))); self.addCleanup(client.close)
        lines = [json.loads(line) for line in client.post('/api/ai/chat/stream', json=self.payload).text.splitlines()]
        self.assertEqual(lines[-1]['outcome']['code'], 'model-unavailable')

    def test_default_model_is_gemini_flash(self):
        self.assertEqual(GEMINI_MODEL, 'gemini-3.1-flash-lite')


if __name__ == '__main__': unittest.main()
