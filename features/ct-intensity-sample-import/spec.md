# Spec: Import CT as intensity Sample

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-15 (Close)

## Summary
This feature turns one local CT DICOM series into a durable greyscale intensity NRRD Sample under an existing Case, using the software app model’s Sample shape. The imported volume opens in the canvas for Axial/Sagittal/Coronal slices and Window/Level. Conversion is classical. No bone mask and no ML.

## Requirements
- R1. Given an open Project and Case, a user can import one local DICOM directory that contains a single CT series and receive a new Sample owned by that Case.
- R2. The Sample’s source anatomy is an intensity NRRD file under `data/storage/volumes/{volumeId}.nrrd` with `SpatialMeta` (sizes, spacings, bboxMm; origin and direction when present in the series) and a content hash, via the existing sample-create path (`addSample` / HTTP sample create). No parallel CT table or store.
- R3. Voxel values in the stored NRRD are Hounsfield units preserved as signed 16-bit integers (`int16`), not a SkullBreak-style binary mask and not silently forced to uint8.
- R4. `(added)` Slice extraction and Window/Level for this Sample interpret the NRRD `type` and apply windowing in HU (defaults appropriate for cranial CT bone inspection). Existing uint8 curated samples keep working.
- R12. `(added)` Opening an intensity Sample also builds a 3D display mesh by thresholding HU at a cranial bone iso (default ≥300 HU). Uint8 curated mask meshing stays nonzero-solid.
- R5. `spatiallyVerified` is set true when the converter produces finite sizes, positive spacings, and a parseable patient frame (origin + direction, or an explicit documented LPS/RAS space). Incomplete or contradictory spatial tags → Sample is still created only if bytes were written, with `spatiallyVerified: false` and a recorded reason; otherwise import fails with a clear error and no Sample row / no orphan volume.
- R6. License / provenance on the Sample must not claim SkullBreak or CQ500. The create path records a caller-supplied license string (or a documented placeholder such as `user-supplied-ct`) distinct from curated sample licenses.
- R7. Import rejects inputs that are not a single coherent series (zero files, unreadable DICOM, multiple series IDs in one folder) with an error and no partial Sample.
- R8. Source anatomy remains protected after import: no API in this feature replaces the Sample volume bytes in place.
- R9. Conversion runs on the server side of the live app (Node or a local helper invoked by the server), not in the browser as the authority for volume bytes. Browser only selects the folder / uploads and displays the resulting Sample.
- R10. Failed conversion or failed volume write does not leave a Sample row pointing at a missing file (same atomicity expectation as software-app-model R13/R17).
- R11. `(added)` A small fixture DICOM series (or synthetic DICOM-like series generated in tests) is enough to prove import; real hospital PHI is not required in the repo.

## Success criteria
- S1. Given a Project/Case and a one-series DICOM fixture, when import runs, then a Sample exists with NRRD bytes on disk, matching hash, and SpatialMeta sizes/spacings matching the series.
- S2. Given that Sample open in the canvas, when the user views Axial/Sagittal/Coronal and adjusts Window/Level, then slices show greyscale anatomy (not an all-black/all-white failure from treating int16 as uint8).
- S7. `(added)` Given that Sample open in the canvas, when the fallback display mesh builds, then the 3D view shows a bone surface (not `Display mesh requires uint8 voxels`).
- S3. Given a curated uint8 SkullBreak-style Sample, when opened after this feature ships, then slice/Window-Level behavior is unchanged.
- S4. Given a folder with two DICOM SeriesInstanceUIDs, when import runs, then it fails with a clear error and no Sample / no orphan volume.
- S5. Given a conversion or volume write failure mid-import, when the operation returns, then no Sample row references a missing volume file.
- S6. Given the imported Sample’s license field, when inspected, then it is not a SkullBreak/CQ500 curated license string.

## Design

### Approach
1. Accept a local DICOM directory (upload or server path — plan chooses the HTTP shape).
2. Read one series with a classical DICOM→volume library; refuse multi-series folders.
3. Write intensity NRRD (`int16` HU) + derive `SpatialMeta`.
4. Call existing Sample create with bytes, meta, license, and verification flag.
5. Canvas document open uses the Sample volume; slice path branches on NRRD type so HU windowing works.

### Data
Unchanged ownership: Project → Case → Sample → `sourceAnatomy.volumeId`. Volume file remains authoritative NRRD bytes. No Candidate requirement to view the Sample.

### Interfaces
- New import entry point (API and/or management UI control) that ends in existing sample create.
- No change to Candidate/revision APIs.
- Canvas Window/Level must accept HU-ranged values for intensity Samples (`(added)` relative to “except as needed to open”).

### UI
Minimal: a control to import CT into the current Case and open the Sample. Management chrome follows `DESIGN.md` / business-ui patterns. No PACS browser.

## Where it lives
- `app/server/dicomToNrrd.py`
- `app/server/dicomImport.ts`
- `app/server/api.ts`
- `app/server/storageSqlite.ts`
- `app/src/api/client.ts`
- `app/src/ui/dialogs/ImportDicomDialog.tsx`
- `app/src/App.tsx`
- `app/src/ui/AppHeader.tsx`
- `app/src/ui/CaseTableView.tsx`
- `app/src/geometry/nrrdVoxels.ts`
- `app/src/geometry/slices.ts`
- `app/src/ui/SliceViewport.tsx`
- `app/tests/fixtures/dicom-series-tiny/`
- `app/tests/fixtures/dicom-series-two/`
- `app/tests/nrrdIntensitySlices.test.ts`
- `app/tests/dicomToNrrd.test.ts`
- `app/tests/dicomImport.test.ts`
- `features/ct-intensity-sample-import/`

## Decisions
- D1. Own feature folder `ct-intensity-sample-import`, not an amendment buried only in software-app-model. Why: new user capability and conversion surface. Alternatives: extend software-app-model intent only.
- D2. Input for v1 is a **local folder containing one DICOM series**. Why: matches classical SimpleITK/dcm2niix usage and intent’s “CT series.” Alternatives: zip upload, NIfTI — deferred.
- D3. Keep **int16 HU** in the stored NRRD. Why: intent asks for intensity/Hounsfield, not a display-only remap. Alternatives: uint8 rescale at import (loses HU for later work).
- D4. **Server-side** conversion is authoritative. Why: sample bytes already land through server `addSample`; keeps one write path and avoids shipping large series through fragile browser-only decode as source of truth. Alternatives: pure browser dcmjs write.
- D5. `spatiallyVerified` follows completeness of spatial tags from the series (R5), not curated `metadata.json`. Why: CT import has no SkullBreak metadata file.

## Flagged concerns
- Today’s slice pipeline (`decodeNrrdVoxels` / `extractSlice`) assumes **Uint8Array**. R3+R4 therefore require canvas work; rejecting R4 would make visualization of true HU NRRDs fail. Owner must accept R4 or change D3 to uint8 display volumes.
- Multi-frame / enhanced DICOM and gantry-tilt edge cases can break naive series readers; v1 may reject with a clear error rather than guess (carry to plan).
- Large series (hundreds of MB) need a size/time budget in the plan so the dev server does not hang silently.
- License field alone is weak provenance; good enough for hackathon local use, not a PHI product claim.

## Open questions

## Out of scope
- Bone binary segmentation / SkullBreak-style masks
- ML predict / `ml/cranial` wiring
- Mesh/STL → NRRD
- Multi-series picking UI, PACS, cloud sync
- PHI compliance productization / clinical validation
- NIfTI/other non-DICOM greyscale imports (unless added later)
- Candidate auto-create on import
