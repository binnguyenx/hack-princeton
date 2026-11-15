"""Research tools (features/ai-deep-agent-research R11–R13, R16). Offline: fake API wrappers only."""
import json
import threading
import unittest
from types import SimpleNamespace

from skullfix_ai.tools import research_tools
from skullfix_ai.tools.research_tools import build_research_tools, research_subagent


def doc(content, **metadata):
    return SimpleNamespace(page_content=content, metadata=metadata)


class FakeWikipedia:
    def __init__(self, docs=None, error=None):
        self.docs, self.error, self.queries = docs or [], error, []

    def load(self, query):
        self.queries.append(query)
        if self.error:
            raise self.error
        return self.docs


class FakeArxiv:
    def __init__(self, docs):
        self.docs, self.queries = docs, []

    def get_summaries_as_docs(self, query):
        self.queries.append(query)
        return self.docs


class FakePubmed:
    def __init__(self, items=None, block=None):
        self.items, self.block, self.queries = items or [], block, []

    def load(self, query):
        self.queries.append(query)
        if self.block:
            self.block.wait(5)
        return self.items


def tools_with(**wrappers):
    defaults = {'wikipedia': FakeWikipedia(), 'arxiv': FakeArxiv([]), 'pubmed': FakePubmed()}
    return {tool.name: tool for tool in build_research_tools({**defaults, **wrappers}, timeout_s=0.3)}


class ResearchToolTest(unittest.TestCase):
    def test_tool_names_are_the_three_sources(self):
        self.assertEqual(sorted(tools_with()), ['search_arxiv', 'search_pubmed', 'search_wikipedia'])

    def test_wikipedia_results_carry_page_links_and_capped_excerpts(self):
        wiki = FakeWikipedia([doc('body', title='Cranioplasty', summary='x' * 2000,
                                  source='https://en.wikipedia.org/wiki/Cranioplasty')])
        result = json.loads(tools_with(wikipedia=wiki)['search_wikipedia'].invoke({'query': 'cranioplasty'}))
        self.assertEqual(result['status'], 'FOUND')
        row = result['results'][0]
        self.assertEqual((row['title'], row['source'], row['url']),
                         ('Cranioplasty', 'wikipedia', 'https://en.wikipedia.org/wiki/Cranioplasty'))
        self.assertLessEqual(len(row['excerpt']), 800)

    def test_arxiv_links_are_canonical_abs_urls_without_version(self):
        arxiv = FakeArxiv([doc('Deep learning for skull completion.', **{
            'Entry ID': 'http://arxiv.org/abs/2101.01234v3', 'Published': '2021-01-05', 'Title': 'Skull completion'})])
        row = json.loads(tools_with(arxiv=arxiv)['search_arxiv'].invoke({'query': 'skull'}))['results'][0]
        self.assertEqual((row['url'], row['year']), ('https://arxiv.org/abs/2101.01234', 2021))

    def test_arxiv_swallowed_client_error_is_unavailable_not_a_result(self):
        arxiv = FakeArxiv([doc('Arxiv exception: HTTP 503')])
        result = json.loads(tools_with(arxiv=arxiv)['search_arxiv'].invoke({'query': 'skull'}))
        self.assertEqual((result['status'], result['results']), ('UNAVAILABLE', []))

    def test_pubmed_links_use_the_pmid_and_at_most_three_results(self):
        items = [{'uid': str(30000000 + i), 'Title': f'Paper {i}', 'Published': '2019--', 'Summary': 's'} for i in range(5)]
        result = json.loads(tools_with(pubmed=FakePubmed(items))['search_pubmed'].invoke({'query': 'PEEK infection'}))
        self.assertEqual(len(result['results']), 3)
        self.assertEqual(result['results'][0]['url'], 'https://pubmed.ncbi.nlm.nih.gov/30000000/')
        self.assertEqual(result['results'][0]['year'], 2019)

    def test_s5_timeout_and_errors_are_structured_unavailable(self):
        block = threading.Event(); self.addCleanup(block.set)
        tools = tools_with(pubmed=FakePubmed(block=block), wikipedia=FakeWikipedia(error=ConnectionError('down')))
        slow = json.loads(tools['search_pubmed'].invoke({'query': 'cranioplasty'}))
        down = json.loads(tools['search_wikipedia'].invoke({'query': 'cranioplasty'}))
        self.assertEqual((slow['status'], slow['reason'], slow['source']), ('UNAVAILABLE', 'timeout', 'pubmed'))
        self.assertEqual((down['status'], down['reason'], down['source']), ('UNAVAILABLE', 'error', 'wikipedia'))

    def test_empty_results_are_no_results(self):
        result = json.loads(tools_with()['search_wikipedia'].invoke({'query': 'cranioplasty'}))
        self.assertEqual((result['status'], result['results']), ('NO_RESULTS', []))

    def test_r16_queries_are_trimmed_and_bounded_and_pubmed_contact_is_generic(self):
        wiki = FakeWikipedia()
        tools_with(wikipedia=wiki)['search_wikipedia'].invoke({'query': '  titanium\n mesh  ' + 'x' * 500})
        self.assertTrue(wiki.queries[0].startswith('titanium mesh '))
        self.assertLessEqual(len(wiki.queries[0]), 300)
        self.assertEqual(research_tools.PUBMED_CONTACT, 'anonymous@example.org')

    def test_subagent_is_named_research_with_only_the_search_tools(self):
        tools = build_research_tools({'wikipedia': FakeWikipedia(), 'arxiv': FakeArxiv([]), 'pubmed': FakePubmed()})
        spec = research_subagent(tools)
        self.assertEqual(spec['name'], 'research')
        self.assertEqual(sorted(t.name for t in spec['tools']), ['search_arxiv', 'search_pubmed', 'search_wikipedia'])
        self.assertIn('[1]', spec['system_prompt'])


if __name__ == '__main__':
    unittest.main()
