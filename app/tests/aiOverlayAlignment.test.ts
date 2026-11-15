/**
 * Frame alignment: overlay points (voxel ijk → voxelToLocal) must land on the surface the app
 * actually renders. Uses the real reconstructed-mesh builder on an off-centre, anisotropic
 * ellipsoid so an axis swap or flip would be caught.
 */
import { describe, expect, it } from 'vitest'
import { volumeToDisplayMesh } from '../src/geometry/derivedMesh'
import { voxelFrameOf, voxelToLocal } from '../src/geometry/aiOverlay'

const N = 48
const SPACING = 2
const CENTRE = [30, 20, 26]
const RADII = [10, 7, 12]

function inside(i: number, j: number, k: number) {
  return ((i - CENTRE[0]) / RADII[0]) ** 2 + ((j - CENTRE[1]) / RADII[1]) ** 2 + ((k - CENTRE[2]) / RADII[2]) ** 2 <= 1
}

function fixture() {
  const voxels = new Uint8Array(N * N * N)
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    voxels[i + j * N + k * N * N] = inside(i, j, k) ? 1 : 0
  const header = `NRRD0004\ntype: uint8\ndimension: 3\nsizes: ${N} ${N} ${N}\nencoding: raw\n\n`
  const bytes = new Uint8Array(header.length + voxels.length)
  bytes.set(new TextEncoder().encode(header)); bytes.set(voxels, header.length)
  const surface: Array<[number, number, number]> = []
  for (let k = 1; k < N - 1; k++) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++)
    if (inside(i, j, k) && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
      .some(([a, b, c]) => !inside(i + a, j + b, k + c))) surface.push([i, j, k])
  return { bytes, surface }
}

function medianDistanceMm(mesh: ReturnType<typeof volumeToDisplayMesh>, points: Array<[number, number, number]>,
  map: (ijk: [number, number, number]) => [number, number, number]) {
  const mc = mesh as unknown as { positionArray: Float32Array; count: number; scale: { x: number; y: number; z: number } }
  const { x: sx, y: sy, z: sz } = mc.scale
  const verts: number[][] = []
  for (let v = 0; v < mc.count; v += 3) // every 3rd vertex is plenty and keeps the test fast
    verts.push([mc.positionArray[v * 3] * sx, mc.positionArray[v * 3 + 1] * sy, mc.positionArray[v * 3 + 2] * sz])
  const distances = points.filter((_, n) => n % 4 === 0).map(ijk => {
    const local = map(ijk)
    const p = [local[0] * sx, local[1] * sy, local[2] * sz]
    let best = Infinity
    for (const q of verts) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)
    return Math.sqrt(best)
  }).sort((a, b) => a - b)
  return distances[Math.floor(distances.length / 2)]
}

describe('AI overlay ↔ reconstructed mesh alignment', () => {
  const { bytes, surface } = fixture()
  const mesh = volumeToDisplayMesh(bytes, { units: 'mm', sizes: [N, N, N], spacings: [SPACING, SPACING, SPACING],
    bboxMm: [N * SPACING, N * SPACING, N * SPACING] }, { resolution: N })
  const frame = voxelFrameOf(mesh)!

  it('tags the reconstructed mesh with its voxel frame', () => {
    expect(frame).toEqual({ kind: 'normalized-grid', sizes: [N, N, N], resolution: N })
  })

  it('places surface voxels on the rendered surface (within about one voxel)', () => {
    const median = medianDistanceMm(mesh, surface, ijk => voxelToLocal(frame, ijk).toArray() as [number, number, number])
    expect(median).toBeLessThan(SPACING * 1.25)
  })

  it('would detect a frame bug: an axis swap lands far off the surface', () => {
    const swapped = medianDistanceMm(mesh, surface,
      ([i, j, k]) => voxelToLocal(frame, [k, j, i]).toArray() as [number, number, number])
    expect(swapped).toBeGreaterThan(SPACING * 2)
  })
})
