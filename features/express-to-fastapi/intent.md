# Intent: Replace the Express application backend with FastAPI

Author: Repository owner · Date: 2026-11-14 · Status: draft

## Problem

The live application backend is implemented as an Express router mounted inside the Vite development server. The planned AI stack is Python, so keeping durable application state and later AI integration on separate backend runtimes would create duplicate ownership rules and incompatible mutation paths.

The repository already contains a Python AI sandbox, but it does not implement the live application model. Pointing the UI at that sandbox would lose the current Project → Case → Sample → Candidate → CandidateRevision contract, NRRD storage behavior, and existing data.

## Desired outcome

The UI continues to use the same `/api` URLs and sees the same accepted JSON, multipart, binary-download, revision, restore, and error behavior after the application backend moves to FastAPI. Existing SQLite records and NRRD files remain readable and writable without destructive conversion.

Python becomes the one application-backend boundary for UI and later AI integration. React, TypeScript, and Three.js remain the frontend; Vite remains frontend tooling. Direct UI actions and future AI-selected actions can then converge on the same FastAPI application services without treating the current sandbox operation service as live application storage or starting a separate AI application server.

The migration is complete when one FastAPI application owns the live database and volume root, serves the existing API and built frontend, passes compatibility and restart checks, preserves acknowledged writes through the verified rollback paths, and no longer requires Express or Multer at runtime.

## Affected users and systems

- Users creating projects, cases, samples, candidates, transforms, and restores in the React workspace.
- The React/TypeScript API client and ProjectManifest domain types.
- The Vite development and preview topology.
- The authoritative SQLite application database and local NRRD volume files.
- Existing Node HTTP, repository, mechanical, and cross-language tests.
- The Python backend package, future application repository/services, and later AI adapters.

## Constraints

- Preserve current UI behavior, `/api` paths, accepted camelCase payloads, identifiers, relationships, NRRD bytes, hashes, poses, revision ordering, and restore semantics.
- Preserve durable data. Never run destructive compatibility tests against the user's live database or volume root.
- Prefer the existing SQLite schema and volume layout during migration. Add no ORM or storage redesign without a documented need.
- Keep the live application database, isolated Python sandbox database, and future LangGraph checkpoint database separate.
- Keep the sandbox initializer's protection against opening `app-model.sqlite` or an equivalent live application schema.
- Establish reusable contract tests against Express before changing backend behavior.
- Use a separate FastAPI process and proxy `/api` from Vite during development.
- The production-style local launch uses one FastAPI application to serve both `/api` and the built frontend. API routes must take precedence over the SPA fallback.
- During parity, Express and FastAPI use separate disposable roots. At cutover and rollback, exactly one backend owns writes to the live root.
- Before live cutover, the Express → FastAPI → Express → FastAPI handoff rehearsal uses one disposable database/volume copy with sequential, never simultaneous, writers.
- A rollback after FastAPI accepts writes must preserve acknowledged post-cutover records and files. Restoring the pre-cutover backup is not the default rollback after that point.
- Do not introduce `expectedRevisionId`, `requestId`, idempotency, recovery, immutable-child, or AI retry semantics as migration parity.

## Out of scope

- Implementing FastAPI, Pydantic application models, repositories, routes, tests, or dependency changes in this planning task.
- LangGraph, LangChain, Bedrock, SSE, checkpoint persistence, or model calls.
- Live AI mutation, retry/recovery requirements, or cross-runtime operation orchestration.
- Real reconstruction, measurement, editing, inspection, comparison, contour guidance, or geometry algorithms.
- Relabeling the synthetic reconstruction mock as NRRD or as a real reconstruction.
- Redesigning the frontend, public API, database schema, file layout, or revision model.

## Open questions

1. Which current error behaviors are intentional public compatibility requirements, and which are Express or implementation defects that should change through an explicit contract amendment?
2. Should malformed spatial metadata and nonnumeric or nonfinite 16-element poses remain accepted for strict parity, or be rejected in a separately approved hardening change?
3. Should deletes of missing projects and cases remain idempotent `204` while missing samples and candidates return `404`?
4. What exact commands, port, and process supervision will implement the documented development and production-style local topology?
5. Does the live database require an explicit schema-version marker before cutover, or is unchanged-schema compatibility sufficient for the first migration?
6. How long must the Express rollback runtime remain available after FastAPI starts accepting live writes?

## Amendments

2026-11-14 — Clarified that the completed application has one FastAPI/Python backend. Express is temporary migration verification and rollback support, Vite is frontend tooling, and post-write rollback must preserve acknowledged FastAPI-era data.

2026-11-14 — Moved the cross-backend rollback rehearsal to disposable storage before live cutover. A successful live migration now ends with FastAPI running; returning live ownership to Express occurs only when rollback is conditionally triggered.

2026-11-14 — Owner authorized Phase A only: reusable HTTP contract characterization against Express with disposable storage. This does not accept D1–D5, Phases B–F, FastAPI implementation, cutover, S13, or Express removal.

2026-11-14 — Owner authorized coordinated execution of the nine-task migration/LangGraph queue, with independent work continuing around decision and live-operation gates. This supersedes the earlier Phase-A-only implementation limit for eligible development/test work. It does not accept whole draft documents, proposed hardening, a concrete live cutover, or an invented observation window.

2026-11-14 — Owner explicitly approved autonomous storage-root discovery, verified backup and live FastAPI cutover, followed by a full30-minute observation window, Express removal after the gate, and backup/independent rollback-runtime retention for7days. No commit/push. This is scoped cutover/removal authorization, not acceptance of unrelated hardening proposals.
