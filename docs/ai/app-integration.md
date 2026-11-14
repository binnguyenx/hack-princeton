# App integration contract and readiness

The shipped UI/backend is the live source of truth. This document records the correction after pulling main and is the app-facing contract; standalone Python mock schemas and storage remain a separate test environment.

## Implemented app behavior

The app is Vite + React + TypeScript + Three.js. Express is mounted by app/vite-api-plugin.ts during the Vite development server. app/src/api/client.ts and App.tsx read and mutate the existing /api endpoints, then reload project state.

app/server/storageSqlite.ts owns data/storage/app-model.sqlite and volumes/*.nrrd (or HACK_STORAGE_ROOT). Its hierarchy is User → Project → Case → Sample → Candidate → CandidateRevision. Source anatomy belongs to a sample, not directly to a case. NRRD volume bytes are authoritative. Candidate revision 0 references the source volume and identity pose. Transform appends a revision using the same volume and a flat row-major 16-value pose. Restore sets currentRevisionId to an existing revision; it does not append an immutable child. The current pointer can therefore refer to a revision below the maximum order.

Actual routes include project/case/sample/candidate CRUD, GET /api/projects/:id, GET /api/samples/:id/volume, POST /api/samples/:id/candidates, POST /api/candidates/:id/transform with {pose}, and POST /api/candidates/:id/restore with {revisionId}. The live routes do not use the standalone Python command/result envelope.

Source spatial metadata is sourceAnatomy.spatial: units, optional space, sizes, spacings, bboxMm. Revisions carry id, candidateId, order, volumeId, pose, volumeHash. volumeHash is the app's raw hex string, not a Python sha256:-prefixed artifact hash. No adapter may manufacture an anatomy revision id or infer revision parentage from order.

The browser publicOps/session/debug bridge also contains local editing functions for legacy sessions/tests. The management UI's current durable path is apiClient → Express → storageSqlite, followed by project reload. These two paths are not yet one shared cross-runtime operation service. Do not route AI writes through the legacy browser cache or a second Python candidate store.

## Implemented AI alignment

schemas/workspace.py models the actual app manifest and retains additive fields. Camel-case aliases preserve app metadata on serialization. AppWorkspaceAdapter resolves a fresh project manifest into a sample/source/candidate context, verifies the ownership chain, honors currentRevisionId after restore, and optionally checks an expected revision. It preserves source spatial metadata and the selected candidate pose without claiming geometric correctness. It loads metadata only, not NRRD bytes or benchmark targets.

HttpAppManifestReader performs GET /api/projects/:id against the configured app origin. It never POSTs or reads the app database directly. Dependency-injected readers support offline fixture tests. A read is a point-in-time context snapshot, not a mutation lock.

SQLiteApplicationStorage, OperationService and DeterministicReconstructionMock are retained as an isolated Python sandbox. Their candidate ids, immutable-child commits, run ownership, synthetic JSON artifacts and result envelope are not live app records. The sandbox initializer refuses app-model.sqlite and renamed databases containing the app project/sample/volume schema before applying any schema or metadata changes. Do not connect SKULLFIX_AI_DB_PATH to the app database.

## Mutation gaps

- The app transform endpoint accepts pose but no expectedRevisionId or requestId. A GET freshness check followed by that POST is not atomic and does not prevent duplicate execution.
- The app restore contract moves a pointer; it is different from the sandbox's child-commit semantics.
- createCandidate is an initial draft referencing source anatomy, not an inferred repair or reconstruction operation.
- The app exposes sample NRRD retrieval. Python /api/artifacts/... references have no route in the app.
- No endpoint publishes a generated NRRD candidate with mock provenance, limitation and spatial metadata. The Python mock emits synthetic JSON, which must not be relabeled as NRRD or offered to the viewport as a reconstruction.
- No real measurement, local sculpt, annotation, compare, or cited-retrieval capability is present. View inspection planes do not edit geometry.

AppWorkspaceAdapter.execute_mutation explicitly raises app-mutation-contract-missing. It issues no POST and does not fall back to sandbox writes. This keeps the live app contract unchanged while avoiding a false cross-runtime capability.

## LangGraph readiness

A read-only graph with a fake model can now use live app context through AppWorkspaceAdapter. It still needs a graph plan/preflight, graph state, context assembly, a thin tool registry/facade and grounded explanation behavior. No LangGraph package or graph is implemented here.

A graph may exercise the existing Python mock service only in a clearly isolated sandbox mode. Live candidate-changing AI requires an agreed app backend operation path with atomic revision validation, accepted request identity/deduplication, generated-NRRD publication/provenance and explicit restore semantics. Automatic recovery and pre-model request claiming remain proposed R35–R39. Bedrock integration can remain a separately injected model adapter.

## Verification

- Python workspace tests validate real fixture hierarchy, source identity, raw metadata, restored-pointer selection, fresh reads, ownership/freshness rejection, mutation blocking and sandbox database protection.
- app/tests/aiWorkspaceContract.test.ts creates records through the real Node store, starts the actual Express router, and calls the Python HTTP reader. It verifies restored currentRevisionId, metadata, pose/hash and unchanged app state.
- npm test covers the existing mechanical/backend suite. npm run build regenerates public demo assets from data/fixtures and compiles the app. The generated public manifest now matches the nested sourceAnatomy.spatial form in that canonical fixture.
- No live model, real reconstruction or AI mutation was verified.
