# T1C — Foreground-volume measurement contract (decision record)

Status: **owner-accepted contract (2026-11-14)** · Runtime **unbound** · Not an implementation authorization  
This file is a **decision record**. It is not a competing specification.

## Canonical requirements

| Document | IDs / section |
|----------|----------------|
| `features/ai-workspace-assistant/intent.md` | Scoped acceptance + amendment (T1C contract only); open question 1 resolved (contract only) |
| `features/ai-workspace-assistant/spec.md` | **R70–R79**, **S51–S58** |
| `docs/ai/contracts.md` | Operation slot `measure.candidate` + section **Agreed measurement contract: foreground-volume (T1C)** |

Earlier draft pointer: `features/measure-candidate/intent.md` (folded; no second measurement behavior).

## Accepted decision sheet (seven items)

1. Metric `foreground-volume` / `candidate.foreground-volume.label-voxel.v1`.
2. `abs(det(B))` when directions valid; spacings-only iff `space directions` entirely absent.
3. Idempotency: unique `(case_id, request_id)` + persisted identity; short `BEGIN IMMEDIATE` claim/check before decode; completed equivalent retry returns stored result before freshness; in-progress → bounded wait then `request-in-progress` (HTTP 409); no ownership steal; crash → `reconciliation-required`; atomic complete + revision check.
4. Integrity: `artifact-integrity-failure` / domain `failed` / HTTP `500`.
5. Live boundary when implemented: `ForegroundVolumeService` + `POST .../measurements` + live revision-scoped storage; sandbox unbound.
6. Contract accept ≠ runtime enable (three gates); AI/chat remains read-only metadata.
7. Historical R1 after R2 current via fixture or `place_rigid`, not `edit.local`.

## Explicit non-acceptance

- No T2 / measurement implementation authorization.
- No sandbox `OperationService` binding for `measure.candidate`.
- No AI/chat measurement mutation tool.
- No acceptance of edit, inspect, compare, real reconstruction, or R35–R39 recovery.
- Overall intent/spec remain `draft`.
