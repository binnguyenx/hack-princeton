"""Case report subagent, envelope and routes (features/ai-case-report R1–R3, R6, R10, R13, R14; S1, S3, S5, S6)."""
import io
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pypdf import PdfReader

from skullfix_ai.agent.gemini_graph import GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes((100, 110, 120)) * 4 for _ in range(3))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 4, 3, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


class Scripted(BaseChatModel):
    responses: list[Any] = []
    seen: list[Any] = []

    @property
    def _llm_type(self):
        return 'scripted'

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        reply = self.responses.pop(0) if self.responses else AIMessage('(done)')
        return ChatResult(generations=[ChatGeneration(message=reply)])


def call(name, call_id, **args):
    return AIMessage('', tool_calls=[{'name': name, 'args': args, 'id': call_id, 'type': 'tool_call'}])


class ReportFlowTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.repo = repo = ApplicationRepository(Path(temporary.name))
        self.project = repo.create_project('Report project')
        self.case = repo.add_case(self.project['id'], 'Case 22')
        self.sample = repo.add_sample(self.project['id'], self.case['id'], 'Skull', True,
            {'units': 'mm', 'sizes': [2, 3, 4], 'spacings': [1, 1, 1], 'bboxMm': [2, 3, 4]}, b'\x00' * 24)
        self.candidate = repo.create_candidate(self.sample['id'])
        self.annotation = repo.create_annotation(self.candidate['revisionId'], {
            'type': 'closed_curve', 'name': 'Defect rim', 'points': [[0, 0, 0], [1, 0, 0], [0, 1, 0]], 'meta': {}})
        self.model = Scripted(responses=[], seen=[])
        self.client = TestClient(create_app(repo.root, chat_agent=GeminiChatAgent(lambda: self.model)))
        self.addCleanup(self.client.close)
        self.payload = dict(request_id='r1', conversation_id='conv-report', project_id=self.project['id'],
            case_id=self.case['id'], object_id=self.candidate['candidateId'],
            expected_revision_id=self.candidate['revisionId'], message='Make a case report for this defect.',
            history=[{'role': 'human', 'content': 'Is PEEK better than titanium?'},
                     {'role': 'assistant', 'content': 'PEEK had fewer infections [1](https://pubmed.ncbi.nlm.nih.gov/1/).'}])

    def report_turn(self, plan):
        self.model.responses += [
            call('task', 't1', description='Case report for the selected defect', subagent_type='case_report'),
            call('read_session_transcript', 'r1'),
            call('submit_report_plan', 's1', **plan),
            AIMessage('Submitted the report plan.'),
            AIMessage('Your case report is being prepared.'),
        ]
        response = self.client.post('/api/ai/chat/stream', json=self.payload)
        self.assertEqual(response.status_code, 200, response.text)
        return [json.loads(line) for line in response.text.splitlines()]

    def plan(self, **changes):
        return {'title': 'Defect review', 'summary': 'Oval defect with intact rim.',
                'findings': ['Rim intact.'], 'conversation_summary': 'Discussed implant materials.',
                'sources': [{'title': 'PEEK outcomes', 'url': 'https://pubmed.ncbi.nlm.nih.gov/1/'}],
                'callouts': [{'annotation_id': self.annotation['id'], 'label': 'Defect rim'}], **changes}

    def upload(self, job, files=None, conversation_id='conv-report'):
        files = files if files is not None else [(shot['id'], (f"{shot['id']}.png", png(), 'image/png')) for shot in job['shots']]
        return self.client.post(f"/api/ai/reports/{job['report_id']}/captures",
                                data={'conversation_id': conversation_id}, files=files)

    def pdf(self, report_id, conversation_id='conv-report'):
        query = '' if conversation_id is None else f'?conversation_id={conversation_id}'
        return self.client.get(f"/api/ai/reports/{report_id}.pdf{query}")

    def test_s1_delegation_streams_case_report_steps_and_returns_a_report_job(self):
        lines = self.report_turn(self.plan())
        sub = [line for line in lines if line.get('kind') == 'subagent']
        self.assertEqual(sub[0]['phase'], 'spawned')
        self.assertEqual(sub[-1]['phase'], 'returned')
        self.assertTrue(all(line['subagent'] == 'case_report' for line in sub))
        self.assertIn('Reading the conversation…', [line['text'] for line in sub])
        job = lines[-1]['report_job']
        self.assertEqual((job['status'], job['conversation_id'], job['title']), ('needs-captures', 'conv-report', 'Defect review'))
        self.assertIn('annotated_view', {shot['kind'] for shot in job['shots']})
        self.assertEqual(lines[-1]['outcome']['status'], 'completed')

    def test_r3_transcript_is_this_session_only(self):
        self.report_turn(self.plan())
        transcript = next(m for m in self.model.seen[2] if isinstance(m, ToolMessage) and m.name == 'read_session_transcript')
        turns = json.loads(transcript.content)['turns']
        self.assertEqual([t['role'] for t in turns], ['human', 'assistant', 'human'])
        self.assertEqual(turns[-1]['content'], 'Make a case report for this defect.')

    def test_s2_invalid_plan_goes_back_to_the_subagent_and_stores_nothing(self):
        lines = self.report_turn(self.plan(callouts=[{'annotation_id': 'ann-ghost', 'label': 'x'}]))
        self.assertIsNone(lines[-1]['report_job'])
        result = next(m for m in self.model.seen[3] if isinstance(m, ToolMessage) and m.name == 'submit_report_plan')
        self.assertIn('ann-ghost', result.content)
        self.assertEqual(self.client.get('/api/ai/conversations/conv-report/reports').json()['reports'], [])

    def test_s3_valid_captures_build_a_pdf_served_to_the_conversation(self):
        job = self.report_turn(self.plan())[-1]['report_job']
        response = self.upload(job)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()['report']
        self.assertEqual(body['status'], 'ready')
        pdf = self.pdf(job['report_id'])
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.headers['content-type'], 'application/pdf')
        pages = PdfReader(io.BytesIO(pdf.content)).pages
        self.assertEqual(len(pages), body['pages'])
        self.assertIn('Case 22', pages[0].extract_text())
        listing = self.client.get('/api/ai/conversations/conv-report/reports').json()['reports']
        self.assertEqual([r['report_id'] for r in listing], [job['report_id']])

    def test_s5_bad_uploads_are_rejected_and_no_pdf_exists(self):
        job = self.report_turn(self.plan())[-1]['report_job']
        first = job['shots'][0]['id']
        good = [(shot['id'], (f"{shot['id']}.png", png(), 'image/png')) for shot in job['shots']]
        cases = {
            'not-png': [(first, ('a.gif', b'GIF89a', 'image/gif'))] + good[1:],
            'unknown-shot': good + [('shot-99', ('x.png', png(), 'image/png'))],
            'capture-too-large': [(first, ('a.png', png() + b'\x00' * (2 * 1024 * 1024), 'image/png'))] + good[1:],
        }
        for code, files in cases.items():
            with self.subTest(code=code):
                response = self.upload(job, files)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()['code'], code)
        self.assertEqual(self.pdf(job['report_id']).status_code, 404)

    def test_s6_other_conversations_and_unknown_ids(self):
        job = self.report_turn(self.plan())[-1]['report_job']
        self.assertEqual(self.upload(job, conversation_id='someone-else').status_code, 404)
        self.assertEqual(self.client.get('/api/ai/conversations/someone-else/reports').json()['reports'], [])
        self.assertEqual(self.pdf('does-not-exist').status_code, 404)

    def test_r14_a_ready_pdf_is_served_only_to_its_own_conversation(self):
        job = self.report_turn(self.plan())[-1]['report_job']
        self.assertEqual(self.upload(job).status_code, 200)
        self.assertEqual(self.pdf(job['report_id']).status_code, 200)
        for conversation_id in ('someone-else', None):
            with self.subTest(conversation_id=conversation_id):
                response = self.pdf(job['report_id'], conversation_id=conversation_id)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()['code'], 'report-not-found')


if __name__ == '__main__':
    unittest.main()
