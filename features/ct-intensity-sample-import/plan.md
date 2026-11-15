# Plan: Import CT as intensity Sample

Spec: [spec.md](spec.md) · Intent: [intent.md](intent.md) · Status: done · Last updated: 2026-11-15

## Approach
Add a server-side DICOM→int16-HU-NRRD converter (Python + SimpleITK, already used under `ml/cranial`) invoked from Express, then create the Sample through existing `addSample`. Extend the canvas NRRD decode/slice path so int16 volumes Window/Level in HU while uint8 curated samples stay unchanged. Prefer this over a pure-Node DICOM stack because geometry/HU correctness matters more than avoiding one subprocess for v1.

## Decisions (plan-level)
- P1. **HTTP:** `POST /api/projects/:id/cases/:caseId/samples/from-dicom` with `multipart` field `files` (one or more DICOM instances from a folder picker / `webkitdirectory`). Server writes them to a temp dir, converts, then `addSample`. No server filesystem path API in v1.
- P2. **Converter:** `app/server/dicomToNrrd.py` (new) using SimpleITK `ImageSeriesReader` → cast/rescale to HU when tags allow → write `.nrrd` + JSON sidecar of spatial fields and verification notes on stdout. Node spawns `app/cranial-env/bin/python` (fallback: `python3` with clear error if SimpleITK missing).
- P3. **Default Window/Level** for intensity Samples: bone preset **center 400 HU, width 1500 HU**; user can still drag W/L. Uint8 samples keep today’s 127.5 / 255 defaults.
- P4. **Size guard:** reject conversion if voxel count × 2 bytes exceeds **256 MiB** or series has **> 800** slices, with a clear error (no silent hang).
- P5. **Enhanced / multi-frame / gantry-tilt:** if SimpleITK cannot build one scalar volume, fail with the tool’s error string; do not invent a partial volume.
- P6. **License default:** `user-supplied-ct` when the client omits license.

## Files that change
- `app/server/dicomToNrrd.py` (new): DICOM folder → int16 HU NRRD bytes path + spatial/verify JSON (R2, R3, R5, R7, R9, R11)
- `app/server/dicomImport.ts` (new): temp dir, spawn converter, parse JSON, size guards, map to `SpatialMeta` + `spatiallyVerified` (R5, R7, R9, R10)
- `app/server/api.ts` (modified): new `from-dicom` route; keep existing NRRD `samples` POST unchanged (R1, R2, R6, R8, R10)
- `app/server/storageSqlite.ts` (modified only if license must be passed through — today `addSample` hardcodes license; extend `AddSampleArgs` with optional `license` defaulting to curated behavior for old callers) (R6)
- `app/src/api/client.ts` (modified): `importDicomSample(...)` multipart helper (R1)
- `app/src/ui/dialogs/ImportDicomDialog.tsx` (new) + wire from header/case actions next to Import Sample (R1; DESIGN.md)
- `app/src/App.tsx` (modified): open dialog, call API, load volume into session like prepared import (R1, R4)
- `app/src/geometry/nrrdVoxels.ts` (modified): return `type` + typed voxel view (`Uint8Array` | `Int16Array`) (R3, R4)
- `app/src/geometry/slices.ts` (modified): `extractSlice` / intensity range over number buffers, not uint8-only (R4, S3)
- `app/src/ui/SliceViewport.tsx` + Window/Level callers in `App.tsx` / `CanvasWorkspace.tsx` (modified): HU defaults for int16; preserve uint8 defaults (R4, P3)
- `app/src/io/nrrdParse.ts` (modified if needed): expose `type` from header for verification helpers (R5)
- `app/tests/dicomImport.test.ts` (new): HTTP/storage proofs with synthetic series (R1–R2, R5–R7, R10–R11, S1, S4–S6)
- `app/tests/nrrdIntensitySlices.test.ts` (new): int16 windowing + uint8 regression (R4, S2, S3)
- `app/tests/fixtures/dicom-series-tiny/` (new) or generator in test via `pydicom`/script: tiny single-series CT fixture (R11)
- `features/ct-intensity-sample-import/spec.md` (modified at Close): Where it lives paths locked
- `docs/project.md` (modified at Close): status → shipped when done

## Order of work
1. **Red — intensity slices:** extend decode/slice tests for int16 HU windowing and uint8 regression; confirm fail on current uint8-only path.
2. **Green — intensity slices:** implement `nrrdVoxels` / `slices` / Window-Level defaults (R4, P3).
3. **Red — converter unit:** Python script tests (or CLI invocation in Vitest setup) on tiny fixture: one series → int16 NRRD + spatial JSON; two SeriesInstanceUIDs → nonzero exit (R3, R5, R7, R11).
4. **Green — converter:** implement `dicomToNrrd.py` + size/series guards (P2, P4, P5).
5. **Red — API:** `from-dicom` integration tests: happy path Sample on disk; multi-series reject; injected write failure leaves no Sample (R1, R2, R6, R10).
6. **Green — API + storage:** `dicomImport.ts`, route, optional `license` on `addSample` (R6, R8, R9).
7. **UI:** Import DICOM dialog + App wiring (R1). Visual check against DESIGN.md (management control, not canvas chrome inventiveness).
8. **Proof run:** commands in Proof below; fix until green.
9. **Close:** verification.md + doc updates (not part of Build start).

## Risks
- **Subprocess / env drift (highest):** `cranial-env` may be missing SimpleITK on some machines. Mitigation: clear error naming the required env; document `pip install SimpleITK pydicom` for the helper; tests skip with explicit message only if marked optional — prefer generating fixture + requiring SimpleITK in CI/dev that runs these tests.
- **Endianness / NRRD type mismatch** breaking slices. Mitigation: round-trip test writes int16 NRRD and reads back known phantom values under Window/Level.
- **Large uploads** exhausting memory. Mitigation: P4 guard + multer limits aligned to 256 MiB uncompressed budget.
- **Breaking curated uint8 demos.** Mitigation: S3 regression test mandatory before UI merge.
- **License field** currently not plumbed through `addSample` — must extend carefully so existing curated imports keep their license strings.

## Proof
| Req | Verification |
|---|---|
| R1 | `cd app && npm test -- dicomImport` includes HTTP import creating a Sample under the case |
| R2 | Same test: volume file exists under storage `volumes/`, SpatialMeta sizes/spacings match fixture |
| R3 | Converter/API test: NRRD header `type: short` (or `int16`) and sample voxels include values outside 0–255 |
| R4 | `cd app && npm test -- nrrdIntensitySlices` — int16 windowing produces non-flat slice; uint8 path unchanged |
| R5 | Fixture with complete geometry → `spatiallyVerified: true`; incomplete tags fixture → false or hard fail per R5 rules |
| R6 | Imported Sample `license === 'user-supplied-ct'` (or caller override), not a SkullBreak string |
| R7 | Two-series folder → 4xx, no Sample row, no volume file |
| R8 | No new replace-volume route; existing sample APIs unchanged for in-place overwrite |
| R9 | Conversion invoked from server module (assert in unit test via stubbed spawn or integration path) |
| R10 | Fault injection on volume write → error response, no Sample metadata row |
| R11 | Fixture under `app/tests/fixtures/` (or generated in test) committed / generated without PHI |

Commands (from repo root):

```sh
cd app && npm test -- nrrdIntensitySlices dicomImport
python3 .agents/skills/intent-spec-plan/scripts/check_features.py .
```

Manual (after automated green): Import DICOM via UI on the tiny fixture, confirm Axial + Window/Level show anatomy.

## Deviations
- `app/tests/dicomToNrrd.test.ts` + `generate_dicom_fixtures.py` added alongside plan’s fixture/tests (same R3/R5/R7/R11 coverage).
- `derivedMesh.ts` builds display mesh for int16 HU via bone iso threshold (≥300 HU); uint8 curated masks unchanged. `volumeIsoMesh.ts` still uint8-only (unused by App open path).
- `pydicom` installed into `app/cranial-env` for SeriesInstanceUID counting / fixture regen (SimpleITK was already present).
- Slice buffers use `Float32Array` so HU and uint8 share one extract path; display still windows to `Uint8Array`.
