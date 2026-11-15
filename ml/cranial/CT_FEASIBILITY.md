# Predicting a fix from a CT scan: feasibility note

Status: written answer only. Nothing is built for CT (cranial-reconstruction-candidate R22).

## Short answer

Possible, but not supported. The model takes a binary bone mask, not CT intensities. A CT path would turn the scan into a mask first and then run the same model. The output would have no measured accuracy until it's scored on real cases.

## Why it's plausible

SkullBreak's masks came from thresholding CQ500 head CTs. A mask made the same way from a new CT is close to the training input in form: binary bone, roughly the same skull extent.

## Steps a CT path would need

1. Read the CT with its spacing, origin and direction (DICOM series or NRRD in Hounsfield units).
2. Threshold bone at about 300 HU or more. The exact value needs a small check on known scans.
3. Keep the largest connected component that is the cranium.
   - Remove the scanner table, head holder and any metal.
   - Cut away the mandible and facial bones below a plane fitted to the skull base, because SkullBreak skulls stop there.
4. Fill small holes and remove specks, sized in millimetres rather than voxels.
5. Save as a binary uint8 NRRD with the CT's geometry. The current pipeline (`predict.py`, the app's `reconstruct.model` operation) takes it from there unchanged.

## Risks

- **Real defects aren't synthetic.** SkullBreak holes have clean, generated edges. Surgical defects have bevelled, irregular or partly healed rims, and sometimes plates or mesh.
- **Noisier masks.** Thin temporal bone falls below the threshold. Beam-hardening and metal streaks add false bone.
- **Field of view.** Partial scans, a tilted gantry, or a skull cut by the scan edge break the "whole cranium" assumption.
- **Other anatomy.** Leftover face or neck bone sits outside anything the model has seen.

## What would have to be measured before claiming it works

- Score the model on real defect cases with expert implants on the same grid, for example MUG500+ B (`features/ml-model` R15). Report Dice and HD95 next to the synthetic test result.
- Report how often the CT-to-mask step itself fails, as a separate failure count.
- Until then, the app should label any CT-derived fix "not evaluated on real scans".
