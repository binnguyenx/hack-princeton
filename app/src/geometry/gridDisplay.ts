import { Matrix4 } from 'three'
import type { SpatialMeta } from '../domain/types'

/** Prepared GLB uses the source's raw physical frame. Keep fallback geometry in that frame too.
 * This does not change stored candidate poses or claim a new universal GLB-to-RAS convention. */
export function gridDisplayMatrix(spatial: SpatialMeta): Matrix4 {
  const origin = spatial.spaceOrigin ?? [0, 0, 0]
  const directions = spatial.spaceDirections ?? [[spatial.spacings[0], 0, 0], [0, spatial.spacings[1], 0], [0, 0, spatial.spacings[2]]]
  const half = spatial.sizes.map((size) => (size - 1) / 2)
  const columns = directions.map((direction, index) => direction.map((value) => value * half[index]))
  const center = origin.map((value, axis) => value + columns.reduce((sum, column) => sum + column[axis], 0))
  const matrix = new Matrix4().set(columns[0][0], columns[1][0], columns[2][0], center[0],
    columns[0][1], columns[1][1], columns[2][1], center[1], columns[0][2], columns[1][2], columns[2][2], center[2], 0, 0, 0, 1)
  if (!matrix.elements.every(Number.isFinite)) throw new Error('Invalid display grid transform')
  return matrix
}
