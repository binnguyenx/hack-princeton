/**
 * Predicted-fix scene (cranial-reconstruction-candidate R12, S6): the fix renders as its own
 * Accent-coloured part, built on the same grid as the skull so the two line up.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFixScene, fixMaskVoxels, FIX_PART_NAME, SKULL_PART_NAME } from '../src/geometry/fixMesh'
import { voxelFrameOf, voxelToLocal } from '../src/geometry/aiOverlay'

const N = 32
const SPATIAL = { units: 'mm', sizes: [N, N, N], spacings: [1, 1, 1], bboxMm: [N, N, N] }
const inShell = (i: number, j: number, k: number) => {
  const r = Math.hypot(i - 16, j - 16, k - 16)
  return r > 9 && r < 12
}
const inHole = (i: number, j: number, k: number) => i > 22 && inShell(i, j, k) // off-centre, +i side

function nrrd(fn: (i: number, j: number, k: number) => boolean) {
  const voxels = new Uint8Array(N * N * N)
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    voxels[i + j * N + k * N * N] = fn(i, j, k) ? 1 : 0
  const header = new TextEncoder().encode(`NRRD0004\ntype: uint8\ndimension: 3\nsizes: ${N} ${N} ${N}\nencoding: raw\n\n`)
  const bytes = new Uint8Array(header.length + voxels.length)
  bytes.set(header); bytes.set(voxels, header.length)
  return { bytes, voxels }
}

const source = nrrd((i, j, k) => inShell(i, j, k) && !inHole(i, j, k))
const candidate = nrrd(inShell)

describe('predicted fix scene', () => {
  it('fix mask is exactly the voxels the candidate adds to the skull', () => {
    const fix = fixMaskVoxels(candidate.bytes, source.bytes)
    let expected = 0, wrong = 0
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const want = inHole(i, j, k) ? 1 : 0
      expected += want
      if (fix[i + j * N + k * N * N] !== want) wrong++
    }
    expect(expected).toBeGreaterThan(0)
    expect(wrong).toBe(0)
  })

  it('renders skull and fix as separate parts, fix in the Accent token', () => {
    const scene = buildFixScene(source.bytes, candidate.bytes, SPATIAL, { resolution: N })
    const skull = scene.getObjectByName(SKULL_PART_NAME) as THREE.Mesh
    const fix = scene.getObjectByName(FIX_PART_NAME) as THREE.Mesh
    expect(skull).toBeTruthy()
    expect(fix).toBeTruthy()
    expect((fix.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('2f6bff')
    expect((skull.material as THREE.MeshStandardMaterial).color.getHexString()).not.toBe('2f6bff')
    expect(voxelFrameOf(scene)).toEqual(voxelFrameOf(skull))
  })

  it('places the fix where its voxels are, within half a voxel, in the skull frame', () => {
    const scene = buildFixScene(source.bytes, candidate.bytes, SPATIAL, { resolution: N })
    const skull = scene.getObjectByName(SKULL_PART_NAME)!
    const fix = scene.getObjectByName(FIX_PART_NAME)!
    expect(fix.scale.toArray()).toEqual(skull.scale.toArray())
    expect(fix.position.toArray()).toEqual(skull.position.toArray())
    // Centre of the fix voxels, mapped through the skull's own voxel frame.
    let ci = 0, cj = 0, ck = 0, n = 0
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
      if (inHole(i, j, k)) { ci += i; cj += j; ck += k; n++ }
    const expected = voxelToLocal(voxelFrameOf(skull)!, [ci / n, cj / n, ck / n]).multiply(skull.scale)
    // MarchingCubes preallocates its buffer; only the first `count` vertices are live.
    const mc = fix as unknown as { positionArray: Float32Array; count: number }
    const centre = new THREE.Vector3()
    for (let v = 0; v < mc.count; v++)
      centre.add(new THREE.Vector3(mc.positionArray[v * 3], mc.positionArray[v * 3 + 1], mc.positionArray[v * 3 + 2]))
    centre.divideScalar(mc.count).multiply(fix.scale)
    // A surface's vertex centre sits a little outside a curved cap's voxel centre on the bulge axis (i);
    // allow 2 mm there and half a voxel (0.5 mm) on j/k, where a flip or axis swap would show.
    expect(Math.abs(centre.x - expected.x)).toBeLessThan(2)
    expect(Math.sign(centre.x)).toBe(1) // +i side, not mirrored
    expect(Math.abs(centre.y - expected.y)).toBeLessThan(0.5)
    expect(Math.abs(centre.z - expected.z)).toBeLessThan(0.5)
  })

  it('a skull with no fix voxels is refused, not rendered as an empty fix', () => {
    expect(() => buildFixScene(source.bytes, source.bytes, SPATIAL, { resolution: N })).toThrow(/no fix voxels/i)
  })
})
