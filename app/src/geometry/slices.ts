export type SlicePlaneId = 'axial' | 'sagittal' | 'coronal'
export type VolumeSizes = readonly [number, number, number]
export type IjkPoint = [number, number, number]

export type SlicePixels = {
  width: number
  height: number
  values: Uint8Array
}

export function volumeIntensityRange(voxels: Uint8Array): [number, number] {
  if (voxels.length === 0) return [0, 0]
  let minimum = 255
  let maximum = 0
  for (const value of voxels) {
    if (value < minimum) minimum = value
    if (value > maximum) maximum = value
    if (minimum === 0 && maximum === 255) break
  }
  return [minimum, maximum]
}

function voxelIndex(x: number, y: number, z: number, sizes: VolumeSizes): number {
  return x + sizes[0] * (y + sizes[1] * z)
}

export function extractSlice(
  voxels: Uint8Array,
  sizes: VolumeSizes,
  plane: SlicePlaneId,
  offset: number,
): SlicePixels {
  const [sizeX, sizeY, sizeZ] = sizes
  const width = plane === 'sagittal' ? sizeY : sizeX
  const height = plane === 'axial' ? sizeY : sizeZ
  const values = new Uint8Array(width * height)
  const clampedOffset = Math.max(
    0,
    Math.min(
      offset,
      (plane === 'axial' ? sizeZ : plane === 'sagittal' ? sizeX : sizeY) - 1,
    ),
  )

  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const x = plane === 'sagittal' ? clampedOffset : u
      const y = plane === 'axial' ? v : plane === 'sagittal' ? u : clampedOffset
      const z = plane === 'axial' ? clampedOffset : v
      values[u + v * width] = voxels[voxelIndex(x, y, z, sizes)] ?? 0
    }
  }
  return { width, height, values }
}

export function slicePointToIjk(
  plane: SlicePlaneId,
  normalizedX: number,
  normalizedY: number,
  sizes: VolumeSizes,
  current: IjkPoint,
): IjkPoint {
  const x = Math.round(Math.max(0, Math.min(1, normalizedX)) * (sizes[0] - 1))
  const y = Math.round(Math.max(0, Math.min(1, normalizedY)) * (sizes[1] - 1))
  const z = Math.round(Math.max(0, Math.min(1, normalizedY)) * (sizes[2] - 1))
  if (plane === 'axial') return [x, y, current[2]]
  if (plane === 'sagittal') return [current[0], y, z]
  return [x, current[1], z]
}
