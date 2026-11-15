# Cranioplasty metrics and formulas

Scope: exact definitions the workspace uses when it reports a metric. Calculations are run by
deterministic Python tools, never estimated by the language model. Inputs supplied in chat are
**caller-supplied values, not measurements made by the workspace**, unless a workspace read
tool returned them.

## Voxel volume
Keywords: volume, voxel, voxel count, spacing, mm3, cm3, cc, millilitre, implant volume, defect volume, physical volume
Evidence: definition

    V_mm3 = N_voxels × Δx × Δy × Δz        (Δ = voxel spacing in mm along each axis)
    V_cm3 = V_mm3 / 1000                   (1 cm³ = 1 mL = 1000 mm³)

Edge rules:
- Spacing must be exactly three finite values > 0, in millimetres. Otherwise the result is
  **INDETERMINATE** (missing, wrong length, zero/negative, non-finite, or unknown units).
- N_voxels must be an integer ≥ 0.
- Grid dimensions (e.g. 512 × 512 × 300) are the volume *grid*, not the defect or implant size;
  only a voxel count of a specific mask gives a physical volume.
- Volumes are only as trustworthy as the spatial metadata; unverified spacing should be reported
  as such.

## Defect coverage ratio
Keywords: coverage, coverage ratio, defect coverage, dice, overlap ratio, completeness
Evidence: definition

    Coverage = |Implant ∩ Defect| / |Defect|      (voxel counts in the same grid; range 0–1)

Edge rules: INDETERMINATE when |Defect| = 0 or masks are on different grids/spacing. A Dice
coefficient (2|A∩B| / (|A|+|B|)) is a different metric and must be labelled as such.

## Mean radial gap and rim fit error
Keywords: rim gap, radial gap, rim fit, RMSE, fit error, edge gap, mean gap, contour
Evidence: definition

For n sample points along the defect rim with signed gap g_i (mm; positive = gap, negative =
overlap/interference):

    Mean radial gap = (1/n) Σ |g_i|
    Rim fit RMSE    = sqrt( (1/n) Σ g_i² )

Edge rules: INDETERMINATE when n = 0 or units are not mm. Report n with the result.

## Fixation safety margin index
Keywords: safety margin, margin index, screw margin, pull-out, fixation margin, screw safety
Evidence: definition (workspace)

Workspace margins reported by the fixation check, using policy thresholds from the guardrails:

    Bone thickness margin   = t_bone − t_min                  (t_min = 2.0 mm policy default)
    Screw depth margin      = t_bone − L_screw                (must be ≥ 0)
    Sinus clearance margin  = d_sinus − d_min                 (d_min = 5.0 mm policy default)
    Safety margin index     = min(all margins above)          (mm; < 0 means at least one FAIL)

Screw pull-out strength depends on thread engagement, bone quality and screw design and is
**not computed** by the workspace; the margin index is a geometric screen only.
