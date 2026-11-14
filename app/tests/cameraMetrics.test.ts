import { expect, it } from 'vitest'
import { rulerScale, perspectiveViewHeight, perspectiveDistance } from '../src/viewport/cameraMetrics'
it('calibrates a numeric nice-length ruler in CSS pixels per mm and follows zoom', () => {
  expect(rulerScale(200, 1, 1000)).toEqual({ millimetres: 20, pixels: 100, pixelsPerMm: 5 })
  expect(rulerScale(200, 2, 1000)).toEqual({ millimetres: 10, pixels: 100, pixelsPerMm: 10 })
  expect(rulerScale(200, 1, 500)).toEqual({ millimetres: 50, pixels: 125, pixelsPerMm: 2.5 })
  expect(rulerScale(0, 1, 1000)).toBeNull()
  expect(rulerScale(Infinity, 1, 1000)).toBeNull()
})
it('preserves target-plane framing across perspective and orthographic projection', () => {
  expect(perspectiveViewHeight(100, 90, 1)).toBeCloseTo(200)
  expect(perspectiveViewHeight(100, 90, 2)).toBeCloseTo(100)
  expect(perspectiveDistance(200, 90, 1)).toBeCloseTo(100)
  expect(() => perspectiveDistance(-1, 45, 1)).toThrow()
})
