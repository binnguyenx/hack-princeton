# Plan: AI-generated case report PDF

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-15

> Historical: implemented 2026-11-15 on `feat/deep-agent-case-report`; browser capture still needs a manual check. See Deviations.

## Approach
Mirror the existing proposal flow. A per-request `ReportSink` (store + read-only workspace access + the client's session turns) backs two subagent tools: `read_session_transcript` and `submit_report_plan`. `submit_report_plan` validates against the case and stores a plan in an in-memory `ReportStore`. The result envelope carries `report_job`. The browser renders the plan's shots offscreen, the same way the viewport renders, and uploads PNGs as multipart. The server lays out the PDF with `reportlab` and serves it per conversation. The subagent is registered by `GeminiChatAgent` only when the request carries a report sink, so agents without one are unchanged.

## Files that change
- `backend/ai/src/skullfix_ai/reports/plan.py` (new): plan schema, default shot set, validation against case objects/annotations (R4, R5)
- `backend/ai/src/skullfix_ai/reports/store.py` (new): per-conversation store, 5-report cap, capture checks, size caps (R10, R13, R14)
- `backend/ai/src/skullfix_ai/reports/pdf.py` (new): US Letter layout: cover, anatomy/repair grids, annotated pages, slice panels, findings; footer on every page (R11, R12)
- `backend/ai/src/skullfix_ai/agent/report_subagent.py` (new): `ReportSink`, subagent tools and spec (R1–R3)
- `backend/ai/src/skullfix_ai/agent/gemini_graph.py`: register `case_report` when a sink is given; `report_job` on the final event; subagent label (R1, R6, R15). Replaces the generic `extra_subagents` hook added in ai-deep-agent-research
- `backend/ai/src/skullfix_ai/api/routes/chat.py`: build the sink per request, `report_job` in the envelope (R6)
- `backend/ai/src/skullfix_ai/api/routes/reports.py` (new), `api/app.py`: capture upload, PDF, listing (R10, R13, R14)
- `backend/ai/pyproject.toml`: `reportlab==5.1.0`
- `app/src/api/chat.ts`: parse `report_job` (R6)
- `app/src/api/reports.ts` (new): upload captures, URLs (R10, R16)
- `app/src/report/captureShots.ts` (new): drive capture for a job, progress callbacks (R7, R15, R17)
- `app/src/viewport/Viewport.tsx`: offscreen capture API (separate camera + render target; per-shot object visibility; callout labels) (R7–R9)
- `app/src/ui/SliceViewport.tsx` / slice sampling: slice PNG export at a centre point (R5, R7)
- `app/src/ui/AiChatPanel.tsx`, `app/src/App.tsx`, `app/src/App.css`: client-side steps in the subagent group, report card, Try again (R15–R17)
- Tests: `backend/ai/tests/unit/reports/` (new), `backend/ai/tests/integration/api/test_reports.py` (new), `app/tests/reportCapture.test.ts` (new), `app/tests/ui/aiChatPanel.test.tsx`

## Order of work
1. Plan validation and defaults (S2).
2. Store: listing, 5 cap, cross-conversation 404 (S6, S8).
3. PDF builder: cover text, footer on every page, forbidden names absent (S3, S4).
4. Routes: capture upload checks, PDF, listing (S5, S6).
5. Subagent + sink + envelope through the chat stream (S1).
6. Frontend: `report_job` parsing, capture service with an injected renderer (S7 invariants), upload.
7. Viewport offscreen capture + slice export (manual check), report card and progress in the panel (S9).
8. Full suites, build.

## Risks
- Riskiest: offscreen capture in the real viewport (step 7). Mitigation: keep the capture service pure behind a small renderer interface and unit-test the invariants; the WebGL part gets a manual check.
- A model producing a malformed plan: validation errors go back to the subagent as fixable messages; default shots reduce what it must produce.
- PDF size: PNGs are capped at 2 MB each / 24 MB per report; the PDF is capped at 30 MB.

## Proof
- R4, R5, S2: `backend/ai/tests/unit/reports/test_plan.py`
- R13, R14, S6, S8: `backend/ai/tests/unit/reports/test_store.py`, `test_reports.py`
- R11, R12, S3, S4: `backend/ai/tests/unit/reports/test_pdf.py` (text extracted with `pypdf` in tests)
- R10, S5: `backend/ai/tests/integration/api/test_reports.py`
- R1–R3, R6, S1: `test_reports.py` chat-stream case with a scripted model (R2: the subagent's tools are the read-only workspace tools plus `list_case_annotations`, `read_session_transcript`, `submit_report_plan`; `test_s2_invalid_plan_goes_back_to_the_subagent_and_stores_nothing` proves it writes nothing to the store on error)
- R7, R8, R9, S7: `app/tests/reportCapture.test.ts` + manual check in the app
- R15, R16, R17, S9: `app/tests/ui/aiChatPanel.test.tsx` (`case report card` suite: progress in the group, Open PDF / Download, Try again)
- R18: all of the above run offline

## Deviations
- Capture code lives in new modules `app/src/viewport/reportCapture.ts` (camera, callouts, PNG) and `app/src/report/slicePanel.ts` (three-slice panel, centre resolution) rather than inside `SliceViewport.tsx`; `Viewport.tsx` only exposes `reportCaptureApiRef`. Same behaviour, testable pure parts.
- `submit_report_plan` fills the reference layout when `shots` is empty (recorded in the spec's Design); `list_case_annotations` added as a subagent tool (marked `(added)` in R2).
- The case report subagent is registered by `GeminiChatAgent` only when the request carries a `ReportSink` (the chat routes always pass one). This replaced the generic `extra_subagents` constructor hook from ai-deep-agent-research, which was removed.
- Existing route-inventory test (`backend/ai/tests/integration/api/test_app.py`) gained the three new report routes. `backend/ai/tests/run_checks.py` now also discovers `unit/reports`. `app/tests/chatStreamMock.ts` allows `subagent` thinking items.
- "defect" slice centre and per-shot object visibility differ from the original design (see spec Flagged concerns).
- A client-side capture failure is not reported to the server; the report stays `needs-captures` until a retry uploads.
- The cover drops the duplicate "Generated by" table row; the line "Generated by: AI assistant (demo)" stays.
