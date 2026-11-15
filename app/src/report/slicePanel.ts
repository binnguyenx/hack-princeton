import { extractSlice, type SlicePlaneId } from '../geometry/slices'
import { rasToIjk } from '../geometry/coordinates'
import type { Annotation, SpatialMeta } from '../domain/types'
import { calloutAnchor } from '../viewport/reportCapture'

/** Same colours as the slice dock so report cross-sections match what the user sees. */
export const SLICE_BG_RGB = [232, 234, 238] as const
export const SLICE_INK_RGB = [42, 46, 53] as const
const PLANES: SlicePlaneId[] = ['axial', 'sagittal', 'coronal']
const LABELS: Record<SlicePlaneId, string> = { axial: 'Axial', sagittal: 'Sagittal', coronal: 'Coronal' }

type Sizes = readonly [number, number, number]

export function windowedSliceRgba(
  voxels: Uint8Array,
  sizes: Sizes,
  plane: SlicePlaneId,
  offset: number,
  windowCenter: number,
  windowWidth: number,
): { width: number; height: number; rgba: Uint8ClampedArray } {
  const slice = extractSlice(voxels, sizes, plane, offset)
  const low = windowCenter - windowWidth / 2
  const span = Math.max(windowWidth, 1)
  const rgba = new Uint8ClampedArray(slice.width * slice.height * 4)
  for (let index = 0; index < slice.values.length; index += 1) {
    const t = Math.max(0, Math.min(1, (slice.values[index]! - low) / span))
    const at = index * 4
    for (let c = 0; c < 3; c += 1) rgba[at + c] = Math.round(SLICE_BG_RGB[c]! + (SLICE_INK_RGB[c]! - SLICE_BG_RGB[c]!) * t)
    rgba[at + 3] = 255
  }
  return { width: slice.width, height: slice.height, rgba }
}

/**
 * Axial | Sagittal | Coronal through `centreIjk`, each scaled to physical aspect (anisotropic spacing),
 * with a crosshair at the centre. Returns one PNG for the report's cross-section page.
 */
export async function renderSlicePanel(args: {
  voxels: Uint8Array
  sizes: Sizes
  spacings: [number, number, number]
  centreIjk: [number, number, number]
  windowCenter: number
  windowWidth: number
  panelSize?: number
}): Promise<Blob> {
  const panel = args.panelSize ?? 600
  const canvas = document.createElement('canvas')
  canvas.width = panel * 3
  canvas.height = panel
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.fillStyle = `rgb(${SLICE_BG_RGB.join(',')})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const [ci, cj, ck] = args.centreIjk.map(Math.round) as [number, number, number]
  PLANES.forEach((plane, index) => {
    const offset = plane === 'axial' ? ck : plane === 'sagittal' ? ci : cj
    const img = windowedSliceRgba(args.voxels, args.sizes, plane, offset, args.windowCenter, args.windowWidth)
    const [sx, sy, sz] = args.spacings
    const physW = img.width * (plane === 'sagittal' ? sy : sx)
    const physH = img.height * (plane === 'axial' ? sy : sz)
    const scale = Math.min((panel - 24) / physW, (panel - 48) / physH)
    const drawW = physW * scale
    const drawH = physH * scale
    const source = document.createElement('canvas')
    source.width = img.width
    source.height = img.height
    const sctx = source.getContext('2d')
    if (!sctx) throw new Error('2D canvas unavailable')
    const data = sctx.createImageData(img.width, img.height)
    data.data.set(img.rgba)
    sctx.putImageData(data, 0, 0)
    const x0 = index * panel + (panel - drawW) / 2
    const y0 = 36 + (panel - 36 - drawH) / 2
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(source, x0, y0, drawW, drawH)
    // Crosshair at the centre point, in the accent colour.
    const u = plane === 'sagittal' ? cj : ci
    const v = plane === 'axial' ? cj : args.sizes[2] - 1 - ck
    ctx.strokeStyle = 'rgba(47, 107, 255, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x0 + ((u + 0.5) / img.width) * drawW, y0)
    ctx.lineTo(x0 + ((u + 0.5) / img.width) * drawW, y0 + drawH)
    ctx.moveTo(x0, y0 + ((v + 0.5) / img.height) * drawH)
    ctx.lineTo(x0 + drawW, y0 + ((v + 0.5) / img.height) * drawH)
    ctx.stroke()
    ctx.fillStyle = '#1A1D21'
    ctx.font = '600 22px "SF Pro Text", "Segoe UI", system-ui, sans-serif'
    ctx.fillText(LABELS[plane], index * panel + 16, 26)
  })
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
}

export type SliceCentre = 'defect' | 'volume' | { annotation_id: string }

const DEFECT_TYPES: Annotation['type'][] = ['roi', 'closed_curve', 'highlight', 'plane']

/**
 * Voxel centre for a report's cross-sections: a named annotation's anchor; for "defect" the first
 * ROI / closed curve / highlight / plane on the revision; otherwise (or when unresolved) the volume centre.
 */
export function resolveSliceCentre(
  centre: SliceCentre,
  annotations: Annotation[],
  spatial: SpatialMeta,
  sizes: Sizes,
): [number, number, number] {
  const middle: [number, number, number] = [Math.floor(sizes[0] / 2), Math.floor(sizes[1] / 2), Math.floor(sizes[2] / 2)]
  let target: Annotation | undefined
  if (typeof centre === 'object') target = annotations.find((a) => a.id === centre.annotation_id)
  else if (centre === 'defect') {
    for (const type of DEFECT_TYPES) {
      target = annotations.find((a) => a.type === type && a.visible)
      if (target) break
    }
  }
  const anchor = target ? calloutAnchor(target) : null
  if (!anchor) return middle
  const ijk = rasToIjk(spatial, anchor)
  return ijk.map((v, i) => Math.max(0, Math.min(sizes[i]! - 1, Math.round(v)))) as [number, number, number]
}
