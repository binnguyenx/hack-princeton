# Plan: Mechanical tools after portable packages

Spec: [spec.md](../spec.md) · Status: draft · Date:2026-11-14

## Approach

Implement independent vertical slices in priority order. User authorized routine decisions and automatic continuation; no approval pause, commit or push. Preserve task-start hashes (/private/tmp/hp-mechanics-before.json) and existing dirty work. Source anatomy stays immutable and AI remains metadata-only. Each task has its preflight before code and must pass its own focused proof before completion.

## Files that change

Commands/shortcuts.ts, registry.ts, App.tsx, debug/bridge.ts (R86,R87,R89); viewport/cameraMetrics.ts, Viewport.tsx, App.css (R88,R89); geometry/slicePresentation.ts, ui/SliceViewport.tsx, SliceDock.tsx, CanvasWorkspace.tsx and App volume readiness (R90); application/landmarks.py, sqlite.py, api/routes/landmarks.py, api/app.py, application_snapshot.py, schemas/workspace.py, packages.py, domain/types.ts, io/projectPackage.ts, api/landmarks.ts and compact ui/LandmarkControls.tsx/App wiring (R91–R93). Focused unit/API and actual browser tests cover R94. README/spec gap sections, PRODUCT scope reconciliation, setup/work summary/project/AGENTS and this task board report verified scope.

## Task board

- MC01 — P0, owner coordinator, dependencies none, status ready. Fix shortcut routing and safe shared debug view commands (R86,R87,R89). Accept: correct Restore/Redo/input guards, no debug in-memory mutation claims; app unit + browser parity journey.
- MC02 — P0, owner coordinator, dependency MC01, status ready. Calibrated ruler, Center and projection framing (R88,R89). Accept: numeric independent math oracle, zoom/resize browser proof, unchanged source/history.
- MC03 — P1, owner coordinator, dependency MC01, status ready. Real decoded-volume gating and slice pan/zoom/reset/interpolation/region-window/ownership (R90). Accept: mapping/range tests and real browser view/voxel invariance.
- MC04 — P1, owner coordinator, dependencies MC03, status ready. Persistent source landmarks and package/backup lifecycle (R91,R93). Accept: ownership/hash/affine/bounds/fault/restart tests, old package compatibility/new annotated marker and browser placement/delete/import. Snapshot must include annotations before any live schema initialization.
- MC05 — P1, owner coordinator, dependency MC04, status ready. Straight-line mm measurement (R92). Accept: known3-4-5 point oracle, cross-sample/invalid rejection and browser visible measurement from persisted points.
- MC06 — P2, owner coordinator, dependency MC03, status contract-blocked. Remaining oblique reformat, layers/label blending and hardware display parity. No layer/segmentation ownership/format/upload model or supported stereo/device matrix is agreed. Existing conditional controls must not substitute unrelated data. Prepare exact boundary decisions and continue independently implementable view tools in MC03.
- MC07 — P2, owner coordinator, dependency MC04, status contract-blocked. Shape/voxel editing. Accepted Slicer reference explicitly excludes sculpt/segmentation/boolean editing and requires a separate operation/reference spec. Need candidate artifact/grid/affine/pose convention, allowed edits, commit/CAS/hash and undo/recovery contract, fixture oracle and performance budget. Numeric rigid placement is not shape editing.
- MC08 — P3, owner coordinator, dependencies MC05,MC07, status contract-blocked. Real reconstruction and quality measurements. Existing shared contract explicitly leaves real method/units/inputs/reference/constraints and clinical limitations unresolved; mock cannot resolve them. Need agreed defect/ROI/rim/reference representation, reconstruction method/failure rules and quantitative fixture acceptance. Preserve mock isolation, do not invent IDs or enable AI live writes.

## Proof

Each MC task records focused red→green logs and browser assertions here. At integration: .venv/bin/python -B backend/ai/tests/run_checks.py; from app SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm test, npm run build, npm run lint, SKULLFIX_PYTHON="$PWD/../.venv/bin/python" npm run test:browser. All tests disposable. Feature checker, diff check, source/hash/history invariants and modified-doc links must pass. Reload owned local runtime only after verified backup; preserve7-day recovery retention.

## Deviations

None yet.


## Geometry contract refinement

User authorized automatic completion and routine choices; after source review, MC07/MC08 now have an implementable bounded baseline (R95–R100), rather than leaving all geometry work blocked. Implement application/voxel_operations.py, application/binary_nrrd.py, api/routes/voxel_operations.py, injected adapter registry, optional revision_operations provenance extension and package/snapshot support, plus api/voxelOperations.ts, ui/VoxelControls.tsx and App/Inspector wiring. MC07 is candidate box fill/erase; MC08 is explicit I-plane/ROI source-mirror completion. Dependency: proven MC04 backup/package extension. Additional preflight/test-first oracles precede implementation. General clinical-quality reconstruction/defect/mesh editing and unavailable slice layers/device capability decisions remain blocked, not solved by this baseline.

Reference limits: [Senck et al.,2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8450480/) discusses the limitations of mirroring for bilateral/midline damage and natural asymmetry. This implementation is an explicitly chosen deterministic index-grid prototype, not a reproduction or validation of that paper's clinical methods/results.
