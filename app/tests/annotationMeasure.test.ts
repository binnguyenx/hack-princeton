import { describe, expect, it } from 'vitest'
import {
  angleDegrees,
  closedCurveLength,
  landmarkCoord,
  lineDistance,
  openCurveLength,
  planeArea,
  planeNormal,
  roiVolume,
} from '../src/geometry/annotationMeasure'

describe('annotationMeasure', () => {
  it('lineDistance is Euclidean norm (3-4-5)', () => {
    expect(lineDistance([0, 0, 0], [3, 4, 0])).toBe(5)
  })

  it('closedCurveLength includes the closing edge (unit square → 4)', () => {
    expect(
      closedCurveLength([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
    ).toBe(4)
  })

  it('openCurveLength excludes any closing edge', () => {
    expect(
      openCurveLength([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ]),
    ).toBe(2)
  })

  it('angleDegrees computes ∠ABC in degrees', () => {
    expect(angleDegrees([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBe(180)
    expect(angleDegrees([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBe(90)
  })

  it('roiVolume is product of edge lengths', () => {
    expect(roiVolume([0, 0, 0], [3, 4, 5])).toBe(60)
  })

  it('landmarkCoord formats RAS to two decimal places', () => {
    expect(landmarkCoord([1.234, 5.678, -9.012])).toBe(
      'R 1.23 · A 5.68 · S -9.01 mm',
    )
  })

  it('planeNormal from three points is unit cross product', () => {
    const n = planeNormal([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ])
    expect(n[0]).toBeCloseTo(0, 6)
    expect(n[1]).toBeCloseTo(0, 6)
    expect(n[2]).toBeCloseTo(1, 6)
  })

  it('planeArea of XY plane ∩ unit cube bbox is 1 mm²', () => {
    expect(
      planeArea(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        [1, 1, 1],
      ),
    ).toBeCloseTo(1, 6)
  })
})
