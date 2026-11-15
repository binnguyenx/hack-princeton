"""Deterministic formula and policy checks: PASS, FAIL, INDETERMINATE."""
import json
import re
import unittest
from pathlib import Path

from skullfix_ai.tools.clinical_calc_tools import (POLICY, calculate_voxel_volume, calculate_voxel_volume_value,
                                                   evaluate_fixation_safety_value, evaluate_implant_fit_metrics_value)

KNOWLEDGE = Path(__file__).resolve().parents[3] / 'knowledge'


class VoxelVolumeTest(unittest.TestCase):
    def test_exact_volume_in_mm3_and_cm3(self):
        result = calculate_voxel_volume_value(1000, [0.5, 0.5, 2.0])
        self.assertEqual(result['status'], 'OK')
        self.assertEqual(result['voxel_volume_mm3'], 0.5)
        self.assertEqual(result['volume_mm3'], 500.0)
        self.assertEqual(result['volume_cm3'], 0.5)

    def test_missing_or_invalid_spacing_is_indeterminate(self):
        for spacing in (None, [], [1, 1], [1, 0, 1], [1, -1, 1], [1, float('nan'), 1], [1, float('inf'), 1], 'mm'):
            with self.subTest(spacing=spacing):
                self.assertEqual(calculate_voxel_volume_value(10, spacing)['status'], 'INDETERMINATE')
        for count in (-1, 1.5, True):
            self.assertEqual(calculate_voxel_volume_value(count, [1, 1, 1])['status'], 'INDETERMINATE')

    def test_langchain_tool_returns_json_and_defaults_spacing_to_missing(self):
        self.assertEqual(json.loads(calculate_voxel_volume.invoke({'voxel_count': 5}))['status'], 'INDETERMINATE')
        self.assertEqual(json.loads(calculate_voxel_volume.invoke({'voxel_count': 8, 'spacing_mm': [1, 1, 1]}))['volume_mm3'], 8.0)


class FixationSafetyTest(unittest.TestCase):
    def test_pass_reports_margins_and_policy_basis(self):
        result = evaluate_fixation_safety_value(6.0, 9.0, 4.0)
        self.assertEqual(result['status'], 'PASS')
        margins = {c['check']: c['margin_mm'] for c in result['checks']}
        self.assertEqual(margins, {'bone_thickness': 4.0, 'screw_depth': 2.0, 'sinus_clearance': 4.0})
        self.assertEqual(result['safety_margin_index_mm'], 2.0)
        self.assertIn('not a validated clinical standard', result['basis'])

    def test_each_rule_fails_independently(self):
        cases = {'bone_thickness': (1.9, 9.0, 1.0), 'screw_depth': (3.0, 9.0, 4.0), 'sinus_clearance': (6.0, 4.9, 4.0)}
        for failing, args in cases.items():
            with self.subTest(failing=failing):
                result = evaluate_fixation_safety_value(*args)
                self.assertEqual(result['status'], 'FAIL')
                self.assertEqual([c['check'] for c in result['checks'] if c['status'] == 'FAIL'], [failing])
                self.assertLess(result['safety_margin_index_mm'], 0)

    def test_boundaries_are_inclusive(self):
        self.assertEqual(evaluate_fixation_safety_value(2.0, 5.0, 2.0)['status'], 'PASS')

    def test_invalid_inputs_are_indeterminate(self):
        for args in ((-1, 5, 4), (5, float('nan'), 4), (5, 5, 0), ('5', 5, 4)):
            self.assertEqual(evaluate_fixation_safety_value(*args)['status'], 'INDETERMINATE')


class ImplantFitTest(unittest.TestCase):
    def test_pass_and_each_failure(self):
        self.assertEqual(evaluate_implant_fit_metrics_value(0.0, 0.8, 4.5)['status'], 'PASS')
        self.assertEqual(evaluate_implant_fit_metrics_value(-0.5, 1.0, 4.0)['status'], 'PASS')
        for args, failing in (((0.2, 0.5, 4.5), 'dura_penetration'), ((0.0, 1.2, 4.5), 'mean_rim_gap'),
                              ((0.0, 0.5, 3.9), 'margin_overlap'), ((0.0, 0.5, 5.1), 'margin_overlap')):
            with self.subTest(args=args):
                result = evaluate_implant_fit_metrics_value(*args)
                self.assertEqual(result['status'], 'FAIL')
                self.assertEqual([c['check'] for c in result['checks'] if c['status'] == 'FAIL'], [failing])

    def test_invalid_inputs_are_indeterminate(self):
        for args in ((float('inf'), 0.5, 4.5), (0.0, -0.1, 4.5), (0.0, 0.5, None)):
            self.assertEqual(evaluate_implant_fit_metrics_value(*args)['status'], 'INDETERMINATE')


class PolicyDocumentSyncTest(unittest.TestCase):
    def test_guardrail_markdown_states_the_same_thresholds(self):
        text = (KNOWLEDGE / 'cranioplasty_guardrails.md').read_text(encoding='utf-8')
        self.assertIn(f"≥ {POLICY['min_bone_thickness_mm']} mm", text)
        self.assertIn(f"≥ {POLICY['min_sinus_clearance_mm']} mm", text)
        self.assertIn(f"{POLICY['max_dura_penetration_mm']} mm", text)
        self.assertIn(f"{POLICY['margin_overlap_min_mm']}–{POLICY['margin_overlap_max_mm']} mm", text)
        self.assertIn(f"≤ {POLICY['max_mean_rim_gap_mm']} mm", text)
        self.assertTrue(re.search(r'not validated clinical standards', text))


if __name__ == '__main__':
    unittest.main()
