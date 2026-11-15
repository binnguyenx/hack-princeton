# Curated samples (manual work + future training)

Curated samples from two sources:

- **SkullBreak**: copied from `data/raw/skullbreak_training.zip`. Three synthetic-defect cases plus one complete-skull counterpart. CC BY-NC-SA 4.0.
- **MUG500+ craniotomy**: three real post-craniotomy skulls with expert-designed implants. These are fuller skulls (vault, orbits, skull base) and are preferred for demos. CC BY 4.0.

**How to inspect (human + agent):** see [`../README.md`](../README.md).

| Sample ID | Case | Defect type |
|-|-|-|
| `skullbreak-000-parietotemporal` | 000 | parietotemporal |
| `skullbreak-000-parietotemporal-complete` | 000 | complete-reference |
| `skullbreak-001-frontoorbital` | 001 | frontoorbital |
| `skullbreak-002-bilateral` | 002 | bilateral |
| `mug500-b0004-frontoparietal` | B0004 | right frontoparietal (real) |
| `mug500-b0010-hemicraniectomy` | B0010 | left hemicraniectomy (real) |
| `mug500-b0022-frontotemporal` | B0022 | right frontotemporal (real) |

SkullBreak folders: `complete_skull.nrrd`, `defective_skull.nrrd`, `implant.nrrd`, `metadata.json`, `README.md`.
MUG500+ folders: `defective_skull.nrrd`, `implant.nrrd`, `metadata.json`, `README.md`. There is no `complete_skull.nrrd` because these are real patients. The grids are anisotropic (about 0.35–0.44 mm in-plane, 1 mm slices) and keep the source `space origin`.

License: see each sample's `metadata.json`. App import/persistence wiring is deferred.
