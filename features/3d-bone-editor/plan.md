# Plan: Initial 3D bone editor

Spec: [spec.md](spec.md) · Status: draft · Date: 2026-11-14

## Approach

Build a local-first browser editor on prepared NRRD volumes as the only authoritative geometry. Derive display meshes for Three.js rendering; never treat meshes as the saved source of truth. Ship the simple mechanical shell first—import, inspect, create candidate, rigid transform, revisions, portable save—and leave voxel sculpt, annotate, measure, and compare for later features. Prefer Vite + React + TypeScript over a desktop shell so Playwright MCP can drive the UI without extra runtime setup.

## Files that change

- `features/3d-bone-editor/spec.md` (modified): lock NRRD-canonical decisions, multi-case + seed user, Q7-A revisions, deferred tools; retarget R7/R13/S3/S6 (R1–R19 as applicable)
- `docs/project.md` (modified): feature status and build-order note for this editor
- `docs/design-conventions.md` (new): layout, selection vs navigation, shortcuts, error states (R14)
- `data/samples/<sample-id>/` (new): two distinct NRRD sample trees + `metadata.json` (source, license, path, reference dimensions) (R15, R2–R3)
- `data/fixtures/demo-project/` (new): seed user `local-dev`, one project, ≥1 case, both samples, deterministic IDs (R1, R11, R17)
- `app/package.json` and Vite/React/TS scaffold (new): runnable frontend
- `app/src/domain/` (new): User, Project, Case, Sample, SourceAnatomy, Candidate, CandidateRevision types and invariants (R1, R4, R10)
- `app/src/io/nrrd.ts` (new): NRRD load, spatial metadata checks, missing-metadata failure (R2–R3)
- `app/src/io/projectPackage.ts` (new): portable save/open; failed save surfaces error and keeps session (R11–R12)
- `app/src/geometry/derivedMesh.ts` (new): isosurface/cache from volume for display only (R3, R5)
- `app/src/ops/` (new): shared operations (`readState`, `importSample`, `createCandidate`, `transformCandidate`, `setVisibility`, `setInspectionPlane`, `selectObject`, `restoreRevision`, `saveProject`, `openProject`) with validation and failure results (R6–R9, R18)
- `app/src/state/store.ts` (new): in-memory open project + view state
- `app/src/viewport/` (new): Three.js scene, camera nav, selection, inspection-plane clip (R5, R8)
- `app/src/ui/` (new): controls bound only through `ops/` (R7, R14)
- `app/src/debug/bridge.ts` (new): `window.__hackPrincetonDebug` exposing `readState` + ops for agents (R16–R19)
- `app/tests/` (new): domain/ops/persistence tests mapped to requirements below
- `docs/dev-mcp-setup.md` (new): launch app, Playwright MCP, debug bridge, fixture paths (R19)

## Order of work

1. Align `spec.md` with the settled decisions in this plan (NRRD-canonical, multi-case, seed user, included ops, deferred sculpt/annotate/measure). Leave status `draft` until product acceptance.
2. Write `docs/design-conventions.md` with the minimal nav-vs-edit and shortcut rules before UI chrome (R14).
3. Acquire and commit two licensed SkullFix/SkullBreak-style NRRD samples under `data/samples/`, each with `metadata.json` (source, license, local path, reference size/orientation). Build `data/fixtures/demo-project/` owned by `local-dev` (R15).
4. Scaffold `app/` (Vite + React + TS + Three.js). Add domain types and pure invariants: one open project, many cases, sample→candidates, source protected (R1, R4).
5. Implement NRRD import + metadata verification + derived mesh generation; render both fixture samples; prove missing metadata is not marked verified (R2–R3).
6. Implement `ops/` + `readState` with documented inputs/targets/failures. Wire UI and debug bridge to the same functions only (R6–R9, R18).
7. Implement create candidate (volume copy → revision 0), transform Apply (revision), restore earlier revision, camera/visibility/inspection plane as view-only (R5, R10; Q7-A).
8. Implement portable project save/open restoring ownership, volumes, revisions, and current revision pointers; induce a save failure path for R12 (R11–R12).
9. Document and verify Playwright MCP + debug bridge against fixtures (R16–R19).
10. Run the Proof section end-to-end; log any implementation drift under Deviations.

## Risks

- **Sample license and acquisition** are the schedule gate for R15. If SkullFix download links fail, stop and pick another CQ500-derived licensed subset before coding import tests against fake empty files.
- **NRRD size × revisions** can blow disk when each Apply snapshots a full volume. Mitigate for this phase by limiting demo revisions in fixtures and documenting that transform may store pose deltas plus a base volume where safe; create-candidate still copies volume once.
- **Derived-mesh drift** (mesh not matching volume bounds) breaks R3. Always regenerate or invalidate mesh cache when the authoritative volume or its transform changes; never save mesh as source anatomy.
- **Riskiest step:** shared `ops/` + revision Apply semantics. Wrong layering lets the UI mutate volumes while the debug bridge bypasses history. Land ops before polished UI; all tests call ops directly.
- Deferred on purpose (not forgotten): planar trim, brush, preservation mask, annotate, constrain, measure, compare, in-app DICOM/raw CT, generation, auth, branching.

## Proof

- R1: `app/tests/domain/ownership.test.ts` — fixture case with two samples; two candidates on one sample; each candidate.sampleId matches.
- R2: `app/tests/io/nrrdImport.test.ts` — import with units/orientation preserved; import with stripped metadata returns failure and `spatiallyVerified === false`.
- R3: `app/tests/io/referenceCheck.test.ts` — bbox/spacing vs each sample `metadata.json` reference within documented tolerance; manual viewport check recorded in test notes for both samples.
- R4: `app/tests/ops/createAndTransform.test.ts` — after transform Apply on candidate A, source and sibling candidate B volume hashes unchanged.
- R5: `app/tests/ops/viewOnly.test.ts` — camera + visibility + inspection plane leave volume hashes unchanged.
- R6–R7: `docs/ops-catalog.md` (generated or hand-maintained from `ops/`) lists every op; `app/tests/ops/parity.test.ts` runs `transformCandidate` via ops API; UI path uses the same function (integration or bridge call).
- R8: `app/tests/ops/readState.test.ts` — returns ids, ownership, current revision, selection, view fields without mutation.
- R9: `app/tests/ops/failures.test.ts` — transform targeting source anatomy rejected; cancelled Apply leaves history length unchanged.
- R10: `app/tests/ops/revisions.test.ts` — two Applies create ordered revisions; `restoreRevision` sets current geometry to earlier revision; sibling candidate untouched.
- R11: `app/tests/io/projectPackage.test.ts` — save fixture, clear store, open; compare ownership graph, spatial metadata, revision ids, current revision.
- R12: same file — inject write failure; assert error result, `saveSucceeded === false`, in-memory project still editable.
- R13: N/A this phase (measurements deferred); assert no measurement APIs in ops catalog.
- R14: checklist against `docs/design-conventions.md` for every visible control (S7).
- R15: `test -f` both sample NRRDs and metadata; import+render test loads both paths from repo.
- R16–R19: follow `docs/dev-mcp-setup.md` — start app, Playwright open + screenshot viewport, read console, `readState` via `__hackPrincetonDebug`, `createCandidate` + `transformCandidate` through bridge, save and read `data/fixtures` or temp project files on disk. Keep command transcript as evidence.

Verification command (once scaffold exists):

```bash
cd app && npm test && npm run test:integration
```

Plus the manual MCP checklist in `docs/dev-mcp-setup.md`.

## Deviations

(none yet)
