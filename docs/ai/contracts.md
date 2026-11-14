# Shared integration contracts

Status: draft. This file names slots and labels. It is not a second copy of the requirements in `features/ai-workspace-assistant/spec.md`.

Two kinds of contract appear below.

- An **agreed contract** is required before a real measurement, edit, compare, or real reconstruction is advertised. None are agreed yet.
- A **provisional mock contract** may be written by the AI workstream so a labeled mock can exercise the generate path. It is not teammate-approved, and it is not an agreed contract.

The 3D scene is separate work. This file does not assign the real geometry or reconstruction implementation. Where a slot is unresolved, the real operation is not available.

## Request the frontend sends

| Field | Required | Status |
|---|---|---|
| `conversation_id` | yes | AI-owned id |
| `case_id` | yes | **unresolved:** who mints it |
| `selection_id` | yes | **unresolved:** teammate selection model |
| `candidate_id` | no | **unresolved:** absent when the user has only source anatomy |
| `expected_revision_id` | no | Required for edit, compare, and measurement of an existing candidate |
| `idempotency_key` | yes | AI-owned. Retries use the same key |
| `message` | yes | Natural language |

## SSE events the frontend receives

| Event | Payload |
|---|---|
| `progress` | `run_id`, `case_id`, `step` |
| `result` | `run_id`, `case_id`, `status`, `operation_id`, `revision_id`, `review`, `explanation` |
| `unavailable` | `run_id`, `case_id`, `reason` |

`status` is `completed`, `unsupported`, `stale`, or `unavailable`. `reason` for a missing operation contract is `operation-contract-missing`.

`explanation` may restate fields inside `review`. It is not a source of numbers.

## Review result

Stored by the AI package for one `revision_id`.

| Field | Status |
|---|---|
| `operation_id` | Set when a contract exists |
| `value` | Present only if the operation returned it |
| `unit` | **unresolved** until that operation's contract sets it |
| `method_id` | **unresolved** teammate method name |
| `limitation` | **unresolved** teammate text for that method |
| `source` | `tool` for an agreed real integration. `mock` or `test-double` for anything else. A mock source is not a real result |

No field in this record is a fit score or a clinical pass threshold.

## Operation slots

These ids are reserved names. A real row stays unavailable until an agreed contract is filled. The registry must not advertise a provisional mock as that real capability.

| Operation id | Intent | Contract |
|---|---|---|
| `measure.candidate` | First **real** integration. One measurement of the current revision. | **Agreed contract unresolved.** Method, unit, inputs, and limitation are not defined. A test double may appear in tests. It does not complete this milestone. |
| `generate.candidate` | One candidate from a reconstruction adapter. | **Agreed contract unresolved.** Artifact format and spatial metadata are not agreed. A later task may add a **provisional mock**: labeled `mock`, no claim of geometric quality, not a real reconstruction. Assumptions for that mock must be written next to the adapter before it is used. |
| `generate.candidate.from_contour` | Stretch. Regeneration guided by a reference contour. | **Unavailable.** Not part of the mock or the first real generation path. |
| `inspect.candidate` | Read an existing candidate after the checks the operation requires. | **Agreed contract unresolved.** Which metadata counts as compatible is not agreed. |
| `edit.local` | One supported local edit. | **Agreed contract unresolved.** Which edit, and whether preserved regions are supported, is not agreed. |
| `compare.revisions` | Compare a revision with its parent. | **Agreed contract unresolved.** Which fields a real compare returns is not agreed. |

## Workspace read

The AI package needs, for one case: source anatomy id, selection ids that belong to the case, candidate ids, the current revision id, and spatial metadata sufficient for the operation being called.

**Unresolved, and not agreed:** whether this read is in-process or HTTP, and the coordinate system and physical units on source anatomy. Do not assume millimetres or a named axis. A mock must not invent those units and then present them as measured.

## Artifact

A revision stores a path and a content hash. **Unresolved:** file format. The AI package must not invent an importer.
