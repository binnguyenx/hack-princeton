"""Report store (features/ai-case-report R10, R13, R14, S5, S6, S8)."""
import unittest

from skullfix_ai.reports.plan import CaseFacts, build_plan
from skullfix_ai.reports.store import ReportError, ReportStore

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
FACTS = CaseFacts(case_name='Case', source_object_ids={'src'}, candidate_object_ids=set(), annotations={})


def plan():
    return build_plan({'title': 'T', 'summary': 'S'}, FACTS)


def captures_for(report, data=PNG):
    return {shot.id: data for shot in report.plan.shots}


class ReportStoreTest(unittest.TestCase):
    def setUp(self):
        self.store = ReportStore()

    def test_create_lists_per_conversation_and_ids_are_unguessable(self):
        a = self.store.create('conv-a', plan(), case_name='Case')
        self.store.create('conv-b', plan(), case_name='Case')
        self.assertEqual([r.id for r in self.store.list('conv-a')], [a.id])
        self.assertEqual(a.status, 'needs-captures')
        self.assertGreaterEqual(len(a.id), 32)

    def test_s8_sixth_report_drops_the_oldest(self):
        made = [self.store.create('conv', plan(), case_name='Case') for _ in range(6)]
        self.assertEqual([r.id for r in self.store.list('conv')], [r.id for r in made[1:]])
        self.assertIsNone(self.store.get(made[0].id))

    def test_s6_other_conversation_and_unknown_ids_are_not_found(self):
        report = self.store.create('conv-a', plan(), case_name='Case')
        self.assertIsNone(self.store.get('nope'))
        with self.assertRaises(ReportError) as caught:
            self.store.check_captures(report.id, 'conv-b', captures_for(report))
        self.assertEqual(caught.exception.status, 404)

    def test_s5_capture_checks(self):
        report = self.store.create('conv', plan(), case_name='Case')
        bad = [
            ({**captures_for(report), report.plan.shots[0].id: b'GIF89a'}, 'not-png'),
            ({**captures_for(report), 'shot-99': PNG}, 'unknown-shot'),
            ({k: v for k, v in list(captures_for(report).items())[1:]}, 'missing-shot'),
            ({**captures_for(report), report.plan.shots[0].id: PNG + b'\x00' * (2 * 1024 * 1024)}, 'capture-too-large'),
        ]
        for payload, code in bad:
            with self.subTest(code=code), self.assertRaises(ReportError) as caught:
                self.store.check_captures(report.id, 'conv', payload)
            self.assertEqual(caught.exception.code, code)
            self.assertEqual(caught.exception.status, 422)
        self.assertEqual(self.store.get(report.id).status, 'needs-captures')

    def test_total_capture_budget(self):
        store = ReportStore(max_total_capture_bytes=200)
        report = store.create('conv', plan(), case_name='Case')
        with self.assertRaises(ReportError) as caught:
            store.check_captures(report.id, 'conv', captures_for(report))
        self.assertEqual(caught.exception.code, 'captures-too-large')

    def test_ready_and_failed_transitions(self):
        report = self.store.create('conv', plan(), case_name='Case')
        self.store.set_pdf(report.id, b'%PDF-1.4 fake', pages=3)
        ready = self.store.get(report.id)
        self.assertEqual((ready.status, ready.pages, ready.pdf), ('ready', 3, b'%PDF-1.4 fake'))
        other = self.store.create('conv', plan(), case_name='Case')
        self.store.mark_failed(other.id, 'capture-failed')
        self.assertEqual((self.store.get(other.id).status, self.store.get(other.id).error), ('failed', 'capture-failed'))

    def test_oversized_pdf_fails_the_report(self):
        store = ReportStore(max_pdf_bytes=10)
        report = store.create('conv', plan(), case_name='Case')
        store.set_pdf(report.id, b'%PDF' + b'x' * 20, pages=1)
        self.assertEqual((store.get(report.id).status, store.get(report.id).pdf), ('failed', None))


if __name__ == '__main__':
    unittest.main()
