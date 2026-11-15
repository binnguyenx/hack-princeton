# Spec: Canvas bookmark bar (multi-document tabs)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14 (Close)

## Summary

The 3D Studio document strip is a VS Code–like bookmark bar: scrollable sample/candidate tabs, a **+** that opens a searchable sample picker (current project, server `q=`), switch/close with dirty Save/Discard confirm, and closing the last tab reopens the picker. Open tabs stay session-only; no new SQLite open-tab table.

## Requirements

- R1. The document taskbar shows one tab per entry in session `openDocuments`, in list order, with kind icon, label, and close control; the active tab matches `activeDocumentId` and uses distinct active chrome.
- R2. The taskbar always exposes a **+** control (including when the tab list is empty) that opens the sample picker modal for the current project. When no project is open, **+** is disabled or opening it shows a short explanation and creates no tabs.
- R3. The sample picker lists samples belonging to the **current project only**, loaded through a project-scoped search API that accepts a `q` query string. An empty `q` returns the full project sample list (bounded for UI). Non-empty `q` filters server-side by **sample display name** and **owning case name** (case-insensitive substring). Results include enough fields to render a row (sample id, display name, case id, case name) and to call `openDocument` for that sample.
- R4. Choosing a sample in the picker opens it as a **sample** tab via the existing open-document op (or focuses it if that sample id is already open), sets it active, closes the picker, and shows that sample in the canvas. The picker does not list or open candidates.
- R5. Clicking a tab activates that document via the existing set-active op; the tab scrolls into view if the strip overflows.
- R6. The tab strip scrolls horizontally when tabs overflow the available width.
- R7. Closing a **clean** (not dirty) tab removes it via the existing close-document op immediately. If other tabs remain, the active document follows the existing close semantics (activate another remaining tab). If the closed tab was the last one, the sample picker opens automatically (same modal as **+**).
- R8. Closing a tab while session `dirty` is true does **not** close immediately. A brief central modal offers **Save**, **Discard**, and cancel. Cancel leaves tabs and dirty state unchanged. Discard clears session dirty without requiring a package write, then completes the pending close (including last-tab → picker per R7). Save runs the same save path as the app Save control; on success it clears dirty and completes the pending close; on save failure the tab stays open, dirty stays true, and the user sees a failure message.
- R9. Opening a sample that is already open must not create a duplicate tab; it only activates the existing tab (R4).
- R10. `(added)` If a sample is deleted from management while a tab for that sample is open, that tab is closed (and if it was last, R7 picker behavior applies). A short status message explains the sample is gone. Candidate tabs whose sample was deleted follow existing cascade/UI recovery; this feature does not redefine candidate cascade.
- R11. `(added)` Auto-open-first-sample on canvas entry must not fight R7: after the user closes the last tab and the picker is shown, the app must not silently reopen a sample behind the picker in the same turn.
- R12. Management “open sample in 3D” paths remain valid and use the same open-document op (no second tab model).
- R13. No SQLite (or other durable DB) schema is added for open tab order or active tab id. Session `openDocuments` / `activeDocumentId` remain the authority while the project is loaded. Existing project-package ZIP fields for those keys may keep working but are not a new requirement of this feature.
- R14. UI chrome follows `DESIGN.md` / canvas conventions: compact taskbar; picker and dirty confirm use the existing centered dialog pattern (Radix Dialog + shared dialog CSS), not soft wellness/pill kits.

## Success criteria

- S1. Given a project with at least two samples and none open, when the user clicks **+**, searches with `q` matching one sample’s display name, and selects it, then one sample tab is active and the canvas shows that sample.
- S2. Given two open sample tabs, when the user activates the non-active tab, then `activeDocumentId` and canvas context match that sample; if the strip overflows, the active tab is scrolled into view.
- S3. Given one open clean sample tab, when the user closes it, then no tabs remain and the sample picker is open.
- S4. Given dirty session state and an open tab, when the user closes that tab and chooses Cancel, then the tab list and dirty flag are unchanged. When they choose Discard, dirty becomes false and the close completes. When they choose Save and save succeeds, dirty becomes false and the close completes.
- S5. Given sample A already open, when the user picks A again from the picker, then still exactly one tab for A and it is active.
- S6. Given `GET .../samples?q=` (exact path in Design) for the current project, when `q` matches a case name but not the sample display name, then that case’s samples appear; when `q` matches nothing, the list is empty and the UI shows an empty state (not an error).
- S7. Given an open sample tab, when that sample is deleted via the existing delete API/UI, then the tab is gone and a status message is shown.
- S8. Unit/UI tests cover taskbar **+**, picker open/search/select, dirty confirm branches, last-tab → picker, and duplicate-open focus. API tests cover `q=` match on display name and case name, empty `q`, and unknown project.

## Design

### Approach

Extend `DocumentTaskbar` and App wiring; keep `openDocument` / `closeDocument` / `setActiveDocument` as the only tab mutators. Add a sample picker dialog and a dirty-close confirm dialog (reuse the existing centered dialog structure; adapt or replace unused `ConfirmLeaveDialog` copy so it speaks to closing a document tab, not only switching projects). Add one FastAPI (and Express recovery parity if still required by contracts) project-scoped sample search route; client method calls it with `q`.

### Data

No new tables. Search reads existing `samples` + `cases` for the project. Session state unchanged in shape: `openDocuments: { kind, id }[]`, `activeDocumentId`.

### Interfaces

- `GET /api/projects/:projectId/samples?q=` → `{ samples: Array<{ id, displayName, caseId, caseName }> }` (name may be adjusted in plan to match router style; contract is project-scoped + `q`). Missing project → clear 404. Implementation lives on the live FastAPI application repository path.
- Client: `searchProjectSamples(projectId, q: string)`.
- Picker and dirty-confirm are controlled React dialogs owned by App (or a thin wrapper), not a second ops store.

### UI

- Taskbar: tabs + trailing **+**; empty state copy updated so primary path is **+** / picker, not only the management table.
- Picker: search field, scrollable results, already-open indicator optional but not required; selecting a row commits open.
- Dirty confirm: title/description about unsaved workspace edits; actions Cancel / Discard / Save (primary). Brief — no extra form fields.

### Dirty / Save meaning

Session `dirty` remains the single workspace flag (not per-tab). Today some mutations set dirty while management HTTP already persisted related data, and `onSave` may only acknowledge. For R8, Save must still go through the app Save path and, on the success path used by that control, leave `dirty === false` before the pending close runs. If Save is “already persisted,” success means acknowledge + clear dirty. Discard means clear dirty without a package write, then close.

## Where it lives

- Frontend taskbar: `app/src/ui/DocumentTaskbar.tsx`
- Picker: `app/src/ui/dialogs/SamplePickerDialog.tsx`
- Dirty close confirm: `app/src/ui/dialogs/ConfirmCloseDocumentDialog.tsx`
- Close orchestration helpers: `app/src/ops/documentTabs.ts`
- Dirty clear: `app/src/ops/session.ts` (`clearDirty`)
- Wiring: `app/src/App.tsx`, `app/src/api/client.ts` (`searchProjectSamples`), `app/src/App.css`
- Live API: `backend/ai/src/skullfix_ai/api/routes/application.py` (`GET /projects/{id}/samples`), `backend/ai/src/skullfix_ai/application/sqlite.py` (`search_project_samples`)
- Tests: `app/tests/documentTabClose.test.ts`, `app/tests/ui/documentTaskbar.test.tsx`, `app/tests/ui/samplePickerDialog.test.tsx`, `app/tests/ui/confirmCloseDocumentDialog.test.tsx`, `backend/ai/tests/integration/application/test_repository.py` (search cases)

## Decisions

- D1. Session-only tabs; no open-tab SQLite. Why: product choice; refresh does not owe restoration from DB. Alternatives: durable `project_open_documents` table.
- D2. Server `q=` search for current project samples (display name + case name). Why: product choice; scales past client-only filter of a stale full list. Alternatives: client filter of manifest only; cross-project search.
- D3. + picker is samples only. Why: product choice. Alternatives: samples + candidates in one list.
- D4. Close last tab opens picker. Why: product choice so the studio never dead-ends without an open path. Alternatives: empty bar only; block closing last tab.
- D5. Dirty close uses central Save / Discard / cancel. Why: product choice; prevents silent loss. Alternatives: close without confirm (previous behavior).
- D6. Duplicate sample open focuses existing tab. Why: VS Code file behavior; matches current `openDocument` already-open branch. Alternatives: allow duplicate tabs.
- D7. Worktree/implementation base is `main` (`feature/canvas-bookmark-bar`). Why: product choice.

## Flagged concerns

- **Resolved (intent):** Persistence, search API, close-last, dirty confirm, samples-only picker, worktree on main.
- **Save vs dirty mismatch:** Live `onSave` currently acknowledges without always clearing dirty, while several ops set `dirty: true` even when HTTP already wrote. R8 requires Save success ⇒ `dirty === false`. Build must align Save-clear behavior for this dialog without inventing a second dirty model. Prefer fixing the shared Save path so taskbar and menu stay consistent.
- **Resolved:** Express recovery skipped for `q=` (plan Deviations); FastAPI-only.
- **Resolved:** Auto-open gated with `suppressAutoOpen` / picker-open so last-tab → picker is not undone (R11).
- **Resolved:** Save clears dirty via `clearDirty` on the shared Save path.

## Open questions

(none — intent assumptions accepted: duplicate focus, `q` on display name + case name, delete-while-open auto-close, single session dirty flag)

## Out of scope

- Multi-viewport split
- Durable open-tab persistence in SQLite
- Cross-project tabs or search
- Replacing management Cases & Anatomy tables
- Drag-reorder, pin, middle-click close
- Candidates in the + picker
- Per-tab dirty or per-tab camera DB persistence
