import { describe, expect, it } from 'vitest'
import {
  extractSlice,
  slicePointToIjk,
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
    expect(Array.from(extractSlice(voxels, sizes, 'sagittal', 1).values)).toEqual([
      1, 3, 5, 7, 9, 11,
    ])
    expect(Array.from(extractSlice(voxels, sizes, 'coronal', 2).values)).toEqual([
      4, 5, 10, 11,
    ])
  })

  it('maps slice pointer positions back to linked IJK coordinates', () => {
    expect(slicePointToIjk('axial', 0.5, 0.5, sizes, [0, 0, 1])).toEqual([1, 1, 1])
    expect(slicePointToIjk('sagittal', 0.5, 0.5, sizes, [1, 0, 0])).toEqual([1, 1, 1])
    expect(slicePointToIjk('coronal', 0.5, 0.5, sizes, [0, 1, 0])).toEqual([1, 1, 1])
  })
})
