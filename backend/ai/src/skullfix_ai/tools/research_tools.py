"""Read-only literature search for the research subagent (features/ai-deep-agent-research R11–R16).

Each tool wraps the langchain_community API wrapper behind WikipediaQueryRun / ArxivQueryRun /
PubmedQueryRun and returns structured JSON with stable links so answers can cite sources.
Wrappers are injectable so tests never touch the network.
"""

from __future__ import annotations

import json
import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Callable, Mapping

from langchain_core.tools import BaseTool, tool

MAX_RESULTS = 3
EXCERPT_CHARS = 800
QUERY_CHARS = 300
SEARCH_TIMEOUT_S = 10.0
# Per HTTP request (connect and each read) inside a search. The wrapped clients (wikipedia's
# requests.get, arxiv's requests.Session, PubMed's urllib urlopen) set no timeout of their own, so a
# hung server would otherwise keep a worker thread forever after the caller has given up.
HTTP_TIMEOUT_S = 8.0
# A search still running this long after it started is abandoned even between retries.
SEARCH_HARD_LIMIT_S = 30.0
# Generic NCBI contact value: never a user's address (R16).
PUBMED_CONTACT = "anonymous@example.org"

SOURCES = ("wikipedia", "arxiv", "pubmed")
SOURCE_NAMES = {"wikipedia": "Wikipedia", "arxiv": "arXiv", "pubmed": "PubMed"}
TOOL_FOR_SOURCE = {source: f"search_{source}" for source in SOURCES}

_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="research")

# Set only on research worker threads while a search runs; other threads keep library defaults.
_SEARCH_SCOPE = threading.local()
_HTTP_PATCH_LOCK = threading.Lock()
_HTTP_PATCHED = False


class SearchDeadlineExceeded(RuntimeError):
    """A search outlived SEARCH_HARD_LIMIT_S (e.g. through client retries) and was abandoned."""


def _scoped_timeout() -> float | None:
    """The per-request timeout for this thread's next HTTP call, or None outside a search."""
    deadline = getattr(_SEARCH_SCOPE, "deadline", None)
    if deadline is None:
        return None
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise SearchDeadlineExceeded("research search deadline exceeded")
    return min(HTTP_TIMEOUT_S, remaining)


def _install_http_timeouts() -> None:
    """Give requests/urllib calls made inside a search a timeout when the caller set none.

    Idempotent. Calls that pass their own timeout, and calls on any other thread, are untouched.
    """
    global _HTTP_PATCHED
    with _HTTP_PATCH_LOCK:
        if _HTTP_PATCHED:
            return
        import urllib.request

        import requests

        original_request = requests.Session.request

        def request(self, method, url, *args, **kwargs):
            limit = _scoped_timeout()
            if limit is not None and kwargs.get("timeout") is None:
                kwargs["timeout"] = limit
            return original_request(self, method, url, *args, **kwargs)

        original_urlopen = urllib.request.urlopen

        def urlopen(url, data=None, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, *args, **kwargs):
            limit = _scoped_timeout()
            if limit is not None and (timeout is None or timeout is socket._GLOBAL_DEFAULT_TIMEOUT):
                timeout = limit
            return original_urlopen(url, data, timeout, *args, **kwargs)

        requests.Session.request = request
        urllib.request.urlopen = urlopen
        _HTTP_PATCHED = True


def _bounded_fetch(source: str, wrapper: Any, query: str) -> list[dict]:
    """Run one fetch on a worker with every HTTP request time-limited and an overall deadline."""
    _SEARCH_SCOPE.deadline = time.monotonic() + SEARCH_HARD_LIMIT_S
    try:
        return _FETCHERS[source](wrapper, query)
    finally:
        _SEARCH_SCOPE.deadline = None


def default_wrappers() -> dict[str, Any]:
    """Real API wrappers (network). Built lazily so importing this module never needs the clients."""
    from langchain_community.utilities.arxiv import ArxivAPIWrapper
    from langchain_community.utilities.pubmed import PubMedAPIWrapper
    from langchain_community.utilities.wikipedia import WikipediaAPIWrapper

    return {
        "wikipedia": WikipediaAPIWrapper(top_k_results=MAX_RESULTS, doc_content_chars_max=4000),
        "arxiv": ArxivAPIWrapper(top_k_results=MAX_RESULTS, doc_content_chars_max=4000),
        "pubmed": PubMedAPIWrapper(top_k_results=MAX_RESULTS, email=PUBMED_CONTACT),
    }


def _clean_query(query: str) -> str:
    return re.sub(r"\s+", " ", str(query or "")).strip()[:QUERY_CHARS]


def _excerpt(text: Any) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= EXCERPT_CHARS else text[: EXCERPT_CHARS - 1].rstrip() + "…"


def _year(value: Any) -> int | None:
    match = re.search(r"(19|20)\d{2}", str(value or ""))
    return int(match.group(0)) if match else None


def _wikipedia_results(wrapper: Any, query: str) -> list[dict]:
    rows = []
    for doc in wrapper.load(query)[:MAX_RESULTS]:
        meta = getattr(doc, "metadata", {}) or {}
        url = meta.get("source")
        if not url:
            continue
        rows.append({"title": meta.get("title") or "Wikipedia article", "source": "wikipedia", "url": url,
                     "year": None, "excerpt": _excerpt(meta.get("summary") or doc.page_content)})
    return rows


def _arxiv_results(wrapper: Any, query: str) -> list[dict]:
    docs = wrapper.get_summaries_as_docs(query)
    if docs and not (getattr(docs[0], "metadata", None) or {}).get("Entry ID"):
        # ArxivAPIWrapper swallows client errors into a metadata-less "Arxiv exception" document.
        raise RuntimeError("arxiv-unavailable")
    rows = []
    for doc in docs[:MAX_RESULTS]:
        meta = doc.metadata
        entry = str(meta.get("Entry ID", ""))
        arxiv_id = re.sub(r"^https?://arxiv\.org/abs/", "", entry)
        arxiv_id = re.sub(r"v\d+$", "", arxiv_id)
        rows.append({"title": meta.get("Title") or "arXiv preprint", "source": "arxiv",
                     "url": f"https://arxiv.org/abs/{arxiv_id}", "year": _year(meta.get("Published")),
                     "excerpt": _excerpt(doc.page_content)})
    return rows


def _pubmed_results(wrapper: Any, query: str) -> list[dict]:
    rows = []
    for item in wrapper.load(query)[:MAX_RESULTS]:
        uid = str(item.get("uid") or "").strip()
        if not uid.isdigit():
            continue
        rows.append({"title": item.get("Title") or "PubMed article", "source": "pubmed",
                     "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/", "year": _year(item.get("Published")),
                     "excerpt": _excerpt(item.get("Summary"))})
    return rows


_FETCHERS: dict[str, Callable[[Any, str], list[dict]]] = {
    "wikipedia": _wikipedia_results, "arxiv": _arxiv_results, "pubmed": _pubmed_results,
}


def run_search(source: str, query: str, wrapper: Any, timeout_s: float = SEARCH_TIMEOUT_S) -> dict:
    """One bounded search; never raises. Status is FOUND, NO_RESULTS or UNAVAILABLE."""
    query = _clean_query(query)
    base = {"source": source, "query": query}
    if not query:
        return {**base, "status": "NO_RESULTS", "results": []}
    _install_http_timeouts()
    future = _EXECUTOR.submit(_bounded_fetch, source, wrapper, query)
    try:
        results = future.result(timeout=timeout_s)
    except FutureTimeout:
        future.cancel()
        return {**base, "status": "UNAVAILABLE", "reason": "timeout", "results": []}
    except Exception:
        return {**base, "status": "UNAVAILABLE", "reason": "error", "results": []}
    return {**base, "status": "FOUND" if results else "NO_RESULTS", "results": results}


def build_research_tools(wrappers: Mapping[str, Any] | None = None,
                         timeout_s: float = SEARCH_TIMEOUT_S) -> list[BaseTool]:
    """The three search tools. `wrappers` maps source -> API wrapper (defaults are real, lazy)."""
    cache: dict[str, Any] = dict(wrappers or {})

    def wrapper_for(source: str) -> Any:
        if source not in cache:
            cache.update({key: value for key, value in default_wrappers().items() if key not in cache})
        return cache[source]

    def make(source: str) -> BaseTool:
        name = SOURCE_NAMES[source]

        def search(query: str) -> str:
            return json.dumps(run_search(source, query, wrapper_for(source), timeout_s), ensure_ascii=False)

        search.__name__ = TOOL_FOR_SOURCE[source]
        search.__doc__ = (f"Search {name} for the given clinical/biomedical query (plain terms only, no patient "
                          f"or project details). Returns up to {MAX_RESULTS} results with title, link, year and "
                          "excerpt, or status UNAVAILABLE/NO_RESULTS.")
        return tool(search)

    return [make(source) for source in SOURCES]


RESEARCH_SUBAGENT_NAME = "research"
RESEARCH_DESCRIPTION = (
    "Literature and medical-reference research. Use when the workspace knowledge base has no verified protocol "
    "for the question, or when the user asks for papers, literature, evidence or sources. Give it the clinical "
    "question only (no patient, project or case identifiers). Returns a cited summary with links.")
RESEARCH_PROMPT = """You research a clinical/biomedical question for a cranial-reconstruction workspace.

- Search with plain clinical terms only. Never include patient, project, case or user details in a query.
- Use the available sources (Wikipedia, arXiv, PubMed). Prefer PubMed for clinical evidence. Run at most 6 searches.
- If a source is UNAVAILABLE or has no results, continue with the others and say so briefly.
- Answer in at most 180 words: a short summary with numbered citations [1], [2]… then a "Sources" list,
  one line each: [n] Title (Source, year) — URL.
- Only cite results the tools returned, with their exact URLs. This is reference material, not clinical
  advice and not a verified workspace protocol; say so in one short sentence."""


def research_subagent(tools: list[BaseTool]) -> dict:
    """Declarative Deep Agents subagent spec (bounded: 5 model calls, 6 searches per delegation; R8)."""
    from langchain.agents.middleware import ModelCallLimitMiddleware, ToolCallLimitMiddleware

    from skullfix_ai.agent.gemini_graph import tool_error_middleware

    return {
        "name": RESEARCH_SUBAGENT_NAME,
        "description": RESEARCH_DESCRIPTION,
        "system_prompt": RESEARCH_PROMPT,
        "tools": tools,
        "middleware": [ModelCallLimitMiddleware(run_limit=5, exit_behavior="error"),
                       ToolCallLimitMiddleware(run_limit=6, exit_behavior="error"),
                       tool_error_middleware()],
    }
