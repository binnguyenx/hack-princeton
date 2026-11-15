# Spec: Deep agent with a research subagent

Intent: [intent.md](intent.md) · Status: accepted (owner, via /tdd implement, 2026-11-15) · Last updated: 2026-11-15

## Summary
The chat assistant's graph is rebuilt on LangChain Deep Agents (`deepagents.create_deep_agent`) with no change to anything a user or client can observe today. On top of that, the main agent can delegate to a read-only **research** subagent. It searches Wikipedia, arXiv and PubMed and returns a short cited summary. The thinking UI shows the subagent being spawned, its searches, and what it returned.

## Requirements

### Seamless migration (no regression)
- R1. The main chat agent is built with `deepagents.create_deep_agent` for both providers (Bedrock, Gemini). `deepagents` is pinned to an exact version in `backend/ai/pyproject.toml`; the existing pins (`langgraph==1.2.22`, `langchain-core` resolved 1.8.0, `langchain-aws`, `langchain-google-genai`) do not change.
- R2. The main agent is given exactly the tools it is given today, under the same names and with the same behaviour: the 7 read-only workspace/knowledge/calc tools, the 3 geometry measurement tools when geometry is available, and proposal-staging tools only when proposal factories are configured. The only addition is the Deep Agents `task` tool used to spawn subagents.
- R3. Deep Agents' built-in filesystem tools (`ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep`), any todo/planning tool, and the built-in general-purpose subagent are not available to the main agent or to any subagent.
- R4. Provider selection, `ready()` readiness checks, model factories, temperatures/timeouts, and the reported `mode` strings (`bedrock-read-only`, `gemini-read-only`) are unchanged. Subagents use the same chat model instance as the main agent.
- R5. Conversation memory is unchanged: same in-process checkpointer, same thread key (conversation + project + case + selected object + revision), same seeding of client history when the thread is empty. A subagent's internal messages are not added to the main conversation; only the `task` tool result is.
- R6. The NDJSON stream and JSON route keep their current shapes: one `metadata` line, `thinking` lines of kind `step` and `reasoning` with the same id formats, labels and result labels as today, then one `result` envelope with the same fields (`mode`, `outcome`, `limitations`, `staged_proposal`, `viewport_overlay`). Internal tool names (including `task` and the research tool names) are scrubbed from reasoning and final text as today. A name that is also an ordinary word (`task`) is scrubbed only when written as code (in backticks or as `task()`), so prose like "this task" is left unchanged.
- R7. The final answer keeps today's post-processing: the "Outside verified workspace protocols" disclaimer when the knowledge search missed, the `tools` list of tools the main agent called this turn (now possibly including `task`), the latest staged proposal, and the latest viewport overlay.
- R8. A turn stays bounded. The main agent may make at least as many model calls per turn as today (6). The research subagent is capped at 5 model calls and 6 searches per delegation. Hitting a cap ends the turn with the same `model-unavailable` outcome that today's step limit produces, never a hang.
- R9. Nothing the main agent or a subagent can call writes application data, files on disk, or the proposal store, except the existing proposal-staging tools when configured (assistant spec R61 unchanged).
- R10. Every backend suite that passes today (`backend/ai/tests/run_checks.py`, 193 tests on 2026-11-15) and the offline eval harness (`backend/ai/tests/eval_harness`) still pass. The only allowed edits to existing tests are the two exact bound-tool assertions (`test_gemini_chat.py`, `test_harness_gates.py`), which gain `task`. Every other existing assertion stays as is.

### Research subagent
- R11. A subagent named `research` is registered with the main agent. Its tools are `search_wikipedia`, `search_arxiv` and `search_pubmed` only. Each wraps the corresponding `langchain_community` API wrapper (the ones behind `WikipediaQueryRun`, `ArxivQueryRun`, `PubmedQueryRun`).
- R12. Each search tool returns structured results: up to 3 items, each with title, source (`wikipedia` | `arxiv` | `pubmed`), stable link (Wikipedia page URL, `https://arxiv.org/abs/<id>`, `https://pubmed.ncbi.nlm.nih.gov/<pmid>/`), year when known, and an excerpt capped at 800 characters.
- R13. A search that fails or exceeds 10 seconds returns a structured `UNAVAILABLE` result naming the source. The subagent continues with the other sources, and the turn completes.
- R14. The research subagent returns a summary with numbered citations `[1]`, `[2]`… and a sources list (title, source, link). It never presents results as clinical advice or as verified workspace protocol.
- R15. The main agent's instructions tell it to search the workspace knowledge base first and delegate to `research` when that search returns NOT_FOUND or when the user asks for papers, literature, evidence or sources. Its answer cites the returned sources with links.
- R16. No identifying user or project data is sent to search services. Queries contain only the research question's clinical terms. The PubMed wrapper uses a generic contact value, not a user email.

### Thinking UI
- R17. The stream adds a thinking kind `subagent`: `{type: "thinking", id, kind: "subagent", subagent: "research", phase: "spawned" | "step" | "returned" | "failed", text}`. `spawned` is emitted when the main agent calls `task`; one `step` per search ("Searching PubMed for …"); `returned` carries a one-line result (source count and first finding); `failed` carries a plain reason. Existing clients that only accept `step`/`reasoning` ignore these lines safely.
- R18. The Assistant panel renders each subagent run as a nested group in the thinking trace: a header ("Research subagent", live status), its search steps, and the returned result line. The collapsed summary counts subagent runs separately from steps.
- R19. Markdown links `[text](url)` in assistant messages render as clickable links that open in a new tab. Only `http`/`https` URLs become links; anything else stays plain text.

### Tests
- R20. All new tests run offline. The search tools accept injected fake wrappers, and the research behaviour is covered with scripted models and recorded search results.

## Success criteria
- S1. Given the current backend suites, when they run after the migration, then all pass, and the only changed assertions are the two bound-tool lists, now including `task`.
- S2. Given a scripted model that calls `describe_selection`, when a chat turn streams, then the NDJSON lines (metadata, step "Reading the selected object's metadata…", step result, result envelope) are identical to today's apart from free text.
- S3. Given the main agent and a subagent, when their bound tools are inspected, then none of `ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep` or a general-purpose subagent appears.
- S4. Given a knowledge-base miss and a scripted `task(research)` delegation with recorded arXiv and PubMed results, when the turn streams, then the client sees `subagent` lines in order spawned → step(s) → returned, and the final text contains numbered citations with `https://arxiv.org/abs/…` and `https://pubmed.ncbi.nlm.nih.gov/…` links.
- S5. Given PubMed raising a timeout, when research runs, then the PubMed step reports unavailable, the other sources are still summarised, and the turn completes with status `completed`.
- S6. Given a model that loops on tool calls, when the turn exceeds its cap, then the outcome is `unavailable` / `model-unavailable` within the cap.
- S7. Given a staged-proposal turn (proposal factories configured), when it runs on the new graph, then the proposal is staged, the application manifest is unchanged, and accept still requires the human confirmation route.
- S8. Given an assistant message containing `[PubMed](https://pubmed.ncbi.nlm.nih.gov/1/)` and `[x](javascript:alert(1))`, when it renders, then the first is a new-tab link and the second is plain text.
- S9. Given the Assistant panel receiving `subagent` lines, when the turn finishes, then the trace shows a collapsible "Research subagent" group with its steps and result.

## Design
`GeminiChatAgent` keeps its class name, module (`agent/gemini_graph.py`), constructor and public methods (`ready`, `build_graph`, `stream_turn`, `reply`, `thread_id`), so `create_app`, routes and tests are untouched. Inside `_build`, the hand-written `StateGraph` is replaced by `create_deep_agent(model, tools, system_prompt, subagents=[research], checkpointer=self.checkpointer)`. A harness profile excludes the filesystem tools and disables the general-purpose subagent (R3). The system prompt is today's prompt plus the capability block, plus a short delegation section (R15).

`stream_turn` streams with `subgraphs=True`. A single translator maps graph updates to today's events. The Deep Agents model node is named `model`, not `agent`, so the translator keys on the new name. Updates from the root namespace become today's `step`/`reasoning` events. A main-agent `task` call becomes `subagent/spawned`. Updates from a subagent namespace become `subagent/step`, and the `task` ToolMessage becomes `subagent/returned` or `failed`. Subagent reasoning is not streamed in this feature.

Research tools live in `tools/research_tools.py` and return JSON strings like the existing tools. Wrappers are injectable for tests. The frontend parser (`api/chat.ts`) accepts the `subagent` kind. `ThinkingTrace` groups subagent items by run id, and `MessageBody` gains safe link parsing.

## Where it lives
- Backend: `backend/ai/src/skullfix_ai/agent/gemini_graph.py` (deep agent build, harness profile, step budget, `tool_error_middleware`, `TranscriptCheckpointer`, event translator), `backend/ai/src/skullfix_ai/agent/system_prompt.md`, `backend/ai/src/skullfix_ai/tools/research_tools.py`, `backend/ai/pyproject.toml`
- Frontend: `app/src/api/chat.ts`, `app/src/ui/AiChatPanel.tsx`, `app/src/App.css`
- Tests: `backend/ai/tests/unit/tools/test_research_tools.py`, `backend/ai/tests/integration/api/test_deep_agent_chat.py`, `backend/ai/tests/integration/api/test_gemini_chat.py`, `backend/ai/tests/integration/api/test_harness_gates.py`, `app/tests/ui/aiChatPanel.test.tsx`, `app/tests/aiChatClient.test.ts`

## Decisions
- D1. Keep `GeminiChatAgent` and its module as the public seam; swap only the graph inside. Why: routes, `create_app`, the eval harness and ~40 tests depend on it, and "no regression" is a hard requirement. Alternatives: a new `DeepChatAgent` class plus migration of every caller (more churn, more risk).
- D2. Wrap the `langchain_community` API wrappers in our own tools rather than binding `WikipediaQueryRun`/`ArxivQueryRun`/`PubmedQueryRun` directly. Why: those return one flat string with no stable links, and citations need URLs (R12). Same underlying clients. Alternatives: raw QueryRun tools (no links), custom HTTP clients (more code).
- D3. Subagent progress is a new thinking kind (`subagent`), not reused `step` lines. Why: the UI must group and label subagent work, and old clients drop unknown kinds harmlessly. Alternatives: encode it into `step` text (not groupable).
- D4. Disable Deep Agents' filesystem tools and general-purpose subagent. Why: they add tools the model can misuse, change the bound-tool contract, and add nothing to a read-only assistant. Alternatives: keep the virtual in-state filesystem (harmless to data but noisy and confusing).
- D5. On hitting the step cap, keep today's `model-unavailable` outcome. Why: no behaviour change (R8). Alternatives: return a partial answer (a behaviour change, could be a later feature).

## Flagged concerns
- Open: live behaviour with the real Bedrock/Gemini model under Deep Agents has not been evaluated in this build (offline eval 18/18). Run `.venv/bin/python -m pytest backend/ai/tests/eval_harness --live-bedrock` before the demo.
- Two existing tests assert the exact list of bound tools. Adding subagents necessarily adds `task` to that list. R10 allows exactly this edit and nothing else. Please confirm this is acceptable.
- `deepagents` 0.7.38 installs cleanly against the current pins (checked in a scratch environment on 2026-11-15). It also pulls in `langchain` 1.5.0 and `langchain-anthropic` as transitive dependencies.
- The live research demo needs internet access to Wikipedia, arXiv and NCBI. NCBI rate-limits unauthenticated clients to about 3 requests per second.
- Deep Agents adds its own base instructions to the system prompt. Live model behaviour (how often it delegates, answer style) may shift even with identical tools. The offline harness can't catch that; run `--live-bedrock` eval once before the demo.
- AGENTS.md says the healthy backend run is 83 tests; it is actually 193. The Close step updates that line.

## Open questions

## Out of scope
- Case report subagent (`features/ai-case-report/`).
- Paid or authenticated literature sources, full-text paper download, persisting research results.
- A "Research this" button; delegation is the agent's decision in this feature.
- Streaming the subagent's own reasoning text (deferred).
