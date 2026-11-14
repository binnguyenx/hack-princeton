#!/usr/bin/env python3
"""
Turn SkullBreak / SkullFix binary NRRD volumes into 3D meshes (STL / PLY / GLB / OBJ).

Pipeline: load NRRD -> read voxel spacing -> light Gaussian smoothing of the binary
volume -> marching cubes (iso 0.5) -> Taubin mesh smoothing -> export.

Examples
  # one volume -> mesh
  python skull_to_mesh.py complete_skull/000.nrrd -o out/skull.ply

  # defective skull + implant in one scene, implant coloured differently (GLB keeps colours)
  python skull_to_mesh.py defective_skull/000.nrrd --implant implant/000.nrrd -o out/case000.glb

  # also save a quick preview PNG (needs: pip install pyvista, and a display or OSMesa/xvfb)
  python skull_to_mesh.py complete_skull/000.nrrd -o out/skull.ply --png out/skull.png

Install:  pip install numpy scipy scikit-image pynrrd trimesh   (pyvista optional, for --png)
"""
import argparse
import os
import sys

import numpy as np
import nrrd
import trimesh
from scipy import ndimage
from skimage import measure

BONE = [226, 218, 198, 255]      # ivory
IMPLANT = [70, 130, 230, 255]    # blue, so the implant stands out


def load_volume(path):
    data, hdr = nrrd.read(path)
    # voxel spacing in mm: prefer 'space directions', fall back to 'spacings', else 1.0
    if "space directions" in hdr:
        dirs = np.asarray(hdr["space directions"], dtype=float)
        spacing = np.linalg.norm(dirs, axis=1)
    elif "spacings" in hdr:
        spacing = np.asarray(hdr["spacings"], dtype=float)
    else:
        spacing = np.ones(data.ndim)
    return (data > 0), tuple(float(s) for s in spacing)


def volume_to_mesh(mask, spacing, sigma=0.9, smooth_iters=14, crop_pad=24, keep_largest=True, step_size=2, fill_cavities=True):
    # crop to the bounding box: the 512^3 volume is mostly empty, this saves time + memory
    idx = np.argwhere(mask)
    if idx.size == 0:
        raise ValueError("volume is empty")
    lo = np.maximum(idx.min(0) - crop_pad, 0)
    hi = np.minimum(idx.max(0) + crop_pad + 1, mask.shape)
    sub_mask = mask[tuple(slice(a, b) for a, b in zip(lo, hi))]
    if fill_cavities:
        sub_mask = ndimage.binary_fill_holes(sub_mask)
    sub = sub_mask.astype(np.float32)

    # smoothing the binary volume removes most of the 'staircase' voxel look
    if sigma > 0:
        sub = ndimage.gaussian_filter(sub, sigma=sigma)
    smooth_mask = sub >= 0.5
    # Signed distance field gives a smoother, less rippled surface than direct binary marching.
    inside = ndimage.distance_transform_edt(smooth_mask, sampling=spacing)
    outside = ndimage.distance_transform_edt(~smooth_mask, sampling=spacing)
    sdf = outside - inside

    verts, faces, normals, _ = measure.marching_cubes(
        sdf, level=0.0, spacing=spacing, step_size=step_size, allow_degenerate=False
    )
    verts += np.asarray(lo, dtype=float) * np.asarray(spacing)  # restore crop offset (mm)

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    if smooth_iters > 0:
        # Taubin smoothing smooths without shrinking the shape
        trimesh.smoothing.filter_taubin(mesh, iterations=smooth_iters)
    if keep_largest:
        comps = mesh.split(only_watertight=False)
        if comps:
            mesh = max(comps, key=lambda m: len(m.faces))
    mesh.fix_normals()
    return mesh


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("volume", help="NRRD file (complete / defective skull, or implant)")
    ap.add_argument("--implant", help="optional implant NRRD, added as a second coloured mesh")
    ap.add_argument("-o", "--out", required=True, help="output mesh (.stl .ply .glb .obj)")
    ap.add_argument("--sigma", type=float, default=0.9, help="Gaussian sigma in voxels (0 = off)")
    ap.add_argument("--smooth", type=int, default=14, help="Taubin smoothing iterations (0 = off)")
    ap.add_argument("--crop-pad", type=int, default=24,
                    help="padding voxels added around mask bbox before marching")
    ap.add_argument("--step-size", type=int, default=2,
                    help="marching cubes step size (>1 = fewer faces, smoother look)")
    ap.add_argument("--no-fill-cavities", action="store_true",
                    help="disable interior cavity fill before meshing")
    ap.add_argument("--keep-largest", action="store_true", default=True,
                    help="keep largest connected component only (default: on)")
    ap.add_argument("--keep-all-components", action="store_true",
                    help="disable largest-component filtering")
    ap.add_argument("--decimate", type=float, default=0.0,
                    help="fraction of faces to remove, e.g. 0.7 (needs: pip install fast-simplification)")
    ap.add_argument("--png", help="also render a preview PNG (needs pyvista)")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    meshes = []
    mask, sp = load_volume(args.volume)
    keep_largest = args.keep_largest and not args.keep_all_components
    skull = volume_to_mesh(
        mask, sp, args.sigma, args.smooth, crop_pad=args.crop_pad,
        keep_largest=keep_largest, step_size=args.step_size, fill_cavities=(not args.no_fill_cavities)
    )
    skull.visual.face_colors = BONE
    meshes.append(skull)

    if args.implant:
        imask, isp = load_volume(args.implant)
        imp = volume_to_mesh(
            imask, isp, args.sigma, args.smooth, crop_pad=args.crop_pad,
            keep_largest=keep_largest, step_size=args.step_size, fill_cavities=(not args.no_fill_cavities)
        )
        imp.visual.face_colors = IMPLANT
        meshes.append(imp)

    if args.decimate > 0:
        meshes = [m.simplify_quadric_decimation(percent=args.decimate) for m in meshes]
        for m, c in zip(meshes, [BONE, IMPLANT]):
            m.visual.face_colors = c

    scene = trimesh.Scene(meshes)
    if args.out.lower().endswith(".glb") or len(meshes) == 1:
        scene.export(args.out)          # GLB keeps per-mesh colours
    else:
        trimesh.util.concatenate(meshes).export(args.out)  # STL/OBJ/PLY: merged, single file
    for i, m in enumerate(meshes):
        print(f"mesh {i}: {len(m.vertices):,} verts, {len(m.faces):,} faces, "
              f"extent {np.round(m.extents, 1)} mm")
    print("wrote", args.out)

    if args.png:
        try:
            import pyvista as pv
            pv.OFF_SCREEN = True
            pl = pv.Plotter(off_screen=True, window_size=(1400, 1000))
            pl.set_background("white")
            for m, c in zip(meshes, ["ivory", "royalblue"]):
                faces = np.hstack([np.full((len(m.faces), 1), 3), m.faces]).ravel()
                pd = pv.PolyData(np.asarray(m.vertices), faces)
                pl.add_mesh(pd, color=c, smooth_shading=True, specular=0.3, specular_power=15)
            pl.enable_eye_dome_lighting()
            pl.camera_position = "iso"
            pl.screenshot(args.png)
            print("wrote", args.png)
        except Exception as e:  # rendering is optional
            print("PNG render skipped:", e, file=sys.stderr)


if __name__ == "__main__":
    main()
