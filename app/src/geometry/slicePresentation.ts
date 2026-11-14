import { extractSlice, type IjkPoint, type SlicePlaneId, type VolumeSizes } from './slices'

export function fitSlice(width: number, height: number, columns: number, rows: number, horizontalMm: number, verticalMm: number) {
  if ([width, height, columns, rows, horizontalMm, verticalMm].some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid slice dimensions or spacing')
  const scale = Math.min(width / (columns * horizontalMm), height / (rows * verticalMm))
  const w = columns * horizontalMm * scale
  const h = rows * verticalMm * scale
  return { width: w, height: h, left: (width - w) / 2, top: (height - h) / 2 }
}
export function regionWindow(voxels: Uint8Array, sizes: VolumeSizes, plane: SlicePlaneId, start: IjkPoint, end: IjkPoint) {
  const offset = plane === 'axial' ? start[2] : plane === 'sagittal' ? start[0] : start[1]
  const slice = extractSlice(voxels, sizes, plane, offset)
  const axes = plane === 'axial' ? [0, 1] : plane === 'sagittal' ? [1, 2] : [0, 2]
  const lowX = Math.max(0, Math.min(start[axes[0]], end[axes[0]]))
  const highX = Math.min(slice.width - 1, Math.max(start[axes[0]], end[axes[0]]))
  const lowY = Math.max(0, Math.min(start[axes[1]], end[axes[1]]))
  const highY = Math.min(slice.height - 1, Math.max(start[axes[1]], end[axes[1]]))
  let min = Infinity, max = -Infinity
  for (let y = Math.ceil(lowY); y <= highY; y++) for (let x = Math.ceil(lowX); x <= highX; x++) {
    const value = slice.values[x + y * slice.width]
    min = Math.min(min, value); max = Math.max(max, value)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('No source voxels in selected region')
  return { center: (min + max) / 2, width: Math.max(max - min, 1) }
}
