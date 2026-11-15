# Plan: Canvas bookmark bar (multi-document tabs)

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

> Historical: describes how this change was built. For how the feature works now, read spec.md.

## Approach

Keep session `openDocuments` ops as the only tab mutators. Add taskbar **+** + scroll-into-view, a sample picker dialog driven by a new project `GET .../samples?q=` on FastAPI (and Express recovery if contracts demand parity), and a dirty-close confirm that reuses the centered dialog pattern. Fix the shared Save success path so it clears `dirty`, then gate App’s auto-open-first-sample so last-tab → picker is not undone. TDD: API search and close/dirty orchestration tests first, then UI.

## Files that change

- `backend/ai/src/skullfix_ai/application/sqlite.py` (or sibling application module) (modified): project sample search by `q` on display name + case name (R3, R13)
- `backend/ai/src/skullfix_ai/api/routes/application.py` (modified): `GET /projects/{id}/samples?q=` (R3)
- `app/server/storageSqlite.ts` + `app/server/api.ts` (modified): Express recovery parity for the same route **if** contract suite still requires it (R3); otherwise document deviation
- `app/src/api/client.ts` (modified): `searchProjectSamples(projectId, q)` (R3, R4)
- `app/src/ui/DocumentTaskbar.tsx` (modified): **+**, empty-state copy, optional `onAdd`, scroll active tab into view (R1, R2, R5, R6, R14)
- `app/src/ui/dialogs/SamplePickerDialog.tsx` (new): search field + results list; samples only (R2, R3, R4, R9, R14)
- `app/src/ui/dialogs/ConfirmCloseDocumentDialog.tsx` (new) or adapt `ConfirmLeaveDialog.tsx`: Save / Discard / cancel copy for tab close (R8, R14)
- `app/src/App.tsx` (modified): wire +, picker, dirty-close pending close, last-tab → picker, delete-while-open tab cleanup, auto-open gate (R4–R12)
- `app/src/App.css` (modified): taskbar **+** and any picker list styles within existing dialog tokens (R6, R14)
- `app/src/ops/session.ts` (modified only if needed): e.g. helper to clear dirty; prefer not changing open/close semantics beyond what’s required (R7–R9)
- `app/tests/ui/documentTaskbar.test.tsx` + new UI tests for picker/dirty (R1, R2, R8)
- `app/tests/documentTabs.test.ts` (modified): last-tab behavior stays ops-level; orchestration may live in UI tests (R7, R9)
- New API tests: FastAPI and/or `app/tests/` HTTP contract for `q=` (R3, S6, S8)
- `docs/project.md` (modified): feature index row + build-order note
- `features/3d-bone-editor/canvas-bookmark-bar/{intent,spec,plan}.md` (this folder)

## Order of work

1. **Red — search API:** Add failing tests for `GET /projects/:id/samples?q=` (empty q, match display name, match case name, no match, missing project). Implement repository + FastAPI route; add Express parity only if existing contract tests require it. Wire `searchProjectSamples` on the client.
2. **Red — dirty close + last tab:** Add failing tests for close-when-dirty (cancel / discard / save success) and close-last → picker open. Align Save path so success clears `dirty`.
3. **Green — taskbar chrome:** Extend `DocumentTaskbar` with **+**, empty copy, scroll-into-view on active; CSS only within design tokens.
4. **Green — SamplePickerDialog:** Modal with `q` debounced (or submit-on-change with mild debounce), list, select → `openDocument` sample + close modal; duplicate open focuses.
5. **Green — App orchestration:** Pending close state; ConfirmCloseDocumentDialog; R7 after successful close; R11 gate on auto-open-first-sample; R10 on sample delete.
6. **Refactor:** Share dialog chrome with existing dialogs; remove duplication; run focused proof commands.
7. **Close:** Proof commands below, `check_features.py`, update spec Where-it-lives if paths moved, plan → `done`, project index status.

## Risks

- **Riskiest: Save/dirty mismatch (R8).** Shared `onSave` may not clear dirty today. Fix that path once; do not special-case only the tab dialog.
- **Auto-open vs picker (R11).** Easy to regress with a `useEffect` on empty `openDocuments`. Gate with an explicit “picker intentional” flag or skip auto-open when picker is open / just closed last tab.
- **Express parity cost.** New route may be FastAPI-only if recovery contracts are frozen; decide at step 1 and record under Deviations if skipped.
- **Wide sample lists.** Empty `q` must stay bounded/usable; if needed, cap result count in API and document in Decisions during build (do not silently drop search hits without a note).

## Proof

- R1, R2, R5, R6: `cd app && npm test -- tests/ui/documentTaskbar.test.tsx` (extended for +, active scroll class/behavior as testable)
- R3, S6: FastAPI/unit or `cd app && npm test --` targeted search/contract test file added in step 1; plus `PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/...` for the new search cases if placed there
- R4, R7, R9, R11: UI/orchestration tests for picker select, duplicate focus, last-tab opens picker, auto-open does not steal
- R8, S4: UI tests for Cancel / Discard / Save success on dirty close
- R10: unit or UI test that deleting an open sample removes its tab
- R12: existing open-from-management paths still call `openDocument` (smoke in App/document tab tests)
- R13: no migration / no new CREATE TABLE for open docs (review diff)
- R14: manual glance against `DESIGN.md` dialog + taskbar tokens
- Full focused gate before Close: `cd app && npm test -- tests/ui/documentTaskbar.test.tsx tests/documentTabs.test.ts` and the new test files named in step 1–2; `python .agents/skills/intent-spec-plan/scripts/check_features.py .`

## Deviations

- Express recovery route for `GET /projects/:id/samples` was **not** added. Live FastAPI + client are the authority; no failing Express contract forced parity on this main tip.
- Save success clears dirty via new `clearDirty` op (acknowledge already-persisted management state), matching R8 without inventing package-write semantics `onSave` never had.
- `setStoreFromManifest` preserves session open tabs when the live manifest returns empty `openDocuments` (FastAPI baseline), filtering to samples/candidates that still exist — required so refresh/delete does not wipe the bookmark bar (R10, R13).
