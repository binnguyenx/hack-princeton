# Dataset layout

Bone volumes for manual inspection and future training. **Not** the app project store yet (save/open design deferred).

| Path | What | In git? |
|-|-|-|
| [`raw/`](raw/) | Full SkullBreak training zip (local download) | No (zip ignored); README + SHA-256 yes |
| [`samples/`](samples/) | Three curated cases for day-to-day work | Yes |

License: **CC BY-NC-SA 4.0**. Non-commercial; keep attribution. See each sample README and [`raw/README.md`](raw/README.md).

## Inspect (humans)

1. Open a curated folder under `samples/<id>/`.
2. Prefer these files: `defective_skull.nrrd` (anatomy with defect), `complete_skull.nrrd` (intact), `implant.nrrd` (defect fill / label).
3. View NRRDs in a volume viewer, e.g. [StudierFenster](https://www.studierfenster.at) (dataset authors recommend it), 3D Slicer, or ITK-SNAP.
4. Confirm you see a binary skull mask (not a photo CT) and that defective vs complete differ in the defect region.
5. Re-download the archive only if needed: follow [`raw/README.md`](raw/README.md) (Zenodo URL + checksum).

## Inspect (agents)

1. Read this file and `samples/README.md` before assuming paths.
2. List samples: `ls data/samples/` — expect three `skullbreak-*` directories plus `README.md`.
3. Per sample, expect exactly: `README.md`, `complete_skull.nrrd`, `defective_skull.nrrd`, `implant.nrrd`.
4. Verify NRRD magic without a GUI:

```bash
# Header should start with NRRD000x
head -c 8 data/samples/skullbreak-000-parietotemporal/complete_skull.nrrd | xxd
# Or print text header until blank line
python3 -c "
from pathlib import Path
p = Path('data/samples/skullbreak-000-parietotemporal/complete_skull.nrrd')
print(p.read_bytes().split(b'\\n\\n', 1)[0].decode('ascii', errors='replace'))
"
```

5. Do **not** commit or delete `data/raw/skullbreak_training.zip`. It is gitignored (~249 MB). If missing locally, download per `raw/README.md` and check `raw/skullbreak_training.sha256`.
6. Do **not** treat these paths as the portable project package or wire them into app Save/Open until `features/3d-bone-editor/` docs say so.
7. Feature context: `features/3d-bone-editor/` (intent/spec/plan). Sample acquisition note lives under plan Deviations.
