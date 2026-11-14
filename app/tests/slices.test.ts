import { describe, expect, it } from 'vitest'
import {
  computeSliceContentFit,
  extractSlice,
  ijkToSliceUv,
  mapFittedViewToSliceUv,
  mapSliceUvToFittedView,
  slicePointToIjk,
  sliceUvToIjk,
  volumeIntensityRange,
} from '../src/geometry/slices'

const sizes: [number, number, number] = [2, 3, 2]
const voxels = Uint8Array.from({ length: 12 }, (_, index) => index)

describe('orthogonal volume slices', () => {
  it('derives display range from actual voxel intensities', () => {
    expect(volumeIntensityRange(Uint8Array.from([0, 1, 1]))).toEqual([0, 1])
  })

  it('extracts axial, sagittal, and coronal planes from x-fastest voxels', () => {
    expect(Array.from(extractSlice(voxels, sizes, 'axial', 1).values)).toEqual([
      6, 7, 8, 9, 10, 11,
    ])
    // Sagittal/coronal flip Z so image-top = superior (high index).
    expect(Array.from(extractSlice(voxels, sizes, 'sagittal', 1).values)).toEqual([
      7, 9, 11, 1, 3, 5,
    ])
    expect(Array.from(extractSlice(voxels, sizes, 'coronal', 2).values)).toEqual([
      10, 11, 4, 5,
    ])
  })

  it('maps slice pointer positions back to linked IJK coordinates', () => {
    expect(slicePointToIjk('axial', 0.5, 0.5, sizes, [0, 0, 1])).toEqual([1, 1, 1])
    expect(slicePointToIjk('sagittal', 0.5, 0.5, sizes, [1, 0, 0])).toEqual([1, 1, 1])
    expect(slicePointToIjk('coronal', 0.5, 0.5, sizes, [0, 1, 0])).toEqual([1, 1, 1])
  })

  it('maps sagittal U from horizontal pointer axis; top edge is superior (high Z)', () => {
    expect(slicePointToIjk('sagittal', 1, 0, sizes, [1, 0, 0])).toEqual([1, 2, 1])
    expect(sliceUvToIjk('sagittal', 2, 0, sizes, [1, 0, 0])).toEqual([1, 2, 1])
  })

  it('fits the view to non-empty anatomy with padding instead of the full FOV', () => {
    const width = 8
    const height = 8
    const values = new Uint8Array(width * height)
    // Bright blob in the upper-left corner — cranial CT often parks anatomy near an edge.
    for (let v = 1; v <= 2; v += 1) {
      for (let u = 1; u <= 2; u += 1) {
        values[u + v * width] = 200
      }
    }
    const fit = computeSliceContentFit(values, width, height, 16, 0)
    expect(fit.u0).toBe(1)
    expect(fit.v0).toBe(1)
    expect(fit.u1).toBe(3)
    expect(fit.v1).toBe(3)

    const view = mapSliceUvToFittedView(2, 2, fit, 100, 100)
    expect(view.x).toBeGreaterThan(0.2)
    expect(view.x).toBeLessThan(0.8)
    const back = mapFittedViewToSliceUv(view.x, view.y, fit, 100, 100)
    expect(back.u).toBeCloseTo(2, 5)
    expect(back.v).toBeCloseTo(2, 5)

    // Full-plane draw: a UV outside the anatomy AABB still maps continuously
    // (no hard crop), so vault edges are never sliced by the fit window.
    const outside = mapSliceUvToFittedView(0, 0, fit, 100, 100)
    expect(Number.isFinite(outside.x)).toBe(true)
    expect(Number.isFinite(outside.y)).toBe(true)
  })

  it('frames the full plane when anatomy touches a volume face (FOV-cropped samples)', () => {
    const width = 8
    const height = 8
    const values = new Uint8Array(width * height)
    // Solid touches the bottom border — like skullbreak masks on z = 0.
    for (let u = 2; u <= 5; u += 1) {
      values[u + (height - 1) * width] = 200
      values[u + (height - 2) * width] = 200
    }
    const fit = computeSliceContentFit(values, width, height, 16, 0)
    expect(fit).toEqual({ width, height, u0: 0, v0: 0, u1: width, v1: height })
  })

  it('round-trips IJK ↔ slice UV for each plane', () => {
    const point: [number, number, number] = [1, 2, 0]
    for (const plane of ['axial', 'sagittal', 'coronal'] as const) {
      const uv = ijkToSliceUv(plane, point, sizes)
      expect(sliceUvToIjk(plane, uv.u, uv.v, sizes, point)).toEqual(point)
    }
  })
})
