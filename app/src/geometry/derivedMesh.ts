import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import type { SpatialMeta } from '../domain/types'
import { decodeNrrdVoxels } from './nrrdVoxels'

/** Cranial CT bone iso threshold (HU). Air/soft tissue below this stay empty. */
export const HU_BONE_ISO_THRESHOLD = 300

/**
 * Display mesh via downsampled voxels → Marching Cubes.
 * Uint8 curated masks: any nonzero voxel is solid.
 * Int16 HU CT: voxels ≥ HU_BONE_ISO_THRESHOLD are solid.
 */
export function volumeToDisplayMesh(
  volumeBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { resolution?: number; huBoneThreshold?: number },
): THREE.Mesh {
  if (!spatial?.sizes || spatial.sizes.length < 3) {
    throw new Error('spatial.sizes required (got ' + JSON.stringify(spatial) + ')')
  }
  const resolution = options?.resolution ?? 96
  const huThreshold = options?.huBoneThreshold ?? HU_BONE_ISO_THRESHOLD
  const [sx, sy, sz] = spatial.sizes
  const { voxels, type } = decodeNrrdVoxels(volumeBytes)
  const expected = sx * sy * sz
  if (voxels.length < expected) {
    throw new Error(`Voxel buffer short: ${voxels.length} < ${expected}`)
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xd4d6e4,
    roughness: 0.72,
    metalness: 0.02,
    flatShading: false,
    side: THREE.DoubleSide,
  })
  const mc = new MarchingCubes(resolution, material, false, false, 240000)
  mc.isolation = 127.5
  mc.reset()

  const sampleVoxel = (fx: number, fy: number, fz: number): number => {
    const xi = Math.min(sx - 1, Math.max(0, Math.round(fx * (sx - 1))))
    const yi = Math.min(sy - 1, Math.max(0, Math.round(fy * (sy - 1))))
    const zi = Math.min(sz - 1, Math.max(0, Math.round(fz * (sz - 1))))
    const index = xi + yi * sx + zi * sx * sy
    const value = voxels[index] ?? 0
    const occupied = type === 'int16' ? value >= huThreshold : value > 0
    return occupied ? 0 : 255
  }

  let hasSolid = false
  const denom = Math.max(1, resolution - 1)
  for (let z = 0; z < resolution; z++) {
    const fz = z / denom
    for (let y = 0; y < resolution; y++) {
      const fy = y / denom
      for (let x = 0; x < resolution; x++) {
        const fx = x / denom
        const value = sampleVoxel(fx, fy, fz)
        if (value === 0) hasSolid = true
        mc.setCell(x, y, z, value)
      }
    }
  }
  if (!hasSolid) throw new Error('Volume has no solid voxels after decode')

  // Smooth binary stepping so fallback remains usable when GLB is missing.
  mc.blur(0.9)
  mc.update()
  if (mc.count <= 0) throw new Error('Fallback isosurface reconstruction produced no triangles')

  const [spx, spy, spz] = spatial.spacings
  mc.scale.set((sx * spx) / 2, (sy * spy) / 2, (sz * spz) / 2)
  return mc
}
