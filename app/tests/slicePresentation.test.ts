import { expect, it } from 'vitest'
import { fitSlice, regionWindow } from '../src/geometry/slicePresentation'
import { slicePointToIjk } from '../src/geometry/slices'
it('fits anisotropic physical slice extents without stretching or leaving the viewport', () => {
  expect(fitSlice(400, 200, 100, 100, 2, 1)).toEqual({ width: 400, height: 200, left: 0, top: 0 })
  expect(fitSlice(400, 400, 100, 100, 2, 1)).toEqual({ width: 400, height: 200, left: 0, top: 100 })
  expect(() => fitSlice(0, 200, 100, 100, 1, 1)).toThrow()
})
it('maps sagittal horizontal motion to J independently from vertical K', () => {
  expect(slicePointToIjk('sagittal', 1, 0, [3, 5, 7], [1, 0, 0])).toEqual([1, 4, 0])
})
it('windows exactly the chosen source voxel rectangle, including a constant region', () => {
  expect(regionWindow(new Uint8Array([0, 5, 100, 10, 20, 255]), [3, 2, 1], 'axial', [0, 0, 0], [1, 1, 0])).toEqual({ center: 10, width: 20 })
  expect(regionWindow(new Uint8Array([3]), [1, 1, 1], 'axial', [0, 0, 0], [0, 0, 0])).toEqual({ center: 3, width: 1 })
})
