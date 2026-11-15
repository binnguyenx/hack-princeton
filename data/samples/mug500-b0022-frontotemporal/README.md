# Sample: mug500-b0022-frontotemporal

- **Dataset:** MUG500+ craniotomy skulls (Medical University of Graz)
- **Case ID:** B0022
- **Defect:** Right frontotemporal oval craniotomy defect. Real post-craniotomy patient scan, not a synthetic cut.
- **Coverage:** Full cranial vault, orbits, nasal region and skull base. The mandible is outside the scan field.
- **Files:** `defective_skull.nrrd` (binary skull mask), `implant.nrrd` (expert-designed implant, voxelized onto the same grid)
- **No `complete_skull.nrrd`:** this is a real patient, so there is no intact pre-op ground truth.
- **Grid:** 512×512×167 voxels, spacing 0.441×0.441×1.000 mm (anisotropic), LPS
- **Source:** figshare `craniotomy skull.zip` (DOI 10.6084/m9.figshare.9616319), files `B0022/B0022.nrrd` and `B0022/B0022_implant.stl`
- **License:** CC BY 4.0. Attribution required.
- **Purpose:** Demo and manual inspection. Not yet wired as the app data store.

## Cite

Li, J. et al. MUG500+: Database of 500 high-resolution healthy human skulls and 29 craniotomy skulls and implants. Data in Brief 39 (2021) 107524.
