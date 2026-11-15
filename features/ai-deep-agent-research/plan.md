# Plan: Deep agent with a research subagent

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-15

> Historical: implemented 2026-11-15 on `feat/deep-agent-case-report`. See Deviations.

## Approach
Regression net first: the existing 193 backend tests and the offline eval harness stay as they are (R10). Swap the hand-built `StateGraph` inside `GeminiChatAgent._build` for `create_deep_agent`, using a harness profile that drops the filesystem tools and the general-purpose subagent. Then rewrite `stream_turn`'s event translation for the Deep Agents node names and subgraph namespaces. Research tools wrap the `langchain_community` API wrappers behind an injectable seam, so all new tests run offline. The frontend gets a `subagent` thinking kind, a grouped trace and safe links.

## Files that change
- `backend/ai/pyproject.toml`: pin `deepagents==0.7.38`, `langchain-community==0.4.2`, `wikipedia==1.4.0`, `arxiv==4.1.0`, `xmltodict` (R1, R11)
- `backend/ai/src/skullfix_ai/agent/gemini_graph.py`: deep agent build, harness profile, subagents, step budget, event translator with `subagent` events (R1–R9, R17)
- `backend/ai/src/skullfix_ai/agent/system_prompt.md`: delegation rules (R15)
- `backend/ai/src/skullfix_ai/tools/research_tools.py` (new): `search_wikipedia`, `search_arxiv`, `search_pubmed`, research subagent spec (R11–R14, R16)
- `backend/ai/tests/integration/api/test_deep_agent_chat.py` (new): migration invariants, subagent stream, budget (S1–S7)
- `backend/ai/tests/unit/tools/test_research_tools.py` (new): structured results, failure, query hygiene (R12, R13, R16)
- `backend/ai/tests/integration/api/test_gemini_chat.py`, `test_harness_gates.py`: bound-tool lists gain `task` only (R10)
- `app/src/api/chat.ts`: accept `subagent` thinking items (R17)
- `app/src/ui/AiChatPanel.tsx`, `app/src/App.css`: grouped subagent trace, safe links (R18, R19)
- `app/tests/aiChatClient.test.ts`, `app/tests/ui/aiChatPanel.test.tsx`: parser and rendering (S8, S9)

## Order of work
1. Pin deps in the worktree venv; confirm the baseline (193 OK, eval 18/18).
2. Red: bound-tool contract test (10 existing + `task`, no fs tools, no general-purpose subagent).
3. Build the deep agent graph; rewrite the translator for `model`/`tools` nodes; run the full suite; update only the two bound-tool assertions.
4. Red→green: the step budget maps to `model-unavailable` (S6).
5. Research tools (unit, offline) → research subagent registration → `subagent` events (S4, S5).
6. Frontend parser → trace grouping → safe links.
7. Full backend + eval harness + app suite + build.

## Risks
- Riskiest: step 3. Deep Agents middleware could reorder or add messages (patched tool calls, summarisation), changing what the scripted models see. Mitigation: run the full regression suite right after the swap, before any new feature work, and inspect any diff.
- `recursion_limit` semantics change with the extra middleware nodes. The budget is set by counting model calls, and a test pins it.
- Deep Agents' base prompt is appended to ours. Live behaviour can shift; offline tests can't see it (flagged in spec).
- Network tools in tests: never constructed with real clients in tests (injected wrappers).

## Proof
- R1, R4: `pip install -e backend/ai[test]` resolves; `test_chat_providers.py` unchanged and green
- R2, R3, S3: `test_deep_agent_chat.py::BoundToolContract`
- R5, R6, R7, S2: existing `test_gemini_chat.py`, `test_chat_context.py`, `test_geometry_tools.py` unchanged except bound lists; `test_deep_agent_chat.py::StreamShape`
- R8, S6: `test_deep_agent_chat.py::StepBudget`
- R9, S7: existing `test_harness_gates.py::StagedProposalTest`
- R10, S1: `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B backend/ai/tests/run_checks.py` + `.venv/bin/python -m pytest backend/ai/tests/eval_harness`; `git diff` on old tests shows only `task` additions
- R11, R12, R13, R14, R16, S5: `test_research_tools.py` (R12 structured results and links; R13 timeout/error → UNAVAILABLE), `test_deep_agent_chat.py::ResearchSubagent`, `::ResearchSourceDown`
- R15: `test_deep_agent_chat.py` system prompt contains delegation rule
- R17, S4: `test_deep_agent_chat.py::ResearchSubagent` stream order
- R18, S9: `app/tests/ui/aiChatPanel.test.tsx`
- R19, S8: `app/tests/ui/aiChatPanel.test.tsx` link safety
- R20: all new tests run with no network (wrappers injected)

## Deviations
- Pre-existing bug fixed in passing: `backend/ai/pyproject.toml` did not declare `numpy`/`scipy`, which `tools/geometry_measurements.py` imports, so `pip install -e 'backend/ai[test]'` produced an environment where 14 test modules failed to import. Pinned `numpy==2.5.4`, `scipy==1.18.1` (the versions already in the shared venv).
- Deep Agents' tool node does not turn tool exceptions into error ToolMessages the way `ToolNode(handle_tool_errors=True)` did; `test_discard_and_source_selection_cannot_stage` caught this. Added `tool_error_middleware()` (same `TOOL_CALL_ERROR_TEMPLATE` text) to the main agent and subagents.
- Deep Agents stores `messages` as a delta channel, so a raw `checkpointer.get()` no longer contains the transcript; the eval harness reads it that way (13/19 failed). The agent's default checkpointer is now `TranscriptCheckpointer` (an `InMemorySaver` whose `get()` rebuilds `messages`). The harness is unchanged and passes 18/18.
- The harness profile (no filesystem tools, no general-purpose subagent) is registered in Deep Agents' global profile registry under the model's provider key, once per provider, because profiles are looked up by provider for pre-built model instances.
- Step budget is enforced with LangChain's `ModelCallLimitMiddleware(run_limit=6, exit_behavior="error")` (main) and model/tool call limits on the research subagent; `recursion_limit` is a 60-step backstop.
- `GeminiChatAgent` gained one optional constructor parameter, `research_wrappers` (test injection); `build_graph`/`stream_turn` gained an optional `reports` sink (ai-case-report). Existing callers are unaffected.
- Backend tests run in a worktree-local `.venv` (gitignored) so the shared venv in the main checkout was not modified.
- `StreamShape` baseline was first written without the `step-preflight` line; verified against the pre-migration graph that the line was always there and corrected the test's expectation (no code change).
