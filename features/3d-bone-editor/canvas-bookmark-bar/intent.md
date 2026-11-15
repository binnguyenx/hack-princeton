# Intent: Canvas bookmark bar (multi-document tabs)

Author: product (chat) · Date: 2026-11-14 · Status: accepted

## Problem

The 3D Studio already shows a single-row document taskbar (sample/candidate tabs with close and dirty affordance), but opening another anatomy still depends on the management table path. Operators cannot treat the bar like a VS Code bookmark/tab strip: there is no durable “+ open more” affordance next to the tabs, no in-bar search of samples in the project store, and no clear multi-canvas switch/close/scroll workflow when several documents are open. Horizontal overflow exists in CSS in places, but the product behavior (empty bar, +, picker modal, search, activate, close, scroll active into view) is not specified as one system.

## Desired outcome

In 3D Studio, the top document strip behaves like a bookmark bar:

1. Each open document tab shows icon, label, and close (X), with clear active vs inactive chrome. The **+** picker opens **samples only**; candidate tabs may still appear when opened through existing non-picker paths.
2. Beside the tab list there is a **+** control. Clicking it opens a central modal listing samples in the **current project**, with a search field backed by a **`q=` API** (not client-only filtering of a stale full list).
3. Choosing a sample opens it as a tab (or focuses it if already open) and makes it active; the 3D canvas shows that sample’s context.
4. Clicking a tab switches the active canvas. Closing a **dirty** tab opens a brief central confirm: **Save**, **Discard**, or cancel. Closing a clean tab closes immediately.
5. Closing the **last** tab auto-opens the sample picker (same modal as +).
6. When tabs overflow, the bar scrolls horizontally; activating a tab scrolls it into view.

After this ships, an engineer can open several samples from the bar alone, switch and close them without management chrome, search samples via the API when the project is large, and never lose unsaved work on close without an explicit Save/Discard choice.

## Affected users and systems

- Biomedical engineers using 3D Studio / canvas workspace.
- Touches: `DocumentTaskbar` (+, scroll-into-view), sample picker modal, dirty-close confirm modal, App wiring for open/activate/close, session `openDocuments` / `activeDocumentId`, and a project-scoped sample search HTTP endpoint (`q=`) on the FastAPI/application repository path.
- Design system: `DESIGN.md` canvas chrome; modals stay compact and central (management Radix patterns OK for dialogs).
- Neighbor features: `canvas-workspace` taskbar contract; `software-app-model` sample metadata; `business-ui` open-from-table remains valid.

## Constraints

- **Session-only tabs:** open tab order and active id live in editor session state. No new SQLite table for open documents. Refresh does not owe tab restoration from the DB (package ZIP may still carry `openDocuments` if that path already does; that is not a new persistence feature).
- **Search:** current-project samples only, via server `q=` query. No cross-project search in this unit.
- **+ picker:** samples only. Candidates are out of the picker.
- Prefer extending existing `openDocument` / `closeDocument` / `setActiveDocument` ops.
- Source anatomy stays protected; opening a tab does not mutate NRRD bytes.
- Worktree stays on `main` (`feature/canvas-bookmark-bar`).
- No commit/push unless asked.

## Out of scope

- Multi-viewport split (two 3D views at once).
- SQLite (or other durable) open-tab persistence across restart.
- Cross-project tabs or cross-project sample search.
- Replacing management Cases & Anatomy tables.
- Drag-reorder, pin, middle-click close.
- Candidate entries in the + picker.
- Per-tab camera persistence as a DB entity.

## Open questions

(none — resolved into spec Decisions D2/D5/D6 and requirements R8–R10)

## Amendments

2026-11-14 — Product: session-only tabs; project sample search via `q=` API; close-last auto-opens picker; dirty close uses brief central Save / Discard / cancel confirm; worktree stays on `main`; + picker is samples only.
