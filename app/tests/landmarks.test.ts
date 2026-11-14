import { expect, it } from 'vitest'
import { landmarkDistance } from '../src/geometry/landmarks'
import type { SourceLandmark } from '../src/domain/types'
const a: SourceLandmark = { id: 'a', sampleId: 's', sourceObjectId: 'o', volumeHash: 'hash', label: 'A', ijk: [0, 0, 0], ras: [10, 20, 30] }
it('measures a known3-4-5 straight-line distance with ownership and validity guards', () => {
  const b = { ...a, id: 'b', ras: [13, 24, 30] as [number, number, number] }
  expect(landmarkDistance(a, b)).toBe(5)
  expect(() => landmarkDistance(a, a)).toThrow('distinct')
  expect(() => landmarkDistance(a, { ...b, sampleId: 'other' })).toThrow('source')
  expect(() => landmarkDistance(a, { ...b, ras: [NaN, 0, 0] })).toThrow('finite')
})
