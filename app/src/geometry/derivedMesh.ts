import * as THREE from 'three'
import type { SpatialMeta } from '../domain/types'
import { decodeNrrdVoxels } from './nrrdVoxels'

/**
 * Display mesh via downsampled binary voxels → simple Marching-cubes-ish
 * surface using Three BufferGeometry (avoid THREE.MarchingCubes field quirks).
 */
export function volumeToDisplayMesh(
  volumeBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { resolution?: number },
): THREE.Mesh {
  if (!spatial?.sizes || spatial.sizes.length < 3) {
    throw new Error('spatial.sizes required (got ' + JSON.stringify(spatial) + ')')
  }
  const resolution = options?.resolution ?? 64
  const [sx, sy, sz] = spatial.sizes
  const { voxels } = decodeNrrdVoxels(volumeBytes)
  const expected = sx * sy * sz
  if (voxels.length < expected) {
    throw new Error(`Voxel buffer short: ${voxels.length} < ${expected}`)
  }

  const positions: number[] = []
  const normals: number[] = []
  const step = Math.max(1, Math.floor(Math.min(sx, sy, sz) / resolution))

  const sample = (x: number, y: number, z: number) => {
    const xi = Math.min(sx - 1, Math.max(0, x))
    const yi = Math.min(sy - 1, Math.max(0, y))
    const zi = Math.min(sz - 1, Math.max(0, z))
    return voxels[xi + yi * sx + zi * sx * sy] > 0 ? 1 : 0
  }

  // Greedy face extraction on downsampled grid (binary blocks)
  const gx = Math.ceil(sx / step)
  const gy = Math.ceil(sy / step)
  const gz = Math.ceil(sz / step)
  const grid = new Uint8Array(gx * gy * gz)
  let solid = 0
  for (let z = 0; z < gz; z++) {
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const v = sample(x * step, y * step, z * step)
        grid[x + y * gx + z * gx * gy] = v
        solid += v
      }
    }
  }
  if (solid === 0) throw new Error('Volume has no solid voxels after decode')

  const [spx, spy, spz] = spatial.spacings
  const ox = (-sx * spx) / 2
  const oy = (-sy * spy) / 2
  const oz = (-sz * spz) / 2

  const pushFace = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    x3: number,
    y3: number,
    z3: number,
    nx: number,
    ny: number,
    nz: number,
  ) => {
    const quad = [
      [x0, y0, z0],
      [x1, y1, z1],
      [x2, y2, z2],
      [x0, y0, z0],
      [x2, y2, z2],
      [x3, y3, z3],
    ]
    for (const [x, y, z] of quad) {
      positions.push(ox + x * spx, oy + y * spy, oz + z * spz)
      normals.push(nx, ny, nz)
    }
  }

  const at = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= gx || y >= gy || z >= gz) return 0
    return grid[x + y * gx + z * gx * gy]
  }

  for (let z = 0; z < gz; z++) {
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        if (!at(x, y, z)) continue
        const x0 = x * step
        const y0 = y * step
        const z0 = z * step
        const x1 = Math.min(sx, x0 + step)
        const y1 = Math.min(sy, y0 + step)
        const z1 = Math.min(sz, z0 + step)
        if (!at(x - 1, y, z))
          pushFace(x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1, -1, 0, 0)
        if (!at(x + 1, y, z))
          pushFace(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, 1, 0, 0)
        if (!at(x, y - 1, z))
          pushFace(x0, y0, z0, x0, y0, z1, x1, y0, z1, x1, y0, z0, 0, -1, 0)
        if (!at(x, y + 1, z))
          pushFace(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, 1, 0)
        if (!at(x, y, z - 1))
          pushFace(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, 0, 0, -1)
        if (!at(x, y, z + 1))
          pushFace(x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1, 0, 0, 1)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()

  const material = new THREE.MeshStandardMaterial({
    color: 0xd4d6e4,
    roughness: 0.55,
    metalness: 0.04,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  return new THREE.Mesh(geometry, material)
}
