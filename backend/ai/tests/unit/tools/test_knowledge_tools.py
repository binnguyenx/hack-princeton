"""Knowledge-base retrieval: cited hits, NOT_FOUND misses, deterministic ranking."""
import json
import tempfile
import unittest
from pathlib import Path

from skullfix_ai.tools.knowledge_tools import search_clinical_knowledge, search_knowledge


class KnowledgeSearchTest(unittest.TestCase):
    def test_hits_return_protocol_excerpt_with_file_and_section_citation(self):
        expectations = {
            'minimum sinus clearance for screws near the superior sagittal sinus': 'cranioplasty_guardrails.md § Venous and air sinus clearance',
            'PEEK vs titanium infection and exposure': 'biomaterials_selection.md § Material comparison matrix',
            'PMMA exothermic heat': 'biomaterials_selection.md § PMMA',
            'bone flap resorption in children': 'biomaterials_selection.md § Autologous bone and resorption',
            'how do I compute volume from voxel spacing': 'biomechanical_formulas.md § Voxel volume',
            'drainage hole diameter and spacing': 'cranioplasty_guardrails.md § Drainage and dural tack-up holes',
        }
        for query, citation in expectations.items():
            with self.subTest(query=query):
                result = search_knowledge(query)
                self.assertEqual(result['status'], 'FOUND')
                self.assertEqual(result['results'][0]['citation'], citation)
                self.assertTrue(result['results'][0]['excerpt'])
                self.assertIn('evidence', result['results'][0])

    def test_off_topic_queries_are_not_found(self):
        for query in ('temozolomide dosing for glioblastoma', 'weather tomorrow', 'the and of', '???',
                      'when can anticoagulation restart timing', 'post-operative antibiotic regimen'):
            with self.subTest(query=query):
                self.assertEqual(search_knowledge(query), {'status': 'NOT_FOUND', 'query': query})

    def test_tool_wrapper_returns_json_and_empty_directory_is_not_found(self):
        self.assertEqual(json.loads(search_clinical_knowledge.invoke({'query': 'dura penetration'}))['status'], 'FOUND')
        with tempfile.TemporaryDirectory() as empty:
            self.assertEqual(search_knowledge('PEEK', Path(empty))['status'], 'NOT_FOUND')

    def test_ranking_is_deterministic(self):
        self.assertEqual(search_knowledge('titanium thin scalp radiotherapy'), search_knowledge('titanium thin scalp radiotherapy'))


if __name__ == '__main__':
    unittest.main()
