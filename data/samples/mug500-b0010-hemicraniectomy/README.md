# Sample: mug500-b0010-hemicraniectomy

- **Dataset:** MUG500+ craniotomy skulls (Medical University of Graz)
- **Case ID:** B0010
- **Defect:** Large left fronto-temporo-parietal (hemicraniectomy-style) defect. Real post-craniotomy patient scan, not a synthetic cut.
- **Coverage:** Full cranial vault, orbits, nasal region and skull base. The mandible is outside the scan field.
- **Files:** `defective_skull.nrrd` (binary skull mask), `implant.nrrd` (expert-designed implant, voxelized onto the same grid)
- **No `complete_skull.nrrd`:** this is a real patient, so there is no intact pre-op ground truth.
- **Grid:** 512×512×169 voxels, spacing 0.438×0.438×1.000 mm (anisotropic), LPS
- **Source:** figshare `craniotomy skull.zip` (DOI 10.6084/m9.figshare.9616319), files `B0010/B0010.nrrd` and `B0010/B0010_implant.stl`
- **License:** CC BY 4.0. Attribution required.
- **Purpose:** Demo and manual inspection. Not yet wired as the app data store.

## Cite

Li, J. et al. MUG500+: Database of 500 high-resolution healthy human skulls and 29 craniotomy skulls and implants. Data in Brief 39 (2021) 107524.
