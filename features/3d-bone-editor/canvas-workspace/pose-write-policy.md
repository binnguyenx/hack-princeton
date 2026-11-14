# T1A — Pose-write policy (proposal)

**Status:** Proposed — not accepted. Do not treat this file as an approved contract change until explicitly reviewed.

## Scope

This policy describes how candidate pose history may be written today. It does **not** change runtime behavior. Hardening, removing, or altering `POST /api/candidates/{id}/transform` requires a separate approved compatibility change.

## Two write surfaces

| Surface | HTTP | Role |
|--------|------|------|
| **Product (manual construction)** | `POST /api/candidates/{id}/placement` | Sole **product** pose-write path: shipped UI Apply and other first-party construction flows must use this route. |
| **Legacy compatibility** | `POST /api/candidates/{id}/transform` | Remains **reachable and writable** under the frozen migration contract. Any HTTP client may call it; a source-code caller list does not block direct HTTP. |

`/placement` is not the only writable HTTP endpoint. `/transform` is still a live write path with its characterized loose contract.

## Product path: `PlacementService` + `/placement`

Public boundary: FastAPI `placement` router → `PlacementCommand` (Pydantic) → `PlacementService.execute` → repository `commit_placement` inside a transaction.

Guarantees attempted on the product path (via HTTP responses documented in `docs/ai/contracts.md`):

- Rigid pose: finite 4×4, right-handed orthonormal rotation, homogeneous bottom row `[0,0,0,1]` (`is_rigid_pose` / UI `isRigidPose`).
- Context: `project_id`, `case_id`, and candidate membership checked inside the write transaction.
- Optimistic concurrency: `expected_revision_id` must match `current_revision_id` at commit time (CAS).
- Preconditions: spatially verified sample metadata with `units: mm`; current revision must already store a valid rigid pose.
- Rejects unchanged pose relative to current revision.
- On success: append one revision (same volume id/hash), advance current pointer; source anatomy bytes unchanged.

Validation is enforced at the HTTP boundary (`PlacementCommand` and `PlacementService` revalidation). Callers should assert outcomes via `TestClient` / browser HTTP, not by assuming a specific exception type from repository methods alone.

## Legacy path: `/transform`

Public boundary: FastAPI `application` router → `commit_transform`.

Characterized baseline (frozen):

- Request: JSON `{ "pose": number[16] }` only; non-array or length ≠ 16 → `400`.
- No finiteness, rigid, ownership, CAS, or metadata gate at HTTP.
- Missing candidate → `404` (as today).
- **Non-numeric or otherwise invalid matrix elements may still be persisted** if length is 16 (migration oracle).

Existing database and manifest history **may contain poses that are not valid rigid transforms**. Product placement does not retroactively repair legacy rows.

## Callers (intent, not an access control boundary)

- **Product:** `apiClient.placeCandidate` → `/placement` (e.g. canvas Apply in `App.tsx`).
- **Legacy HTTP:** contract tests, migration e2e, packages seed, external scripts — `/transform` only where baseline behavior is required.
- **In-memory ops:** `transformCandidate` in `app/src/ops/session.ts` updates local session state for previews/tests; it is not the authoritative server product path.
- **AI / chat:** no pose mutation service registered.

Direct HTTP to `/transform` remains possible regardless of which modules import `transformCandidate` on the client.

## Proof map (existing + T1A additions)

| Concern | Existing | T1A add |
|--------|----------|---------|
| Invalid / ownership / stale (HTTP) | `test_placement.py` | — |
| Rejected writes, manifest unchanged | partial in same file | explicit unchanged-pose + revision count |
| Concurrent CAS, same expected revision | same pose twice | two **distinct** valid poses |
| Legacy transform contract | `test_repository.py`, `app/tests/backendContract/scenarios.ts` | document only; no transform hardening |
| UI Apply endpoint | `placement.e2e.ts` commit path | HTTP observe: placement yes, transform no on Apply |

Static import/grep checks do not prove runtime routing; behavioral HTTP tests do.

## Outstanding decisions (for reviewers)

1. Accept this proposal as normative for new product work (without changing `/transform`).
2. Whether to emit deprecation headers on `/transform` (would be a compatibility change).
3. Whether future non-UI writers (automation, MCP) must use `/placement` by policy only or require auth/rate limits at the edge.
4. Whether to add a read-time rigid validator for display (does not imply rewriting history).