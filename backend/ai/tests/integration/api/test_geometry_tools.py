"""Real voxel geometry measurements on a synthetic skull fixture with known answers."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

import numpy as np
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from skullfix_ai.agent.gemini_graph import TOOL_PHRASES, GeminiChatAgent
from skullfix_ai.api.app import create_app
from skullfix_ai.application import ApplicationRepository
from skullfix_ai.application.voxel_operations import VoxelCommand, VoxelService
from skullfix_ai.tools import geometry_measurements as gm

N, C = 100, 49.5           # grid size and centre (voxel units, 1 mm spacing)
SPACING = [1.0, 1.0, 1.0]


def synthetic_skull():
    """6 mm shell (r 34–40 mm), a defect cap on the +i side, and a 1.5 mm thin zone beside it (+k)."""
    i, j, k = np.meshgrid(*(np.arange(N, dtype=float) - C for _ in range(3)), indexing='ij')
    r = np.sqrt(i ** 2 + j ** 2 + k ** 2)
    complete = (r >= 34) & (r <= 40)
    defect = complete & (i > 26) & (np.abs(j) < 12) & (np.abs(k) < 12)
    thin_zone = (i > 20) & (np.abs(j) < 12) & (k >= 12) & (k < 22)
    skull = complete & ~defect & ~(thin_zone & (r < 38.5))
    return skull, defect, thin_zone


def nrrd(mask: np.ndarray) -> bytes:
    header = (f"NRRD0004\ntype: uint8\ndimension: 3\nspace: left-posterior-superior\nsizes: {N} {N} {N}\n"
              "space directions: (1,0,0) (0,1,0) (0,0,1)\nkinds: domain domain domain\nencoding: gzip\n"
              "space origin: (0,0,0)\n\n").encode()
    return header + gzip.compress(mask.astype(np.uint8).transpose(2, 1, 0).tobytes(), mtime=0)


class MeasurementCoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skull, cls.defect, cls.thin_zone = synthetic_skull()

    def test_implant_volume_counts_exactly(self):
        implant = gm.implant_from_candidate(self.skull, self.skull | self.defect)
        self.assertEqual(int(implant.sum()), int(self.defect.sum()))
        summary = gm.volume_summary(int(implant.sum()), [0.5, 0.5, 2.0])
        self.assertAlmostEqual(summary['volume_mm3'], implant.sum() * 0.5)
        self.assertAlmostEqual(summary['volume_cm3'], implant.sum() * 0.5 / 1000, places=4)

    def test_symmetry_estimate_locates_the_unilateral_defect(self):
        estimate = gm.estimate_defect_by_symmetry(self.skull, SPACING)
        self.assertIsNotNone(estimate)
        overlap = (estimate & self.defect).sum() / (estimate | self.defect).sum()
        self.assertGreater(overlap, 0.5)
        self.assertIsNone(gm.estimate_defect_by_symmetry(np.zeros((8, 8, 8), bool), SPACING))

    def test_rim_thickness_finds_the_thin_zone(self):
        result = gm.rim_thickness(self.skull, self.defect, SPACING)
        self.assertEqual(result['status'], 'FAIL')
        self.assertLess(result['min_thickness_mm'], 2.0)
        self.assertGreater(result['max_thickness_mm'], 5.0)
        self.assertTrue(result['thin_regions'])
        for region in result['thin_regions']:
            self.assertLess(region['value_mm'], 2.0)
            i, j, k = (v - C for v in region['ijk'])
            self.assertTrue(self.thin_zone[tuple(region['ijk'])] or k > 8, region)
        severities = {p['severity'] for p in result['overlay_points']}
        self.assertIn('critical', severities)
        self.assertIn('ok', severities)
        self.assertTrue(all(0 <= v < N for p in result['overlay_points'] for v in p['ijk']))

    def test_uniform_shell_passes(self):
        i, j, k = np.meshgrid(*(np.arange(N, dtype=float) - C for _ in range(3)), indexing='ij')
        r = np.sqrt(i ** 2 + j ** 2 + k ** 2)
        shell = (r >= 34) & (r <= 40) & ~self.defect
        result = gm.rim_thickness(shell, self.defect, SPACING)
        self.assertEqual(result['status'], 'PASS')
        self.assertGreater(result['min_thickness_mm'], 2.0)

    def test_rim_fit_inlay_pass_and_translated_fail(self):
        skull = self.skull | (self.thin_zone & ~self.skull & (np.sqrt(sum(
            (g - C) ** 2 for g in np.meshgrid(*(np.arange(N, dtype=float),) * 3, indexing='ij'))) >= 34) & (
            np.sqrt(sum((g - C) ** 2 for g in np.meshgrid(*(np.arange(N, dtype=float),) * 3, indexing='ij'))) <= 40))
        snug = gm.implant_rim_fit(skull, self.defect, SPACING)
        self.assertEqual((snug['status'], snug['design']), ('PASS', 'inlay'))
        self.assertLessEqual(snug['mean_rim_gap_mm'], 1.0)
        self.assertEqual(next(c for c in snug['checks'] if c['check'] == 'margin_overlap')['status'], 'NOT_APPLICABLE')
        self.assertEqual(next(c for c in snug['checks'] if c['check'] == 'dura_penetration')['status'], 'INDETERMINATE')
        pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 3.0, 0, 0, 0, 1]
        shifted = gm.implant_rim_fit(skull, self.defect, SPACING, pose)
        self.assertEqual(shifted['status'], 'FAIL')
        self.assertGreater(shifted['max_rim_gap_mm'], 2.0)
        self.assertTrue(shifted['gap_regions'])
        self.assertGreater(shifted['bone_interference_mm3'], 0)
        self.assertEqual(gm.implant_rim_fit(skull, np.zeros_like(skull), SPACING)['status'], 'INDETERMINATE')


class ScriptedChatModel(BaseChatModel):
    responses: list[Any] = []
    seen: list[Any] = []

    @property
    def _llm_type(self):
        return 'scripted'

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def call(name):
    return AIMessage('', tool_calls=[{'name': name, 'args': {}, 'id': f'{name}-1', 'type': 'tool_call'}])


class GeometryRouteTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.repo = ApplicationRepository(Path(temporary.name))
        self.project = self.repo.create_project('Geometry')
        self.case = self.repo.add_case(self.project['id'], 'Case')
        skull, self.defect, _ = synthetic_skull()
        spatial = {'units': 'mm', 'space': 'left-posterior-superior', 'sizes': [N, N, N], 'spacings': SPACING,
                   'bboxMm': [N, N, N]}
        self.sample = self.repo.add_sample(self.project['id'], self.case['id'], 'Skull', True, spatial, nrrd(skull))
        self.model = ScriptedChatModel(responses=[], seen=[])
        self.client = TestClient(create_app(self.repo.root, chat_agent=GeminiChatAgent(lambda: self.model)))
        self.addCleanup(self.client.close)

    def stream(self, **payload):
        body = {'request_id': 'r', 'conversation_id': 'c', 'project_id': self.project['id'], 'case_id': self.case['id'],
                'object_id': self.sample['sourceAnatomy']['objectId'], 'expected_revision_id': None,
                'message': 'Check the rim', **payload}
        response = self.client.post('/api/ai/chat/stream', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return [json.loads(line) for line in response.text.splitlines() if line.strip()]

    def tool_output(self, index=1):
        return json.loads([m for m in self.model.seen[index] if isinstance(m, ToolMessage)][0].content)

    def test_source_scan_unlocks_rim_thickness_and_returns_a_viewport_overlay(self):
        self.model.responses += [call('measure_defect_rim_thickness'),
                                 AIMessage('I ran measure_defect_rim_thickness: the thinnest rim bone is under 2 mm.')]
        events = self.stream()
        preflight = next(e for e in events if e.get('id') == 'step-preflight')
        self.assertIn('rim thickness measurement', preflight['text'].split('needs more')[0])
        result = events[-1]
        self.assertIn('rim_thickness', result['outcome']['capabilities']['executable_checks'])
        output = self.tool_output()
        self.assertEqual(output['status'], 'FAIL')
        self.assertIn('symmetry', output['defect_source'])
        self.assertNotIn('overlay_points', output)
        overlay = result['viewport_overlay']
        self.assertEqual((overlay['kind'], overlay['frame'], overlay['sizes'], overlay['spacing_mm']),
                         ('rim_thickness', 'voxel-ijk', [N, N, N], SPACING))
        self.assertEqual(overlay['object_id'], self.sample['sourceAnatomy']['objectId'])
        self.assertTrue(overlay['points'])
        self.assertTrue(all(len(p['ijk']) == 3 and all(0 <= v < N for v in p['ijk']) for p in overlay['points']))
        self.assertEqual({p['severity'] for p in overlay['points']} - {'critical', 'warning', 'ok'}, set())
        self.assertEqual(len(overlay['legend']), 3)
        visible = [result['outcome']['explanation'], *(e['text'] for e in events if e.get('type') == 'thinking'),
                   overlay['title'], *(item['label'] for item in overlay['legend'])]
        for name in TOOL_PHRASES:
            self.assertFalse(any(name in text for text in visible), name)

    def test_candidate_volumes_and_fit_use_real_implant_voxels(self):
        candidate = self.repo.create_candidate(self.sample['id'])
        command = VoxelCommand(project_id=self.project['id'], case_id=self.case['id'],
                               expected_revision_id=candidate['revisionId'], operation='voxel.box',
                               bounds=[[76, 38, 38], [89, 61, 61]], mode='fill')
        revision = VoxelService(self.repo).execute(candidate['candidateId'], command)['revisionId']
        self.model.responses += [AIMessage('', tool_calls=[
            {'name': 'measure_workspace_volumes', 'args': {}, 'id': 'v', 'type': 'tool_call'},
            {'name': 'measure_implant_rim_fit', 'args': {}, 'id': 'f', 'type': 'tool_call'}]), AIMessage('Measured.')]
        events = self.stream(object_id=candidate['candidateId'], expected_revision_id=revision)
        self.assertIn('implant_fit', events[-1]['outcome']['capabilities']['executable_checks'])
        outputs = [json.loads(m.content) for m in self.model.seen[1] if isinstance(m, ToolMessage)]
        volumes, fit = outputs
        skull, _, _ = synthetic_skull()
        box = np.zeros_like(skull); box[76:90, 38:62, 38:62] = True
        self.assertEqual(volumes['implant']['voxels'], int((box & ~skull).sum()))
        self.assertEqual(volumes['implant']['volume_cm3'], round((box & ~skull).sum() / 1000, 4))
        self.assertIn(fit['status'], ('PASS', 'FAIL'))
        self.assertIn('mean_rim_gap_mm', fit)
        self.assertEqual(events[-1]['viewport_overlay']['kind'], 'rim_gap')

    def test_unverified_spacing_is_indeterminate(self):
        unverified = self.repo.add_sample(self.project['id'], self.case['id'], 'Raw', False,
            {'units': 'mm', 'sizes': [N, N, N], 'spacings': SPACING, 'bboxMm': [N, N, N]}, nrrd(synthetic_skull()[0]))
        self.model.responses += [call('measure_defect_rim_thickness'), AIMessage('Indeterminate.')]
        events = self.stream(object_id=unverified['sourceAnatomy']['objectId'])
        self.assertEqual(self.tool_output()['status'], 'INDETERMINATE')
        self.assertIsNone(events[-1]['viewport_overlay'])


if __name__ == '__main__':
    unittest.main()
