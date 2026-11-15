"""Report plan validation and default shots (features/ai-case-report R4, R5, S2)."""
import unittest

from skullfix_ai.reports.plan import CaseFacts, PlanError, build_plan

FACTS = CaseFacts(
    case_name='Case 7', source_object_ids={'src-1'}, candidate_object_ids={'cand-1'},
    annotations={'ann-rim': {'name': 'Defect rim', 'type': 'closed_curve'},
                 'ann-plane': {'name': 'Mid-sagittal', 'type': 'plane'}})


def raw(**changes):
    base = {'title': 'Right frontotemporal defect', 'summary': 'A 60 mm defect.', 'findings': ['Rim intact.'],
            'measurements': [{'name': 'Defect span', 'value': '62', 'unit': 'mm', 'source': 'user'}],
            'sources': [{'title': 'PEEK cranioplasty', 'url': 'https://pubmed.ncbi.nlm.nih.gov/1/'}]}
    return {**base, **changes}


class DefaultShots(unittest.TestCase):
    def test_without_shots_the_reference_layout_is_filled_in(self):
        plan = build_plan(raw(callouts=[{'annotation_id': 'ann-rim', 'label': 'Defect rim'}]), FACTS)
        by_section = {}
        for shot in plan.shots:
            by_section.setdefault(shot.section, []).append(shot)
        self.assertEqual(len(by_section['hero']), 3)
        self.assertEqual([s.preset for s in by_section['anatomy']], ['left', 'right', 'anterior', 'superior', 'posterior'])
        self.assertEqual([s.preset for s in by_section['repair']], ['left', 'right', 'anterior', 'superior', 'posterior'])
        self.assertTrue(all(s.objects == ['src-1'] for s in by_section['anatomy']))
        self.assertTrue(all(set(s.objects) == {'src-1', 'cand-1'} for s in by_section['repair']))
        self.assertEqual([s.kind for s in by_section['slices']], ['slices'])
        self.assertEqual(by_section['slices'][0].centre, 'defect')
        annotated = by_section['annotated'][0]
        self.assertEqual((annotated.kind, annotated.callouts[0].annotation_id), ('annotated_view', 'ann-rim'))
        self.assertEqual(len({s.id for s in plan.shots}), len(plan.shots))
        self.assertLessEqual(len(plan.shots), 16)

    def test_no_candidate_means_no_repair_page_and_volume_centre_slices(self):
        facts = CaseFacts(case_name='C', source_object_ids={'src-1'}, candidate_object_ids=set(), annotations={})
        plan = build_plan(raw(), facts)
        self.assertNotIn('repair', {s.section for s in plan.shots})
        self.assertEqual(next(s for s in plan.shots if s.kind == 'slices').centre, 'volume')


class Validation(unittest.TestCase):
    def assert_rejected(self, payload, *needles):
        with self.assertRaises(PlanError) as caught:
            build_plan(payload, FACTS)
        for needle in needles:
            self.assertIn(needle, str(caught.exception))

    def test_s2_unknown_annotation_is_named(self):
        self.assert_rejected(raw(callouts=[{'annotation_id': 'ann-ghost', 'label': 'x'}]), 'ann-ghost')

    def test_unknown_object_in_a_shot_is_named(self):
        self.assert_rejected(raw(shots=[{'kind': 'view', 'preset': 'left', 'objects': ['obj-x'], 'section': 'hero'}]), 'obj-x')

    def test_more_than_16_shots_is_rejected(self):
        shots = [{'kind': 'view', 'preset': 'left', 'objects': ['src-1'], 'section': 'anatomy'}] * 17
        self.assert_rejected(raw(shots=shots), '16')

    def test_long_summary_and_callout_labels_are_rejected(self):
        self.assert_rejected(raw(summary='x' * 1201), 'summary')
        self.assert_rejected(raw(callouts=[{'annotation_id': 'ann-rim', 'label': 'y' * 41}]), 'label')

    def test_unknown_preset_and_slice_centre_annotation_are_checked(self):
        self.assert_rejected(raw(shots=[{'kind': 'view', 'preset': 'underneath', 'objects': ['src-1'], 'section': 'hero'}]), 'preset')
        self.assert_rejected(raw(shots=[{'kind': 'slices', 'centre': {'annotation_id': 'nope'}, 'section': 'slices'}]), 'nope')

    def test_explicit_shots_are_kept_in_order(self):
        shots = [{'kind': 'slices', 'centre': {'annotation_id': 'ann-plane'}, 'section': 'slices'},
                 {'kind': 'view', 'preset': 'hero_oblique', 'objects': ['src-1', 'cand-1'], 'section': 'hero'}]
        plan = build_plan(raw(shots=shots), FACTS)
        self.assertEqual([s.kind for s in plan.shots], ['slices', 'view'])
        self.assertEqual(plan.shots[0].centre, {'annotation_id': 'ann-plane'})


if __name__ == '__main__':
    unittest.main()
