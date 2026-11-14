import { describe, expect, it } from 'vitest'
import type { SpatialMeta } from '../src/domain/types'
import {
  ijkToRas,
  lpsToRas,
  rasToIjk,
} from '../src/geometry/coordinates'

const obliqueLps: SpatialMeta = {
  units: 'mm',
  space: 'left-posterior-superior',
  patientBasis: 'LPS',
  sizes: [10, 10, 10],
  spacings: [2, 3, 4],
  bboxMm: [20, 30, 40],
  spaceOrigin: [100, 50, -20],
  spaceDirections: [
    [0, 2, 0],
    [-3, 0, 0],
    [0, 0, 4],
  ],
}

describe('medical image coordinates', () => {
  it('converts LPS to RAS exactly once', () => {
    expect(lpsToRas([100, 50, -20])).toEqual([-100, -50, -20])
  })

  it('maps oblique IJK through directions and origin into RAS', () => {
    expect(ijkToRas(obliqueLps, [2, 1, 3])).toEqual([-97, -54, -8])
  })

  it('round-trips RAS back to fractional IJK', () => {
    const ras = ijkToRas(obliqueLps, [2.5, 1.25, 3.5])
    const ijk = rasToIjk(obliqueLps, ras)
    expect(ijk[0]).toBeCloseTo(2.5)
    expect(ijk[1]).toBeCloseTo(1.25)
    expect(ijk[2]).toBeCloseTo(3.5)
  })

  it('rejects singular image transforms', () => {
    const singular: SpatialMeta = {
      ...obliqueLps,
      spaceDirections: [
        [1, 0, 0],
        [2, 0, 0],
        [0, 0, 1],
      ],
    }
    expect(() => rasToIjk(singular, [0, 0, 0])).toThrow(
      'Image-to-patient transform is singular',
    )
  })
})
