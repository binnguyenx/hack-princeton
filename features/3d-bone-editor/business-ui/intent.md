# Intent: Business UI (management surfaces)

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted  
Parent: [3d-bone-editor README](../README.md)

## Problem

Operators need an Atlassian-like way to manage cranioplasty **projects, cases, samples, and candidates** without living inside the 3D canvas. Prior work mixed this chrome into the same plan as CRUD and rendering; the shell exists in pieces but is not a Closed, trustworthy product surface wired to a real app model.

## Desired outcome

Management UI that:

- Lists and opens projects; creates cases; imports/selects samples; creates candidates; navigates Cases & Anatomy (and related management views).
- Uses `DESIGN.md` dual-register **management** language (dense tables, breadcrumbs, dialogs — not Medit soft).
- Calls the **software app model API** for all mutations and reloads server truth after each write — no `window.prompt`, no store-only stubs that lie about persistence.
- Can hand off “open in 3D” to the canvas units without implementing transform or mesh quality here.

## Affected users and systems

Engineers and surgeons browsing studies. Touches `app/src/ui/` management components, routing/shell, dialogs, plus `app/src/api/client.ts` for CRUD transport. Depends on `software-app-model` for durable truth.

## Constraints

- Follow `DESIGN.md` / `docs/design-conventions.md` for management surfaces.
- No canvas tool implementation and no NRRD meshing in this unit.
- Product display name undecided — do not hard-code SkullFix in chrome.

## Out of scope

- Disk/API implementation → `software-app-model`
- Transform / restore / revision mechanics → `canvas-tools`
- Viewport, GLB, tool rail → `canvas-viewport`
- Audit log vs candidate revision inspector split can be specified here for **UI placement**, but event persistence belongs with the app model if required

## Decisions captured for this intent

1. Build against real app-model API only.
2. Scope is full management CRUD for projects/cases/samples/candidates (canvas tooling excluded).
3. Keep management surfaces clean and minimal; avoid synthetic/fake management data.

## Amendments

_(empty until accepted)_
