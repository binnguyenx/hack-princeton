# Sample: mug500-b0004-frontoparietal

- **Dataset:** MUG500+ craniotomy skulls (Medical University of Graz)
- **Case ID:** B0004
- **Defect:** Right frontoparietal craniotomy defect near the vertex. Real post-craniotomy patient scan, not a synthetic cut.
- **Coverage:** Full cranial vault, orbits, nasal region and skull base. The mandible is outside the scan field.
- **Files:** `defective_skull.nrrd` (binary skull mask), `implant.nrrd` (expert-designed implant, voxelized onto the same grid)
- **No `complete_skull.nrrd`:** this is a real patient, so there is no intact pre-op ground truth.
- **Grid:** 512×512×178 voxels, spacing 0.350×0.350×1.000 mm (anisotropic), LPS
- **Source:** figshare `craniotomy skull.zip` (DOI 10.6084/m9.figshare.9616319), files `B0004/B0004.nrrd` and `B0004/B0004_implant.stl`
- **License:** CC BY 4.0. Attribution required.
- **Purpose:** Demo and manual inspection. Not yet wired as the app data store.

## Cite

Li, J. et al. MUG500+: Database of 500 high-resolution healthy human skulls and 29 craniotomy skulls and implants. Data in Brief 39 (2021) 107524.
