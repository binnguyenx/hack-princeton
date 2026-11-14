# AI backend architecture

Status: draft. This describes the AI subproject only. It does not set the product-wide stack in `docs/project.md`.

## Boundary

`backend/ai` accepts a selection and a request, loads workspace context, runs a registered operation, stores the outcome, and explains the tool result. The 3D canvas is separate work. This package does not decide who owns the real geometry or reconstruction implementation. It calls those capabilities through an adapter. It does not copy a real geometry algorithm.

## Modules

| Module | Owns | Must not own |
|---|---|---|
| `api/` | HTTP and SSE | Tool routing rules buried in route functions |
| `schemas/` | Request, event, and result types shared by API and tools | Geometry math |
| `agent/` | LangGraph steps: load, choose a tool, explain | Revision writes |
| `tools/` | One module per model-facing tool, with its input schema | Measurement formulas |
| `operations/` | Capability checks, revision checks, idempotency, calls into integrations | Bedrock client setup |
| `integrations/bedrock/` | Model calls | Case records |
| `integrations/workspace/` | Read of authoritative case state | Candidate geometry algorithms |
| `integrations/geometry/` | The reconstruction and measurement adapter. The mock is one implementation of that interface | A real geometry algorithm, or a second result schema for the mock |
| `storage/` | Review results, revision rows, artifact paths | LangGraph checkpoint blobs used as the revision log |

## Records

The intended repair, the proposed design, and the review result stay in application storage. LangGraph checkpoints live in a different SQLite file and only resume a paused run.

## Tool registry

Each tool registers a name, an input schema, a result schema, and the operation id it wraps. The graph and the API discover tools from that registry. A new capability adds one tool module and one registry entry.

## Local runtime

The first demo is a local process. FastAPI serves HTTP and SSE. SQLite holds application rows and, separately, checkpoints. Artifact files stay on the local disk. Bedrock is the model provider. LangSmith tracing is optional and off unless configured.

## Replacement

Bedrock, workspace, geometry, and storage are adapters. The agent, API, and storage depend on the shared result schema, not on mock-only fields. Replacing the reconstruction mock is a change to the adapter and the composition wiring when the shared contract still fits.

A mock or test double sets `source` to `mock` or `test-double`. That result is not a real reconstruction, a real measurement, or evidence of geometric quality. A real capability is advertised only after `docs/ai/contracts.md` marks an agreed contract. A provisional mock contract does not do that. Live checks stay opt-in.
