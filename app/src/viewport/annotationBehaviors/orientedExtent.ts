import type { RasPoint } from '../../domain/types'
import type { AnnotationLike, ExtentEdit } from './types'

function clampMinSize(v: number, min = 2): number {
  return Math.max(min, v)
}

/** Axis-aligned ROI from diagonal corners. */
export function roiFromCorners(a: RasPoint, b: RasPoint): {
  min: RasPoint
  max: RasPoint
} {
  return {
    min: [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.min(a[2], b[2]),
    ],
    max: [
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
      Math.max(a[2], b[2]),
    ],
  }
}

export function scaleRoi(
  ann: AnnotationLike,
  factor: number,
): ExtentEdit {
  const min =
    (ann.meta.min as RasPoint | undefined) ?? ann.points[0] ?? [0, 0, 0]
  const max =
    (ann.meta.max as RasPoint | undefined) ?? ann.points[1] ?? [10, 10, 10]
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const cz = (min[2] + max[2]) / 2
  const hx = clampMinSize(((max[0] - min[0]) / 2) * factor)
  const hy = clampMinSize(((max[1] - min[1]) / 2) * factor)
  const hz = clampMinSize(((max[2] - min[2]) / 2) * factor)
  const nextMin: RasPoint = [cx - hx, cy - hy, cz - hz]
  const nextMax: RasPoint = [cx + hx, cy + hy, cz + hz]
  return {
    points: [nextMin, nextMax],
    meta: { ...ann.meta, min: nextMin, max: nextMax },
  }
}

/** Rotate plane normal around view-up-ish Y by radians; keep origin. */
export function rotatePlaneNormal(
  ann: AnnotationLike,
  yawRad: number,
): ExtentEdit {
  const origin = ann.points[0] ?? [0, 0, 0]
  const n = (Array.isArray(ann.meta.normal) && ann.meta.normal.length >= 3
    ? (ann.meta.normal as RasPoint)
    : [0, 0, 1]) as RasPoint
  const cos = Math.cos(yawRad)
  const sin = Math.sin(yawRad)
  // rotate around superior (Z) for surgical RAS feel
  const nx = n[0] * cos - n[1] * sin
  const ny = n[0] * sin + n[1] * cos
  const nz = n[2]
  const len = Math.hypot(nx, ny, nz) || 1
  const normal: RasPoint = [nx / len, ny / len, nz / len]
  const pad = Number(ann.meta.padMm ?? 10)
  return {
    points: [origin],
    meta: { ...ann.meta, normal, padMm: pad },
  }
}

export function scalePlanePad(ann: AnnotationLike, deltaMm: number): ExtentEdit {
  const origin = ann.points[0] ?? [0, 0, 0]
  const pad = clampMinSize(Number(ann.meta.padMm ?? 10) + deltaMm, 5)
  return {
    points: [origin],
    meta: { ...ann.meta, padMm: pad },
  }
}

/**
 * Apply a gizmo drag delta (screen pixels) to plane/ROI.
 * Positive dx → yaw (plane) or scale up (ROI); dy → pad/scale.
 */
export function applyOrientedExtentDrag(
  ann: AnnotationLike,
  mode: 'rotate' | 'scale',
  deltaClient: { x: number; y: number },
): ExtentEdit {
  if (ann.type === 'roi') {
    const factor = 1 + deltaClient.x * 0.005 - deltaClient.y * 0.005
    return scaleRoi(ann, Math.max(0.2, factor))
  }
  // plane
  if (mode === 'rotate') {
    return rotatePlaneNormal(ann, deltaClient.x * 0.01)
  }
  return scalePlanePad(ann, -deltaClient.y * 0.15)
}
