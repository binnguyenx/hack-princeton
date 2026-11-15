# Intent: Import a CT series as an intensity Sample for visualization

Author: unknown · Date: 2026-11-15 · Status: accepted

## Problem
The workspace can open curated SkullBreak-style NRRD samples, but a user who has a clinical CT (typically a DICOM series) cannot turn that scan into a Sample in the same Project → Case → Sample store. Visualization work then depends on already-prepared volumes.

## Desired outcome
An engineer or user can point the product at a CT series and get a durable Sample whose source anatomy is a greyscale intensity NRRD (Hounsfield values) plus spatial metadata, stored like any other sample (`volumes/{volumeId}.nrrd`, hash, SpatiallyVerified as defined by this feature's later spec). They can open it in the existing canvas for slice / Window-Level visualization.

This is a format and import path, not a learning system. No bone mask, no missing-bone prediction.

## Affected users and systems
- Users: people inspecting cranial CTs in the editor (same audience as sample import today).
- Systems: sample create/import path and volume storage under the software app model; conversion from DICOM (or agreed CT input) to NRRD. Does not change the Candidate/revision model. Does not touch `ml/cranial` training or predict.

## Constraints
- Stay inside the existing Sample record shape (NRRD bytes + spatial metadata + hash). No parallel CT store.
- Classical conversion only for this feature.
- Source anatomy remains protected once imported (no in-place overwrite of the sample volume).
- Licenses / provenance of imported CTs must be recorded at least as well as current sample license fields allow; do not pretend hospital data is SkullBreak.
- No credentials in source.

## Out of scope
- Bone binary segmentation / SkullBreak-style masks from CT
- ML prediction of missing bone or any `ml/cranial` wiring
- Mesh/STL → NRRD voxelization
- Multi-series DICOM sorting UI beyond what is required to import one coherent volume
- Clinical validation, PHI compliance productization, cloud PACS integration
- Changing Window-Level or canvas tools themselves except as needed to open the new Sample

## Open questions
- Input surface: local DICOM folder only, single compressed archive, or also NIfTI/other greyscale volumes?
- Who runs conversion: browser, Node/Express path, or a small Python helper next to the app?
- How is `spatiallyVerified` decided when there is no curated metadata.json (self-describe from DICOM tags vs always unverified until a check exists)?
- Bit depth / dtype in the stored NRRD (keep HU as int16 vs rescale for display)?
- Does import live under software-app-model as an extension, or as its own feature folder (proposed: own folder `ct-intensity-sample-import`)?

## Amendments
2026-11-15 — Product owner accepted this intent from chat (visualization-only CT → intensity NRRD → Sample; classical conversion; no ML).
