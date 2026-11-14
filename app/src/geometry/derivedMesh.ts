import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import type { SpatialMeta } from '../domain/types'
import { decodeNrrdVoxels } from './nrrdVoxels'

/**
 * Display-only isosurface from a (possibly gzip) NRRD volume.
 * Downsamples so MarchingCubes stays interactive.
 */
export function volumeToDisplayMesh(
  volumeBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { resolution?: number; isolation?: number },
): THREE.Mesh {
  const resolution = options?.resolution ?? 64
  const isolation = options?.isolation ?? 0.5
  const sizes = spatial.sizes
  if (sizes.length < 3) throw new Error('volume needs 3D sizes')

  const { voxels } = decodeNrrdVoxels(volumeBytes)
  const [sx, sy, sz] = sizes
  const expected = sx * sy * sz
  if (voxels.length < expected) {
    throw new Error(`Voxel buffer short: ${voxels.length} < ${expected}`)
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xd8dae8,
    roughness: 0.62,
    metalness: 0.02,
    flatShading: false,
    side: THREE.DoubleSide,
  })
  const mc = new MarchingCubes(resolution, material, false, false, 400_000)
  mc.isolation = isolation

  let nonzero = 0
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const ix = Math.min(sx - 1, Math.floor((x / (resolution - 1)) * (sx - 1)))
        const iy = Math.min(sy - 1, Math.floor((y / (resolution - 1)) * (sy - 1)))
        const iz = Math.min(sz - 1, Math.floor((z / (resolution - 1)) * (sz - 1)))
        const idx = ix + iy * sx + iz * sx * sy
        const v = voxels[idx] ?? 0
        if (v > 0) nonzero++
        mc.setCell(x, y, z, v > 0 ? 1 : 0)
      }
    }
  }
  if (nonzero === 0) throw new Error('Volume has no solid voxels after decode')
  mc.update()

  // Physical size in mm; center at origin for orbiting
  const [spx, spy, spz] = spatial.spacings
  const scaleX = sx * spx
  const scaleY = sy * spy
  const scaleZ = sz * spz
  mc.scale.set(scaleX * 0.5, scaleY * 0.5, scaleZ * 0.5)
  mc.position.set(0, 0, 0)
  return mc
}
