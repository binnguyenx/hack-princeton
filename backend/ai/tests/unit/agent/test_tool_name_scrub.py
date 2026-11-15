"""Internal tool names leaking into replies are replaced by plain language, without rewriting ordinary prose."""
import unittest

from skullfix_ai.agent.gemini_graph import scrub_tool_names

NAMES = {"task", "search_pubmed"}


class ToolNameScrubTest(unittest.TestCase):
    def test_an_ordinary_word_that_is_also_a_tool_name_is_left_alone_in_prose(self):
        text = "This task requires a CT with verified spacing."
        self.assertEqual(scrub_tool_names(text, NAMES), text)

    def test_an_ordinary_word_tool_name_written_as_code_is_still_replaced(self):
        self.assertEqual(scrub_tool_names("I called `task` and then task() again.", NAMES),
                         "I called a subagent and then a subagent again.")

    def test_snake_case_tool_names_are_replaced_even_when_bare(self):
        self.assertEqual(scrub_tool_names("Ran search_pubmed for PEEK.", NAMES), "Ran a PubMed search for PEEK.")


if __name__ == "__main__":
    unittest.main()
