# Plan: Initial 3D bone editor

Spec: [spec.md](spec.md) · Status: draft · Date: 2026-11-14

## Approach

Build a local-first browser editor on prepared NRRD volumes as the only authoritative geometry. Derive display meshes for Three.js rendering; never treat meshes as the saved source of truth. Ship the simple mechanical shell first—import, inspect, create candidate, rigid transform, revisions, portable save—and leave voxel sculpt, annotate, measure, and compare for later features.

Stack and product constraints are already recorded in [`PRODUCT.md`](../../PRODUCT.md): Vite + React + TypeScript + Three.js in `app/`. UI must follow the merged **hack-princeton** system ([`DESIGN.md`](../../DESIGN.md), [`.impeccable/design.json`](../../.impeccable/design.json), [`docs/design-conventions.md`](../../docs/design-conventions.md)); do not invent a second palette or recreate those files. Debug bridge name is `window.__hackPrincetonDebug` (do not put a product brand string in chrome; display name remains undecided per `PRODUCT.md`).

### Settled edge-case rules

1. **Unverified → createCandidate:** `createCandidate` **rejects** if the sample is not spatially verified. Caller sees a failure; no candidate or revision is created.
2. **Missing blob on open:** `openProject` is atomic. If any required volume/blob is missing or unreadable, open **fails**, reports the error, and the **previously open project (if any) stays loaded** unchanged.
3. **Unsaved switch:** UI path to open another project while dirty shows **Save / Discard / Cancel** and does not replace memory until the user chooses. Low-level `openProject` for tests/agents may replace memory directly; UI must not call that while dirty without the confirm flow.

## Files that change

- `features/3d-bone-editor/spec.md` (modified): lock NRRD-canonical decisions, multi-case + seed user, Q7-A revisions, deferred tools; retarget R7/R13/S3/S6; point R14 at existing design docs (R1–R19 as applicable)
- `docs/project.md` (modified): feature status / build-order only if still stale after the design merge
- `docs/design-conventions.md` (exists — **consume, do not rewrite**): R14 nav-vs-edit, shortcuts, selection/error states; tool rail already lists included ops
- `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `.impeccable/reference/ui-styling-medit-soft.jpg` (exists — **consume**): tokens, brand constraints, shadows/focus/motion
- `docs/ops-catalog.md` (new): every op name, inputs, target, result, failure; include `navigateCamera` (or equivalent) so R6 covers camera (R6–R7)
- `data/samples/<sample-id>/` (new): two distinct NRRD sample trees + `metadata.json` (source, license CC BY-NC-SA notes, path, reference dimensions) (R15, R2–R3)
- `data/fixtures/demo-project/` (new): seed user `local-dev`, one project, ≥2 cases preferred to prove multi-case, both samples, deterministic IDs (R1, R11, R17)
- `app/package.json` and Vite/React/TS scaffold (new): runnable frontend; CSS variables mapped from `DESIGN.md` tokens
- `app/src/domain/` (new): User, Project, Case, Sample, SourceAnatomy, Candidate, CandidateRevision types and invariants (R1, R4, R10)
- `app/src/io/nrrd.ts` (new): NRRD load, spatial metadata checks, missing-metadata failure (R2–R3)
- `app/src/io/projectPackage.ts` (new): portable save/open; failed save surfaces error and keeps session (R11–R12)
- `app/src/geometry/derivedMesh.ts` (new): isosurface/cache from volume for display only (R3, R5)
- `app/src/ops/` (new): shared ops matching the conventions tool rail — `readState`, `navigateCamera`, `importSample`, `createCandidate`, `transformCandidate`, `setVisibility`, `setInspectionPlane`, `selectObject`, `restoreRevision`, `saveProject`, `openProject` (R6–R9, R18)
- `app/src/state/store.ts` (new): in-memory open project + view state
- `app/src/viewport/` (new): Three.js scene; camera nav must not call edit ops (R5, R8)
- `app/src/ui/` (new): tool rail + optional inspector; tokens from `DESIGN.md`; controls only through `ops/` (R7, R14)
- `app/src/debug/bridge.ts` (new): `window.__hackPrincetonDebug` exposing `readState` + ops (R16–R19)
- `app/tests/` (new): domain/ops/persistence + UI interaction tests below
- `docs/dev-mcp-setup.md` (new): launch app, Playwright MCP, `__hackPrincetonDebug`, fixture paths (R19)

## Order of work

1. Align `spec.md` with settled decisions and point R14/S7 at existing `DESIGN.md` + `docs/design-conventions.md`. Leave status `draft` until product acceptance.
2. Confirm design docs need no fork: implement against current conventions; only amend `docs/design-conventions.md` if an included op or shortcut is missing from the tool rail table.
3. Download full SkullFix/SkullBreak **training** archive into `data/raw/` (gitignored + README with URL/checksum/license). Curate and commit two samples under `data/samples/` with `metadata.json` (source, **CC BY-NC-SA**, path, reference size/orientation, R3 tolerance). Build `data/fixtures/demo-project/` owned by `local-dev` with deterministic IDs; include a second case (R15, D12).
4. Scaffold `app/` (Vite + React + TS + Three.js). Wire CSS variables from `DESIGN.md`. Add domain types: one open project, many cases, sample→candidates, source protected (R1, R4).
5. Implement NRRD import + metadata verification + derived mesh generation; render both fixture samples; prove missing metadata is not marked verified (R2–R3).
6. Implement `ops/` + `readState` + `docs/ops-catalog.md`. Wire UI and `__hackPrincetonDebug` to the same functions only (R6–R9, R18).
7. Implement create candidate (volume copy → revision 0), transform Apply (revision), restore earlier revision, camera/visibility/inspection plane as view-only; Esc cancels in-progress edit without history change (R5, R9, R10; Q7-A).
8. Implement portable project save/open restoring ownership, volumes, revisions, and current revision pointers; induce a save failure path for R12 (R11–R12).
9. Build tool rail / inspector per `docs/design-conventions.md` + soft-active / Signal states from `DESIGN.md` (R14).
10. Document and verify Playwright MCP + debug bridge against fixtures (R16–R19).
11. Run the Proof section end-to-end; log drift under Deviations.

## Risks

- **Sample license (CC BY-NC-SA)** and acquisition are the schedule gate for R15. Document license in-repo; if download links fail, stop—do not fake empty NRRDs.
- **NRRD size × revisions** can blow disk when each Apply snapshots a full volume. Prefer pose deltas for transform revisions where safe; create-candidate still copies volume once.
- **Derived-mesh drift** breaks R3. Invalidate/regenerate mesh when authoritative volume or committed transform changes.
- **Nav vs edit leakage** is the highest UX/logic risk: camera drag or inspection-plane moves must never call `transformCandidate` or write revisions. Enforce in ops + Playwright.
- **Riskiest step:** shared `ops/` + revision Apply semantics. Land ops before polished UI; all logical tests call ops directly; UI tests assert chrome ↔ ops wiring.
- Deferred: planar trim, brush, preservation mask, annotate, constrain, measure, compare, in-app DICOM/raw CT, generation, auth, branching, autosave.

## Proof

### Logical / domain / ops

- R1: `ownership.test.ts` — case with two samples; two candidates on one sample; `candidate.sampleId` correct; second case on same project does not own the first case’s samples.
- R2: `nrrdImport.test.ts` — units/orientation preserved; stripped metadata → failure / `spatiallyVerified === false`.
- R3: `referenceCheck.test.ts` — bbox/spacing vs `metadata.json` within documented tolerance for both samples.
- R4: `createAndTransform.test.ts` — after transform Apply on A, source + sibling B volume hashes unchanged.
- R5: `viewOnly.test.ts` — `navigateCamera`, visibility, inspection plane leave volume hashes and revision lists unchanged.
- R6–R7: `ops-catalog` complete; `parity.test.ts` — same `transformCandidate` via ops API and via UI/bridge.
- R8: `readState.test.ts` — ids, ownership, current revision, selection, view fields; no mutation.
- R9: `failures.test.ts` — transform on source rejected; **cancel / Esc** before Apply leaves history length unchanged; invalid/missing selection rejected.
- R10: `revisions.test.ts` — two Applies → ordered revisions; `restoreRevision` restores earlier geometry; sibling untouched; **drag without Apply creates no revision**.
- R10b: after restore to an older revision, a new Apply appends history without mutating the restored snapshot’s recorded geometry (linear current-pointer + append; document in ops catalog).
- R11: `projectPackage.test.ts` — save → clear → open; ownership graph, spatial metadata, revision ids, current revision match; User `local-dev` retained.
- R11b: round-trip **volume content hash** for source and current candidate revision survives save/open.
- R12: inject write failure → `saveSucceeded === false`, session still editable.
- R13: N/A — assert no measurement APIs in ops catalog.
- R15: both sample NRRD + metadata files exist; import loads repo paths; license field present.
- Edge: corrupt/truncated NRRD → reported failure, no partial sample marked verified.
- Edge: `openProject` with missing volume blob → failure; **prior open project unchanged** (atomic open).
- Edge: `createCandidate` on unverified sample → **rejected**; no candidate row; history unchanged.
- Edge: dirty project + UI open of B → **Save / Discard / Cancel**; memory unchanged on Cancel; Discard then open replaces; Save success then open replaces.

### UI / conventions / Playwright

- R14 / S7: every tool-rail control matches `docs/design-conventions.md` included ops; tokens match `DESIGN.md` (soft-active for selection; Signal only for errors/blocking warnings).
- UI: viewport majority of first screen; no marketing dashboard modules; no hard-coded “SkullFix” product name in chrome.
- UI: active nav tool vs active edit tool both may use soft-active, but edit path still requires Apply before revision count changes.
- UI: selected object → viewport highlight + inspector identity; Signal not used for selection.
- UI: unverified sample → ink warning copy; not marked verified.
- UI: rejected op / save failure → Signal + text; geometry/history unchanged (R9/R12).
- UI: dirty session + open another project → Save / Discard / Cancel; Cancel leaves project A loaded.
- UI shortcuts: `V` select, `T` transform tool, `Esc` cancel, `⌘/Ctrl+S` save, `⌘/Ctrl+Z` → `restoreRevision` via ops; Space+drag / middle-drag pan; scroll zoom.
- UI: while focus is in a text field, plain letter shortcuts (`V`, `T`) do **not** fire; modifier shortcuts still work.
- UI: camera drag in navigate mode never increments revision count (Playwright + `readState`).
- R16–R19: `docs/dev-mcp-setup.md` — start app, Playwright open + screenshot viewport, console free of unexpected errors, `readState` via `__hackPrincetonDebug`, `createCandidate` + `transformCandidate` through bridge, save and read fixture/temp project on disk. Keep transcript.

### Commands

```bash
cd app && npm test && npm run test:integration
```

Plus the manual MCP checklist in `docs/dev-mcp-setup.md`.

## Deviations

- 2026-11-14 — Sample acquisition prioritized for **manual inspection / future training**, not app runtime store. Downloaded SkullBreak training from Zenodo (`data/raw/skullbreak_training.zip`; FIT URL 404). Curated **3** cases under `data/samples/` (parietotemporal 000, frontoorbital 001, bilateral 002). Cloud/app-package schema and “parse once” pipeline **deferred**. Spec R15 (≥2 samples for import/render) not fully discharged until app import wires to these files.
