"""Deep Agents migration and research subagent (features/ai-deep-agent-research).

Offline: a scripted model replays turns and research wrappers are fakes. No provider or network.
"""
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from skullfix_ai.agent.gemini_graph import GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository

EXISTING_TOOLS = ['calculate_voxel_volume', 'describe_selection', 'evaluate_fixation_safety',
                  'evaluate_implant_fit_metrics', 'list_candidate_revisions', 'list_case_objects',
                  'measure_defect_rim_thickness', 'measure_implant_rim_fit', 'measure_workspace_volumes',
                  'search_clinical_knowledge']
DEEP_AGENT_BUILTINS = {'ls', 'read_file', 'write_file', 'edit_file', 'delete', 'glob', 'grep', 'write_todos'}


class RecordingModel(BaseChatModel):
    """Replays responses in order and records every tool binding and every prompt it sees."""
    responses: list[Any] = []
    seen: list[Any] = []
    bindings: list[list[str]] = []
    task_descriptions: list[str] = []

    @property
    def _llm_type(self):
        return 'recording'

    def bind_tools(self, tools, **kwargs):
        names = [getattr(tool, 'name', None) or tool.get('name') for tool in tools]
        self.bindings.append(names)
        for tool in tools:
            if getattr(tool, 'name', None) == 'task':
                self.task_descriptions.append(tool.description)
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        if not self.responses:
            return ChatResult(generations=[ChatGeneration(message=AIMessage('(no scripted reply)'))])
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def call(name, call_id='c1', **args):
    return AIMessage('', tool_calls=[{'name': name, 'args': args, 'id': call_id, 'type': 'tool_call'}])


class DeepAgentBase(unittest.TestCase):
    agent_options: dict = {}

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.repo = ApplicationRepository(Path(temporary.name))
        self.project = self.repo.create_project('Deep agent')
        self.case = self.repo.add_case(self.project['id'], 'Case')
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Skull', True,
            {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [1, 1, 1], 'bboxMm': [2, 3, 4]}, b'protected')
        self.model = RecordingModel(responses=[], seen=[], bindings=[], task_descriptions=[])
        self.agent = GeminiChatAgent(lambda: self.model, **self.agent_options)
        self.client = TestClient(create_app(self.repo.root, chat_agent=self.agent)); self.addCleanup(self.client.close)
        self.payload = dict(request_id='r1', conversation_id='conv-1', project_id=self.project['id'],
            case_id=self.case['id'], object_id=self.sample['sourceAnatomy']['objectId'],
            expected_revision_id=None, message='What is the grid size?')

    def post(self, **changes):
        response = self.client.post('/api/ai/chat', json={**self.payload, **changes})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def stream(self, **changes):
        response = self.client.post('/api/ai/chat/stream', json={**self.payload, **changes})
        self.assertEqual(response.status_code, 200, response.text)
        return [json.loads(line) for line in response.text.splitlines()]


class BoundToolContract(DeepAgentBase):
    def test_main_agent_gets_existing_tools_plus_task_only(self):
        self.model.responses.append(AIMessage('Hi.'))
        self.post()
        main = self.model.bindings[0]
        self.assertEqual(sorted(main), sorted([*EXISTING_TOOLS, 'task']))
        self.assertFalse(DEEP_AGENT_BUILTINS & set(main))

    def test_no_general_purpose_subagent_is_offered(self):
        self.model.responses.append(AIMessage('Hi.'))
        self.post()
        self.assertTrue(self.model.task_descriptions)
        listing = self.model.task_descriptions[0].split('Available agent types', 1)[1]
        offered = []
        for line in listing.splitlines()[1:]:
            if not line.startswith('- '):
                break
            offered.append(line[2:].split(':', 1)[0])
        self.assertEqual(offered, ['research', 'case_report'])


class StreamShape(DeepAgentBase):
    def test_s2_existing_tool_turn_streams_the_same_lines(self):
        self.model.responses += [call('describe_selection'), AIMessage('The grid is 2 × 3 × 4 voxels.')]
        lines = self.stream()
        # Baseline captured from the pre-migration StateGraph on 2026-11-15: preflight, call, result.
        self.assertEqual([line['type'] for line in lines], ['metadata', 'thinking', 'thinking', 'thinking', 'result'])
        self.assertEqual(lines[1]['id'], 'step-preflight')
        self.assertEqual([(line['kind'], line['id'], line['text']) for line in lines[2:4]], [
            ('step', 'step-c1', "Reading the selected object's metadata…"),
            ('step', 'step-c1', "Reading the selected object's metadata: done")])
        result = lines[-1]
        self.assertEqual(result['mode'], 'gemini-read-only')
        self.assertEqual(result['outcome']['status'], 'completed')
        self.assertEqual(result['outcome']['explanation'], 'The grid is 2 × 3 × 4 voxels.')
        self.assertEqual(result['outcome']['steps'], ['load_context', 'preflight', 'agent', 'tool:describe_selection'])
        self.assertEqual(set(result), {'type', 'mode', 'request_id', 'conversation_id', 'outcome', 'limitations',
                                       'staged_proposal', 'viewport_overlay', 'report_job'})
        self.assertIsNone(result['report_job'])  # optional field added by ai-case-report R6


class StepBudget(DeepAgentBase):
    def test_s6_a_looping_model_ends_unavailable_within_six_model_calls(self):
        self.model.responses += [call('describe_selection', call_id=f'loop-{i}') for i in range(12)]
        outcome = self.post()['outcome']
        self.assertEqual((outcome['status'], outcome['code']), ('unavailable', 'model-unavailable'))
        self.assertLessEqual(len(self.model.seen), 6)


class FakeArxiv:
    def get_summaries_as_docs(self, query):
        from types import SimpleNamespace
        return [SimpleNamespace(page_content='Titanium vs PEEK outcomes.', metadata={
            'Entry ID': 'http://arxiv.org/abs/2201.00001v1', 'Published': '2022-01-01', 'Title': 'Implant materials'})]


class FakePubmed:
    def __init__(self, fail=False):
        self.fail = fail

    def load(self, query):
        if self.fail:
            raise TimeoutError('ncbi')
        return [{'uid': '34567890', 'Title': 'PEEK cranioplasty infection', 'Published': '2021', 'Summary': 'Lower rates.'}]


class FakeWikipedia:
    def load(self, query):
        return []


def research_turns(subagent_summary):
    """Main: knowledge miss -> task(research) -> [subagent: two searches -> summary] -> main answer."""
    return [
        call('search_clinical_knowledge', call_id='k1', query='zebrafish telomere chronobiology'),
        call('task', call_id='t1', description='PEEK vs titanium cranioplasty infection rates', subagent_type='research'),
        AIMessage('', tool_calls=[
            {'name': 'search_arxiv', 'args': {'query': 'PEEK titanium cranioplasty'}, 'id': 's1', 'type': 'tool_call'},
            {'name': 'search_pubmed', 'args': {'query': 'PEEK cranioplasty infection'}, 'id': 's2', 'type': 'tool_call'}]),
        AIMessage(subagent_summary),
        AIMessage('PEEK had fewer infections [1]. Sources: [1] [PEEK cranioplasty infection]'
                  '(https://pubmed.ncbi.nlm.nih.gov/34567890/), [2] [Implant materials](https://arxiv.org/abs/2201.00001)'),
    ]


class ResearchSubagent(DeepAgentBase):
    agent_options = {'research_wrappers': {'wikipedia': FakeWikipedia(), 'arxiv': FakeArxiv(), 'pubmed': FakePubmed()}}

    def test_s4_research_delegation_streams_spawn_steps_return_and_cites_links(self):
        self.model.responses += research_turns(
            'PEEK showed lower infection rates [1][2].\nSources:\n[1] PEEK cranioplasty infection (PubMed, 2021) — '
            'https://pubmed.ncbi.nlm.nih.gov/34567890/\n[2] Implant materials (arXiv, 2022) — https://arxiv.org/abs/2201.00001')
        lines = self.stream(message='Is PEEK or titanium better for infection risk? Cite papers.')
        sub = [line for line in lines if line.get('kind') == 'subagent']
        self.assertEqual(sub[0]['phase'], 'spawned')
        self.assertEqual(sub[-1]['phase'], 'returned')
        self.assertTrue(all(line['subagent'] == 'research' for line in sub))
        steps = [line['text'] for line in sub if line['phase'] == 'step']
        self.assertIn('Searching arXiv for “PEEK titanium cranioplasty”…', steps)
        self.assertIn('Searching PubMed for “PEEK cranioplasty infection”…', steps)
        self.assertIn('PubMed: 1 result', steps)
        self.assertIn('2 sources', sub[-1]['text'])
        result = lines[-1]
        self.assertEqual(result['outcome']['status'], 'completed')
        self.assertIn('tool:task', result['outcome']['steps'])
        text = result['outcome']['explanation']
        self.assertIn('https://pubmed.ncbi.nlm.nih.gov/34567890/', text)
        self.assertIn('https://arxiv.org/abs/2201.00001', text)
        self.assertNotIn('search_pubmed', json.dumps(lines))
        # The subagent's own messages stay out of the main conversation; only the task result enters it.
        main_tools = [m.name for m in self.model.seen[-1] if getattr(m, 'type', '') == 'tool']
        self.assertEqual(main_tools, ['search_clinical_knowledge', 'task'])

    def test_r15_main_prompt_carries_the_delegation_rule(self):
        self.model.responses.append(AIMessage('Hi.'))
        self.post()
        system = self.model.seen[0][0].content
        self.assertIn('Delegate to the research subagent', system)


class ResearchSourceDown(DeepAgentBase):
    agent_options = {'research_wrappers': {'wikipedia': FakeWikipedia(), 'arxiv': FakeArxiv(), 'pubmed': FakePubmed(fail=True)}}

    def test_s5_unavailable_source_is_reported_and_the_turn_completes(self):
        self.model.responses += research_turns(
            'Only arXiv answered [1]; PubMed was unavailable.\nSources:\n[1] Implant materials (arXiv, 2022) — '
            'https://arxiv.org/abs/2201.00001')
        lines = self.stream(message='Find papers on PEEK cranioplasty infection.')
        steps = [line['text'] for line in lines if line.get('kind') == 'subagent' and line['phase'] == 'step']
        self.assertIn('PubMed: unavailable', steps)
        self.assertIn('arXiv: 1 result', steps)
        self.assertEqual(lines[-1]['outcome']['status'], 'completed')


if __name__ == '__main__':
    unittest.main()
