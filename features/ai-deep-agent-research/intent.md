# Intent: Deep agent with a research subagent

Author: Minh Triet Nguyen · Date: 2026-11-15 · Status: accepted

## Problem
The assistant answers clinical questions only from the small curated knowledge base in `backend/ai/knowledge/`. When that misses, it falls back to "general medical knowledge" with a disclaimer and no sources. For the demo we want it to go and find real sources: research papers and medical references for the user's question, and say where the answer came from.

Our sponsor also wants the assistant built on LangChain **Deep Agents** (`deepagents`), including its subagent spawning. Today the assistant is a hand-built LangGraph tool loop with no subagents.

## Desired outcome
- The chat assistant runs as a Deep Agent. Existing workspace tools (selection, case overview, revisions, knowledge search, clinical calcs, geometry measurements) keep working.
- For a research question ("what's the infection rate for PEEK vs titanium cranioplasty?"), the main agent spawns a **research subagent**. It searches Wikipedia and arXiv (`WikipediaQueryRun`, `ArxivQueryRun`, plus PubMed if available) and returns a short cited summary.
- The agent thinking UI visibly shows: "spawned research subagent" → what it searched → "subagent returned" with a short result. Then the main agent's answer cites those sources with links.

## Affected users and systems
- Biomedical engineers and surgeons asking questions in the Assistant panel during the demo.
- `backend/ai/` agent graph, chat streaming route and dependencies; `app/src/api/chat.ts` and `app/src/ui/AiChatPanel.tsx` thinking UI.
- Specs this touches: `features/ai-workspace-assistant/spec.md` (graph, thinking events).

## Constraints
- Must use the `deepagents` library (sponsor requirement).
- Still no AI writes to application data (assistant spec R61). Subagents are read-only.
- Research results are reference material, not clinical advice. Answers keep the "verify against literature" framing.
- Live search needs internet at demo time. Tests must not need network; they use recorded or fake search results.
- Existing deterministic backend checks (`backend/ai/tests/run_checks.py`) and app tests keep passing.

## Out of scope
- The case report PDF subagent (separate feature: `ai-case-report`).
- Paid or authenticated literature databases, full-text PDF download and parsing of papers.
- Persisting research results to the app database.

## Open questions
- Add PubMed (`PubmedQueryRun`) next to Wikipedia and arXiv? arXiv has little clinical content.
- Should the research subagent run only when the main agent decides, or also from an explicit "Research this" action in the UI?
- How much of the subagent's own steps (each search query) should the thinking UI show versus just spawn/return?
- Bedrock vs Gemini for the subagent model: same provider and model as the main agent?

## Amendments
- 2026-11-15: Accepted by the owner. PubMed (`PubmedQueryRun`) is added as a third source next to Wikipedia and arXiv.
- 2026-11-15: Owner requirement: the switch to Deep Agents must be seamless. Every existing agent ability keeps working with no regressions (tools, thinking events, proposals, overlays, disclaimers, providers, conversation memory).
