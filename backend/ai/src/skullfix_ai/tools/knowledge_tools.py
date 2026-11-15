"""Read-only retrieval over the curated clinical knowledge base (backend/ai/knowledge/*.md).

Sections are split on `## ` headings. Scoring is deterministic keyword overlap weighted by
inverse section frequency, with a boost for terms in the heading or `Keywords:` line. A hit
requires a heading/keyword match plus either two distinct keyword matches or coverage of at
least half the query terms; otherwise the tool returns NOT_FOUND so the agent
must flag any answer as outside verified workspace protocols.
"""

from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from langchain_core.tools import tool
from pydantic import BaseModel, Field

DEFAULT_KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "knowledge"
MAX_RESULTS = 3
EXCERPT_CHARS = 1800

_STOPWORDS = frozenset("""
a an and are as at be best by can could do does for from how i if in is it its me my of on or our
should than that the their them then there these this to use using vs versus was we what when which
who why will with would you your about any between case current patient please tell show give
""".split())


@dataclass(frozen=True)
class Section:
    file: str
    title: str
    heading: str
    evidence: str
    body: str
    key_terms: frozenset[str]
    terms: frozenset[str]

    @property
    def citation(self) -> str:
        return f"{self.file} § {self.heading}"


def _normalize(token: str) -> str:
    token = token.lower().strip("-")
    if len(token) > 4 and token.endswith("es") and token[-3] in "sx":
        token = token[:-2]
    elif len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        token = token[:-1]
    return token


def tokenize(text: str) -> set[str]:
    raw = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())
    tokens = set()
    for item in raw:
        tokens.add(_normalize(item))
        if "-" in item:  # "Ti-6Al-4V" also matches "ti"; "edge-to-edge" matches "edge"
            tokens.update(_normalize(part) for part in item.split("-"))
    return {token for token in tokens if token and token not in _STOPWORDS}


def knowledge_dir() -> Path:
    return Path(os.environ.get("SKULLFIX_KNOWLEDGE_DIR") or DEFAULT_KNOWLEDGE_DIR)


@lru_cache(maxsize=4)
def load_sections(directory: str) -> tuple[Section, ...]:
    sections = []
    for path in sorted(Path(directory).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^# (.+)$", text, flags=re.M)
        title = title_match.group(1).strip() if title_match else path.stem
        for chunk in re.split(r"^## ", text, flags=re.M)[1:]:
            heading, _, body = chunk.partition("\n")
            keywords = re.search(r"^Keywords:\s*(.+)$", body, flags=re.M)
            evidence = re.search(r"^Evidence:\s*(.+)$", body, flags=re.M)
            key_terms = tokenize(heading) | tokenize(keywords.group(1) if keywords else "")
            sections.append(Section(file=path.name, title=title, heading=heading.strip(),
                                    evidence=evidence.group(1).strip() if evidence else "unspecified",
                                    body=body.strip(), key_terms=frozenset(key_terms),
                                    terms=frozenset(tokenize(body) | key_terms)))
    return tuple(sections)


def search_knowledge(query: str, directory: Path | None = None) -> dict:
    sections = load_sections(str(directory or knowledge_dir()))
    query_terms = tokenize(query)
    if not sections or not query_terms:
        return {"status": "NOT_FOUND", "query": query}
    count = len(sections)
    idf = {term: math.log(1 + count / (1 + sum(term in s.terms for s in sections))) for term in query_terms}
    scored = []
    for section in sections:
        key_hits = query_terms & section.key_terms
        matched = query_terms & section.terms
        # A single generic keyword (e.g. "timing") must not ground an unrelated question.
        if not key_hits or (len(key_hits) < 2 and len(matched) / len(query_terms) < 0.5):
            continue
        score = sum(idf[t] * (3.0 if t in section.key_terms else 1.0) for t in query_terms & section.terms)
        scored.append((score, section, sorted(key_hits)))
    if not scored:
        return {"status": "NOT_FOUND", "query": query}
    scored.sort(key=lambda row: (-row[0], row[1].citation))
    best = scored[0][0]
    results = []
    for score, section, hits in scored[:MAX_RESULTS]:
        if score < 0.5 * best:
            break
        excerpt = section.body if len(section.body) <= EXCERPT_CHARS else section.body[:EXCERPT_CHARS] + " …"
        results.append({"citation": section.citation, "document": section.title, "section": section.heading,
                        "evidence": section.evidence, "matched_terms": hits, "excerpt": excerpt})
    return {"status": "FOUND", "query": query, "results": results,
            "note": "Policy-default thresholds are workspace screening defaults, not validated clinical standards."}


class SearchClinicalKnowledgeArgs(BaseModel):
    query: str = Field(min_length=1, max_length=500,
                       description="Clinical question or key terms, e.g. 'PEEK vs titanium infection' or 'sinus clearance'.")


@tool(args_schema=SearchClinicalKnowledgeArgs)
def search_clinical_knowledge(query: str) -> str:
    """Search the verified cranioplasty knowledge base (design guardrails, biomaterial evidence,
    metric formulas). Returns cited excerpts with file and section, or status NOT_FOUND when the
    topic is not covered. Call this before answering any clinical guideline, material or formula question."""
    return json.dumps(search_knowledge(query), ensure_ascii=False)


def build_knowledge_tools():
    return [search_clinical_knowledge]
