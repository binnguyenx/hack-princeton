import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import type { SpatialMeta } from '../domain/types'

/**
 * Build a display-only isosurface from a binary NRRD volume.
 * Downsamples large grids so MarchingCubes stays interactive.
 */
export function volumeToDisplayMesh(
  volumeBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { resolution?: number; isolation?: number },
): THREE.Mesh {
  const resolution = options?.resolution ?? 48
  const isolation = options?.isolation ?? 0.5
  const sizes = spatial.sizes
  if (sizes.length < 3) throw new Error('volume needs 3D sizes')

  // Parse NRRD payload: skip header (browser-safe, no Buffer)
  const raw = volumeBytes
  let split = -1
  let sep = 2
  for (let i = 0; i < raw.length - 1; i++) {
    if (raw[i] === 10 && raw[i + 1] === 10) {
      split = i
      sep = 2
      break
    }
    if (
      i < raw.length - 3 &&
      raw[i] === 13 &&
      raw[i + 1] === 10 &&
      raw[i + 2] === 13 &&
      raw[i + 3] === 10
    ) {
      split = i
      sep = 4
      break
    }
  }
  if (split < 0) throw new Error('NRRD header missing')
  const data = raw.subarray(split + sep)

  const material = new THREE.MeshStandardMaterial({
    color: 0xc9cbe8,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: false,
  })
  const mc = new MarchingCubes(resolution, material, false, false, 200_000)
  mc.isolation = isolation

  const [sx, sy, sz] = sizes
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const ix = Math.min(sx - 1, Math.floor((x / (resolution - 1)) * (sx - 1)))
        const iy = Math.min(sy - 1, Math.floor((y / (resolution - 1)) * (sy - 1)))
        const iz = Math.min(sz - 1, Math.floor((z / (resolution - 1)) * (sz - 1)))
        const idx = ix + iy * sx + iz * sx * sy
        const v = data[idx] ?? 0
        mc.setCell(x, y, z, v > 0 ? 1 : 0)
      }
    }
  }
  mc.update()

  const [spx, spy, spz] = spatial.spacings
  const scaleX = sx * spx
  const scaleY = sy * spy
  const scaleZ = sz * spz
  mc.scale.set(scaleX, scaleY, scaleZ)
  return mc
}
