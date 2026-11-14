export type SlicePlaneId = 'axial' | 'sagittal' | 'coronal'
export type VolumeSizes = readonly [number, number, number]
export type IjkPoint = [number, number, number]

export type SlicePixels = {
  width: number
  height: number
  values: Uint8Array
}

/** Inclusive-exclusive content window inside a slice plane (slice pixel space). */
export type SliceContentFit = {
  width: number
  height: number
  u0: number
  v0: number
  u1: number
  v1: number
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
      // LPS volumes increase Z toward superior. Put superior at the top of
      // sagittal/coronal images — otherwise the inferior FOV face reads as a
      // hard "cut off" along the top of the panel.
      const z =
        plane === 'axial' ? clampedOffset : sizeZ - 1 - v
      values[u + v * width] = voxels[voxelIndex(x, y, z, sizes)] ?? 0
    }
  }
  return { width, height, values }
}

/**
 * Zoom the slice viewport to the non-empty anatomy AABB (plus padding).
 * Empty / near-full FOV falls back to the whole plane so air-only slices stay stable.
 */
export function computeSliceContentFit(
  values: Uint8Array,
  width: number,
  height: number,
  threshold?: number,
  padRatio = 0.02,
): SliceContentFit {
  let maxValue = 0
  for (const value of values) {
    if (value > maxValue) maxValue = value
  }
  // Prefer bright anatomy, but keep enough outline that zoom-from-AABB does not
  // leave dimmer vault edges outside the scaled frame.
  const effectiveThreshold =
    threshold ?? Math.max(20, Math.floor(maxValue * 0.22))

  let u0 = width
  let v0 = height
  let u1 = -1
  let v1 = -1
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      if (values[u + v * width]! < effectiveThreshold) continue
      if (u < u0) u0 = u
      if (v < v0) v0 = v
      if (u + 1 > u1) u1 = u + 1
      if (v + 1 > v1) v1 = v + 1
    }
  }
  if (u1 <= u0 || v1 <= v0) {
    return { width, height, u0: 0, v0: 0, u1: width, v1: height }
  }

  const contentW = u1 - u0
  const contentH = v1 - v0
  const padU =
    padRatio <= 0 ? 0 : Math.max(2, Math.round(contentW * padRatio))
  const padV =
    padRatio <= 0 ? 0 : Math.max(2, Math.round(contentH * padRatio))
  u0 = Math.max(0, u0 - padU)
  v0 = Math.max(0, v0 - padV)
  u1 = Math.min(width, u1 + padU)
  v1 = Math.min(height, v1 + padV)

  // If solid anatomy touches a volume face, the mask was FOV-cropped in the
  // sample. Zooming to that AABB makes the flat FOV edge look like a UI crop.
  // Frame the full plane instead so empty FOV stays visible as context.
  if (u0 === 0 || u1 === width || v0 === 0 || v1 === height) {
    return { width, height, u0: 0, v0: 0, u1: width, v1: height }
  }

  return { width, height, u0, v0, u1, v1 }
}

/**
 * Zoom so the anatomy AABB fits with margin, but keep the full slice plane.
 * Cropping the source to the AABB caused hard straight cuts through the vault.
 */
function fittedLayout(fit: SliceContentFit, viewWidth: number, viewHeight: number) {
  const contentW = Math.max(fit.u1 - fit.u0, 1)
  const contentH = Math.max(fit.v1 - fit.v0, 1)
  const scale =
    Math.min(viewWidth / contentW, viewHeight / contentH) * 0.98
  const centerU = (fit.u0 + fit.u1) / 2
  const centerV = (fit.v0 + fit.v1) / 2
  return {
    scale,
    // Place the full slice so the anatomy center lands in the view center.
    offsetX: viewWidth / 2 - centerU * scale,
    offsetY: viewHeight / 2 - centerV * scale,
  }
}

/** Slice UV → normalized position inside the fitted viewport (0–1). */
export function mapSliceUvToFittedView(
  u: number,
  v: number,
  fit: SliceContentFit,
  viewWidth: number,
  viewHeight: number,
): { x: number; y: number } {
  const { scale, offsetX, offsetY } = fittedLayout(fit, viewWidth, viewHeight)
  return {
    x: (offsetX + u * scale) / Math.max(viewWidth, 1),
    y: (offsetY + v * scale) / Math.max(viewHeight, 1),
  }
}

/** Fitted viewport normalized position → slice UV. */
export function mapFittedViewToSliceUv(
  normalizedX: number,
  normalizedY: number,
  fit: SliceContentFit,
  viewWidth: number,
  viewHeight: number,
): { u: number; v: number } {
  const { scale, offsetX, offsetY } = fittedLayout(fit, viewWidth, viewHeight)
  const safeScale = Math.max(scale, 1e-6)
  return {
    u: (normalizedX * viewWidth - offsetX) / safeScale,
    v: (normalizedY * viewHeight - offsetY) / safeScale,
  }
}

export function ijkToSliceUv(
  plane: SlicePlaneId,
  point: IjkPoint,
  sizes: VolumeSizes,
): { u: number; v: number } {
  if (plane === 'axial') return { u: point[0], v: point[1] }
  // Flipped V: image-top = superior = high Z
  if (plane === 'sagittal') {
    return { u: point[1], v: sizes[2] - 1 - point[2] }
  }
  return { u: point[0], v: sizes[2] - 1 - point[2] }
}

export function sliceUvToIjk(
  plane: SlicePlaneId,
  u: number,
  v: number,
  sizes: VolumeSizes,
  current: IjkPoint,
): IjkPoint {
  const clamp = (value: number, max: number) =>
    Math.round(Math.max(0, Math.min(max, value)))
  if (plane === 'axial') {
    return [clamp(u, sizes[0] - 1), clamp(v, sizes[1] - 1), current[2]]
  }
  if (plane === 'sagittal') {
    // u → Y; v → flipped Z (top of image = superior)
    return [
      current[0],
      clamp(u, sizes[1] - 1),
      clamp(sizes[2] - 1 - v, sizes[2] - 1),
    ]
  }
  return [
    clamp(u, sizes[0] - 1),
    current[1],
    clamp(sizes[2] - 1 - v, sizes[2] - 1),
  ]
}

export function slicePointToIjk(
  plane: SlicePlaneId,
  normalizedX: number,
  normalizedY: number,
  sizes: VolumeSizes,
  current: IjkPoint,
): IjkPoint {
  const x = Math.max(0, Math.min(1, normalizedX)) * (sizes[0] - 1)
  const y = Math.max(0, Math.min(1, normalizedY)) * (sizes[1] - 1)
  if (plane === 'axial') {
    return sliceUvToIjk(plane, x, y, sizes, current)
  }
  if (plane === 'sagittal') {
    const u = Math.max(0, Math.min(1, normalizedX)) * (sizes[1] - 1)
    const v = Math.max(0, Math.min(1, normalizedY)) * (sizes[2] - 1)
    return sliceUvToIjk(plane, u, v, sizes, current)
  }
  const v = Math.max(0, Math.min(1, normalizedY)) * (sizes[2] - 1)
  return sliceUvToIjk(plane, x, v, sizes, current)
}
