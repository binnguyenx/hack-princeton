import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { gridDisplayMatrix } from '../src/geometry/gridDisplay'
it('places derived normalized geometry in the same raw patient frame as the prepared mesh', () => {
  const matrix = gridDisplayMatrix({ units: 'mm', sizes: [5, 7, 3], spacings: [2, 3, 4], bboxMm: [10, 21, 12], spaceOrigin: [10, 20, 30] })
  expect(new Vector3(-1, -1, -1).applyMatrix4(matrix).toArray()).toEqual([10, 20, 30])
  expect(new Vector3(1, 1, 1).applyMatrix4(matrix).toArray()).toEqual([18, 38, 38])
})
