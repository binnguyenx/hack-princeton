# Spec: Software app model (domain + persistent CRUD)

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14

## Summary

Local-first domain + persistence for cranioplasty studies: projects, cases, samples (protected NRRD + spatial metadata), candidates, and candidate revisions. A single CRUD API backed by **SQLite metadata + filesystem NRRD storage** survives refresh/restart. Delete is in scope for v1. No management UI and no 3D tool/viewport behavior in this unit.

## Requirements

### Entities and ownership

- R1. The model stores these records with stable IDs across reopen: **User** (seed `local-dev`), **Project**, **Case**, **Sample** (includes protected **source anatomy**: volume bytes id + spatial metadata + hash), **Candidate**, **Candidate revision**.
- R1a. All records in R1 are persisted in **SQLite** tables as the system of record for metadata and relationships.
- R2. Ownership: a Case belongs to one Project; a Sample belongs to one Case; a Candidate belongs to one Sample; a Candidate revision belongs to one Candidate. Every Candidate exposes its owning `sampleId`.
- R3. Source anatomy is protected: no API that mutates source volume bytes or replaces a sample’s source volume in place. Edits happen only via candidates/revisions.
- R4. A Project may contain multiple Cases; a Case may contain multiple Samples; a Sample may contain multiple Candidates; a Candidate has an ordered linear revision list and a `currentRevisionId`.

### Persistence

- R5. Authoritative store is `data/storage/` using **SQLite** for metadata/index/relationships and `volumes/{volumeId}.nrrd` files for binary anatomy bytes. Refreshing the process and reading the store again yields the same IDs, ownership, and volume bytes.
- R6. NRRD volume bytes are authoritative for anatomy data in this unit. Display meshes / GLB are out of scope (canvas-viewport).
- R7. `(added)` One persistence surface only: finish or replace existing stubs (`app/server/storage.ts`, partial `api/client`) so tests and the app do not talk to two conflicting stores.
- R7a. The filesystem stores only binary volume payloads and volume-asset blobs; user/project/case/sample/candidate/revision records must not be duplicated as a second authoritative JSON store.

### CRUD API

- R8. Projects: create (name required), list summaries, retrieve full project manifest/state, **delete** (removes index entry, manifest, and volume files for that project).
- R9. Cases: create under a project (name required), list via project retrieve, **delete** (removes the case and cascades to its samples, candidates, revisions, and orphaned volumes that only those samples owned).
- R10. Samples: create/import under a case with NRRD bytes + spatial metadata + display name; record `spatiallyVerified` from supplied verification result (this unit does not define the meshing UI); retrieve metadata; stream/read raw volume bytes; **delete** (cascades candidates/revisions and that sample’s volume).
- R11. Candidates: create on a sample; reject create when the sample is not `spatiallyVerified` (no candidate or revision written); **delete** (removes candidate and all its revisions). Creating a candidate creates revision order `0` and sets `currentRevisionId` to that revision.
- R12. Revisions: append a new revision when a transform commit is recorded (pose and/or volume pointer as decided in D2); restore by setting `currentRevisionId` to an existing revision of that candidate; listing revisions for a candidate returns stable order.
- R13. Failed writes are not reported as success; a failed create/update/delete leaves the prior durable state intact (no half-written index claiming a missing project dir).

### Candidate revision 0 volume strategy

- R14. Candidate revision 0 stores a **reference** to the sample’s `volumeId` plus identity pose (no byte copy at candidate creation in this unit).

### Non-goals wired as requirements

- R15. `(added)` This unit does not require React management pages, canvas ops UX, or viewport rendering to pass its Proof. API + storage tests are sufficient.
- R16. `(added)` Proof for this unit must cover **both public seams**:
  - **Storage seam** (SQLite/filesystem adapter functions)
  - **HTTP seam** (`/api/...` contract)
  A requirement is not complete unless at least one test at each seam exercises it where applicable.
- R17. `(added)` Atomicity on NRRD operations is mandatory: sample import/delete and cascades must not leave partial metadata/file state. On failure, the prior durable state remains intact and observable from both seams.

## Success criteria

- S1. Create project → create case → import sample with NRRD bytes → create candidate on verified sample → commit one transform revision → restore earlier revision → process restart → retrieve project: same IDs, ownership, revision order, current revision, and volume bytes. Verifies R1–R6, R8–R12.
- S2. Create candidate on an unverified sample fails; no candidate/revision rows appear. Verifies R11.
- S3. Delete candidate removes its revisions only; sibling candidates and source sample remain. Delete sample cascades its candidates. Delete case cascades its samples. Delete project removes store artifacts for that id and list no longer returns it. Verifies R8–R11.
- S4. Induce a write failure (e.g. unwritable volume path) on create sample: API reports failure; project manifest does not reference a missing volume as success. Verifies R13.
- S5. After S1, only one store layout is used by the Proof tests (no second demo DB). Verifies R7.
- S6. **CRUD seam parity:** for each CRUD family (projects, cases, samples, candidates, revisions), equivalent scenario tests pass at storage seam and HTTP seam (create/list/retrieve/delete and required rejects). Verifies R8–R12, R16.
- S7. **Atomic NRRD import failure:** force a filesystem write failure during sample create/import; assert both seams show no new sample row, no orphan candidate/revision rows, and no orphan volume file. Verifies R13, R17.
- S8. **Atomic NRRD delete failure:** force a failure during sample/project delete cascade; assert operation reports failure and prior metadata/file state remains consistent (or operation completes fully if failure injection point is after final side effect). Verifies R13, R17.
- S9. **No partial serve:** read/stream NRRD for an existing sample returns full bytes with expected hash; missing file returns clear failure and does not mutate metadata. Verifies R10, R13, R17.

## Design

### Approach

Node disk I/O module + HTTP router mounted on the Vite dev server (or equivalent local middleware). Browser and Vitest call the same storage functions (tests may call storage directly; HTTP Proof at least for happy-path project CRUD). Manifest schema aligns with existing `ProjectManifest` shape where practical so canvas-tools can adopt the same records later.

### Data

| Record | Fields (minimum) |
|-|-|
| User | `id`, `displayName` — seed `local-dev` |
| Project | `id`, `ownerUserId`, `name` |
| Case | `id`, `projectId`, `name` |
| Sample | `id`, `caseId`, `displayName`, `license`, `spatiallyVerified`, `sourceAnatomy` |
| Source anatomy | `objectId`, `sampleId`, `volumeId`, `spatial`, `volumeHash` |
| Candidate | `objectId`, `sampleId`, `displayName?`, `currentRevisionId` |
| Candidate revision | `id`, `candidateId`, `order`, `volumeId`, `pose`, `volumeHash` |

Index/list data and entity relationships live in SQLite; `volumeId` points to `data/storage/volumes/{volumeId}.nrrd`.

SQLite tables are expected to map 1:1 with domain records: `users`, `projects`, `cases`, `samples`, `candidates`, `candidate_revisions`, plus a `volume_assets` table for filesystem blob references (`path`, `sha256`, `byte_size`).

### Interfaces

REST under `/api` (exact paths in plan), including delete. Transform/restore endpoints persist revision state for use by canvas-tools; they do not implement viewport Apply UX here.

### Test seams (TDD contract)

- Storage seam tests validate domain invariants and atomicity close to persistence boundaries.
- HTTP seam tests validate API status/body/failure contracts and parity with storage behavior.
- For NRRD atomic tests, failure injection must be deterministic (e.g. mock fs write/remove failure or temp-dir permission trap) so red/green is reproducible.

### UI

None in this unit.

## Where it lives

- Intent / this spec: `features/3d-bone-editor/software-app-model/`
- Domain types: `app/src/domain/types.ts`
- Disk store (target): `app/server/storage.ts`, `data/storage/`
- HTTP API (target): `app/server/api.ts`, Vite middleware plugin (path named in plan)
- Client (optional thin fetch for later UI): `app/src/api/client.ts`
- Proof tests (target): `app/tests/backendCrud.test.ts` (or successor named in plan)
- HTTP integration tests (target): `app/tests/backendApi.test.ts` (or successor named in plan)
- Manifest type reference: `app/src/io/projectPackage.ts`

## Decisions

- D1. **Delete in v1** for project, case, sample, and candidate (with cascades as in R8–R11). Why: product owner confirmed; empty trash/undo-delete deferred. Alternatives: soft-delete — deferred.
- D2. Candidate revision R0 references the sample `volumeId` + identity pose; no candidate byte copy in v1. Why: transform-only editing, lower disk use, consistent with protected source + revision pointers. Alternatives: copy bytes at candidate create (deferred to a future amendment).
- D3. `data/storage/` is the live app store for this unit with SQLite metadata and filesystem NRRD binaries. Portable zip package export/import is out of scope for v1 Proof (intent allowed deferral). Why: one operational persistence path first. Alternatives: package-as-primary — deferred.
- D4. API transport left to the plan (Express-on-Vite vs plain handlers) as long as R5–R13 hold. Why: behavior over framework.
- D5. Entities confirmed as in intent R1 table — no Task/Issue tracker entities. Why: product confirmed cranial study model.
- D6. Test strategy is two-seam by default (storage + HTTP), with atomic NRRD failure cases as first-class proof. Why: catches parity drift and half-write bugs that single-seam testing can miss.

## Flagged concerns

- Cascading delete can destroy large NRRD sets; API should be explicit (no “archive”). Confirm UX warnings live in `business-ui`, not here.
- Incomplete stubs in tree today must be consolidated (R7) or deleted in the same plan to avoid dual backends.
- `check_features.py` only scans top-level `features/*`; this category lives nested — Proof/Close still use this folder’s files manually until the script grows.
- Fault-injection hooks for filesystem failures must be designed carefully so tests prove atomic behavior instead of only proving mock behavior.

## Open questions

1. Exact REST path list and error string table — plan may fix unless product asks to lock now.
2. Should restore/transform HTTP endpoints live in this unit’s API now, or only storage helpers until canvas-tools? This spec includes them under R12 for persistence completeness; if split later, update R12 in the same change.
3. Preferred failure-injection approach for atomic fs tests (mock `fs/promises` vs temp permission barriers) can be chosen in plan.

## Out of scope

Business UI, canvas tool UX, viewport/GLB rendering, AI, measure/annotate/sculpt, cloud/auth, soft-delete/trash, rename-as-separate-feature (create-with-name only unless amended), portable package round-trip as primary store.
