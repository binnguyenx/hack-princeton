# Intent: Software app model (domain + persistent CRUD)

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted  
Parent: [3d-bone-editor README](../README.md)

## Problem

The product has no trustworthy **application model** for cranioplasty work: projects, cases, samples (source anatomy), implant candidates, and candidate revisions. Today state is mostly ephemeral in-memory ops, with incomplete disk stubs (`app/server/storage.ts`, fire-and-forget `/api` client) that do not form a real backend. Refreshing the browser or restarting the app cannot reliably restore the study. Without this model, management UI and canvas tools have nothing durable to attach to.

## Desired outcome

A local, persistent **software app model** that:

- Owns the records: User (seed local-dev), Project, Case, Sample (with protected source anatomy + spatial metadata), Candidate, Candidate revision.
- Supports full CRUD for those business entities with **SQLite for metadata** and **local filesystem for NRRD bytes** under `data/storage/`.
- Exposes a clear API (dev-server middleware or equivalent) so the app and tests can create, list, retrieve, update pointers (e.g. current revision), and delete (if accepted) without relying on chat-only stubs.
- Survives refresh/reopen: what you created is still there with the same IDs and ownership.
- Keeps NRRD authoritative for anatomy bytes; does not invent canvas tools or React chrome in this unit.

After this ships, a developer can exercise the model with tests/API alone and prove project → case → sample → candidate → revision persistence before any polished UI.

## Affected users and systems

Biomedical engineers (and later surgeons) need durable case data. Coding agents need inspectable on-disk records. Touches expected areas: domain types, persistence/storage, HTTP or Vite-middleware API, Vitest at the storage/API seam. Does **not** own management React pages or the 3D viewport.

## Constraints

- Local-first; no cloud sync or auth product in this unit.
- Same conceptual ownership rules as the product: candidate belongs to one sample; revisions belong to one candidate; source anatomy is protected (no “edit source” via this CRUD).
- Prefer one persistence layout and one API surface; do not maintain a second conflicting store “for demos.”
- Existing incomplete stubs may be finished or replaced — do not leave two half-backends.

## Out of scope

- Business management UI (tables, dialogs, Atlassian chrome) → `business-ui`
- Canvas tool behavior (transform Apply, restore, select, camera) → `canvas-tools`
- Viewport rendering, GLB/smooth display, tool rail chrome → `canvas-viewport`
- Portable zip package UX polish beyond what the model needs to load/save bytes (can defer package export to a later amendment if disk store is enough for v1)
- AI, measure, annotate, sculpt, cloud

## Open questions

1. ~~Delete~~ → **Yes in v1** (see Amendments).
2. **API shape:** leave to plan (Express-on-Vite vs plain handlers).
3. ~~Portable package~~ → `data/storage/` is primary for this unit; package export deferred (see spec D3).
4. ~~Entities~~ → **Confirmed:** User, Project, Case, Sample (+ source anatomy), Candidate, Candidate revision (see Amendments).
5. ~~Candidate at R0~~ → **Reference sample volume + pose** (no byte copy at candidate creation for v1).

## Amendments

2026-11-14 — Product owner: **delete in v1**; **confirm entities** as listed in Desired outcome (User, Project, Case, Sample/source anatomy, Candidate, Candidate revision).
2026-11-14 — Product owner: use **SQLite for metadata** and **local filesystem for NRRD binaries** in v1.
2026-11-14 — Product owner: candidate revision **R0 references the sample volume + pose** (no candidate byte copy in this unit).
