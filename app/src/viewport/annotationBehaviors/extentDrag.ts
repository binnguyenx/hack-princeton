import * as THREE from 'three'
import type { RasPoint } from '../../domain/types'
import type { AnnotationLike, ExtentEdit } from './types'

/**
 * Camera-independent plane/ROI handle drags (mechanical-last-parts R88–R90, D12).
 * Each handle is solved from the pointer ray against its constraint, never from
 * screen-space deltas, so the dragged handle stays under the cursor from any angle.
 */

export const ROI_MIN_EDGE_MM = 2

export type RoiFaceHandle = `roi-face-${'x' | 'y' | 'z'}${'+' | '-'}`
export type PlaneTiltHandle = `plane-tilt-${0 | 1 | 2 | 3}`
export type ExtentHandleId = RoiFaceHandle | 'roi-move' | 'plane-move' | 'plane-size' | PlaneTiltHandle

export type HandleKind = 'move' | 'rotate' | 'resize'
export type ExtentHandle = { id: ExtentHandleId; kind: HandleKind; position: RasPoint }

/** Edit for a pointer ray during the drag; `grip` is where the dragged handle now sits. */
export type HandleDragResult = ExtentEdit & { grip?: RasPoint }
export type HandleDrag = (ray: THREE.Ray) => HandleDragResult

const AXES = { x: 0, y: 1, z: 2 } as const
const PLANE_MIN_HALF_MM = 10

/** R47: rectangle covers anatomy AABB extents padded by 10 mm per side. */
export function planeRectSize(boundingBoxMm?: number[]): { width: number; height: number } {
  if (!boundingBoxMm || boundingBoxMm.length < 3) return { width: 100, height: 100 }
  const extents = boundingBoxMm.map((v) => Math.abs(v)).sort((a, b) => b - a)
  return { width: Math.max(extents[0] + 20, 20), height: Math.max(extents[1] + 20, 20) }
}

/** Plane normal: meta.normal, else from three points, else +Z (same rule the overlay renders with). */
export function planeNormalOf(ann: Pick<AnnotationLike, 'points' | 'meta'>): THREE.Vector3 {
  const metaN = ann.meta.normal
  if (Array.isArray(metaN) && metaN.length >= 3 && metaN.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    const v = new THREE.Vector3(metaN[0], metaN[1], metaN[2])
    if (v.lengthSq() > 1e-12) return v.normalize()
  }
  if (ann.points.length >= 3) {
    const [a, b, c] = ann.points
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]),
    )
    if (n.lengthSq() > 1e-12) return n.normalize()
  }
  return new THREE.Vector3(0, 0, 1)
}

export type PlaneFrame = {
  origin: THREE.Vector3
  normal: THREE.Vector3
  /** In-plane axes matching the rendered rectangle's local X / Y. */
  u: THREE.Vector3
  v: THREE.Vector3
  quaternion: THREE.Quaternion
  halfWidth: number
  halfHeight: number
  ringRadius: number
}

export function gizmoRingRadius(boundingBoxMm?: number[]): number {
  const extent =
    boundingBoxMm && boundingBoxMm.length >= 3 ? Math.max(...boundingBoxMm.map((v) => Math.abs(v)), 40) : 80
  return Math.max(extent * 0.12, 18)
}

export function planeFrame(ann: AnnotationLike, boundingBoxMm?: number[]): PlaneFrame {
  const normal = planeNormalOf(ann)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  const pad = Number(ann.meta.padMm ?? 0)
  const base = planeRectSize(boundingBoxMm)
  return {
    origin: new THREE.Vector3(...(ann.points[0] ?? [0, 0, 0])),
    normal,
    u: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
    v: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
    quaternion,
    halfWidth: base.width / 2 + pad,
    halfHeight: base.height / 2 + pad,
    ringRadius: gizmoRingRadius(boundingBoxMm),
  }
}

const toRas = (v: THREE.Vector3): RasPoint => [v.x, v.y, v.z]

function tiltDirection(frame: PlaneFrame, index: number): THREE.Vector3 {
  const a = (index / 4) * Math.PI * 2
  return frame.u.clone().multiplyScalar(Math.cos(a)).add(frame.v.clone().multiplyScalar(Math.sin(a)))
}

/** Where each manipulation handle sits for the current geometry (R89, R90). */
export function extentHandleLayout(ann: AnnotationLike, boundingBoxMm?: number[]): ExtentHandle[] {
  if (ann.type === 'plane') {
    const f = planeFrame(ann, boundingBoxMm)
    const knobs = [0, 1, 2, 3].map((i) => ({
      id: `plane-tilt-${i}` as PlaneTiltHandle,
      kind: 'rotate' as const,
      position: toRas(f.origin.clone().addScaledVector(tiltDirection(f, i), f.ringRadius)),
    }))
    return [
      { id: 'plane-move', kind: 'move', position: toRas(f.origin) },
      ...knobs,
      { id: 'plane-size', kind: 'resize', position: toRas(f.origin.clone().addScaledVector(f.u, f.halfWidth)) },
    ]
  }
  if (ann.type === 'roi') {
    const { min, max } = roiBounds(ann)
    const c: RasPoint = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const faces: ExtentHandle[] = []
    for (const [name, axis] of Object.entries(AXES) as Array<['x' | 'y' | 'z', 0 | 1 | 2]>) {
      for (const sign of ['+', '-'] as const) {
        const p = [...c] as RasPoint
        p[axis] = sign === '+' ? max[axis] : min[axis]
        faces.push({ id: `roi-face-${name}${sign}`, kind: 'resize', position: p })
      }
    }
    return [{ id: 'roi-move', kind: 'move', position: c }, ...faces]
  }
  return []
}

function roiBounds(ann: AnnotationLike): { min: RasPoint; max: RasPoint } {
  const min = (ann.meta.min as RasPoint | undefined) ?? ann.points[0] ?? [0, 0, 0]
  const max = (ann.meta.max as RasPoint | undefined) ?? ann.points[1] ?? [10, 10, 10]
  return { min: [...min] as RasPoint, max: [...max] as RasPoint }
}

function roiEdit(ann: AnnotationLike, min: RasPoint, max: RasPoint): ExtentEdit {
  return { points: [min, max], meta: { ...ann.meta, min, max } }
}

/**
 * Parameter t of the point on line (p0 + t·dir) closest to the ray, or null when the
 * ray is (nearly) parallel to the line and the drag direction is undefined.
 */
export function closestLineParam(
  p0: THREE.Vector3,
  dir: THREE.Vector3,
  ray: THREE.Ray,
): number | null {
  const d = dir.clone().normalize()
  const r = ray.direction
  const w = ray.origin.clone().sub(p0)
  const dr = d.dot(r)
  const denom = 1 - dr * dr
  if (denom < 1e-6) return null
  return (w.dot(d) - dr * w.dot(r)) / denom
}

function beginRoiFaceDrag(ann: AnnotationLike, handle: RoiFaceHandle, startRay: THREE.Ray): HandleDrag {
  const axis = AXES[handle[9] as 'x' | 'y' | 'z']
  const side = handle[10] === '+' ? 'max' : 'min'
  const start = roiBounds(ann)
  const dir = new THREE.Vector3().setComponent(axis, 1)
  const faceCoord = start[side][axis]
  const centre = new THREE.Vector3(
    (start.min[0] + start.max[0]) / 2,
    (start.min[1] + start.max[1]) / 2,
    (start.min[2] + start.max[2]) / 2,
  ).setComponent(axis, 0)
  const startT = closestLineParam(centre, dir, startRay)
  const grabOffset = startT === null ? 0 : faceCoord - startT
  let last = faceCoord
  return (ray) => {
    const t = closestLineParam(centre, dir, ray)
    if (t !== null) last = t + grabOffset
    const min = [...start.min] as RasPoint
    const max = [...start.max] as RasPoint
    if (side === 'max') max[axis] = Math.max(last, min[axis] + ROI_MIN_EDGE_MM)
    else min[axis] = Math.min(last, max[axis] - ROI_MIN_EDGE_MM)
    return roiEdit(ann, min, max)
  }
}

/**
 * Drag on the plane through `anchor` facing the start ray (the view plane at the grab point),
 * so the grabbed point tracks the cursor; returns the world delta from the grab point.
 */
function viewPlaneDelta(anchor: THREE.Vector3, startRay: THREE.Ray): (ray: THREE.Ray) => THREE.Vector3 | null {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(startRay.direction.clone().negate(), anchor)
  const grab = startRay.intersectPlane(plane, new THREE.Vector3()) ?? anchor.clone()
  return (ray) => {
    const hit = ray.intersectPlane(plane, new THREE.Vector3())
    return hit ? hit.sub(grab) : null
  }
}

function beginRoiMove(ann: AnnotationLike, startRay: THREE.Ray): HandleDrag {
  const start = roiBounds(ann)
  const centre = new THREE.Vector3(
    (start.min[0] + start.max[0]) / 2,
    (start.min[1] + start.max[1]) / 2,
    (start.min[2] + start.max[2]) / 2,
  )
  const deltaFor = viewPlaneDelta(centre, startRay)
  let delta = new THREE.Vector3()
  return (ray) => {
    delta = deltaFor(ray) ?? delta
    const shift = (p: RasPoint): RasPoint => [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z]
    return roiEdit(ann, shift(start.min), shift(start.max))
  }
}

function planeEdit(ann: AnnotationLike, origin: THREE.Vector3, normal: THREE.Vector3, padMm: number): ExtentEdit {
  return {
    points: [toRas(origin), ...ann.points.slice(1)],
    meta: { ...ann.meta, normal: toRas(normal), padMm },
  }
}

function beginPlaneMove(ann: AnnotationLike, startRay: THREE.Ray, bbox?: number[]): HandleDrag {
  const f = planeFrame(ann, bbox)
  const pad = Number(ann.meta.padMm ?? 0)
  const startT = closestLineParam(f.origin, f.normal, startRay) ?? 0
  let offset = 0
  return (ray) => {
    const t = closestLineParam(f.origin, f.normal, ray)
    if (t !== null) offset = t - startT
    return planeEdit(ann, f.origin.clone().addScaledVector(f.normal, offset), f.normal.clone(), pad)
  }
}

/** Point where the ray meets the sphere, or the sphere point nearest the ray when it misses. */
function rayOnSphere(ray: THREE.Ray, centre: THREE.Vector3, radius: number): THREE.Vector3 {
  const hit = ray.intersectSphere(new THREE.Sphere(centre, radius), new THREE.Vector3())
  if (hit) return hit
  const closest = ray.closestPointToPoint(centre, new THREE.Vector3())
  const dir = closest.sub(centre)
  if (dir.lengthSq() < 1e-12) dir.copy(ray.direction).negate()
  return centre.clone().addScaledVector(dir.normalize(), radius)
}

function beginPlaneTilt(ann: AnnotationLike, handle: PlaneTiltHandle, bbox?: number[]): HandleDrag {
  const f = planeFrame(ann, bbox)
  const pad = Number(ann.meta.padMm ?? 0)
  const startDir = tiltDirection(f, Number(handle.slice(-1)))
  let normal = f.normal.clone()
  let grip = f.origin.clone().addScaledVector(startDir, f.ringRadius)
  return (ray) => {
    const dir = rayOnSphere(ray, f.origin, f.ringRadius).sub(f.origin).normalize()
    if (Number.isFinite(dir.x) && Math.abs(dir.dot(startDir) + 1) > 1e-6) {
      const q = new THREE.Quaternion().setFromUnitVectors(startDir, dir)
      normal = f.normal.clone().applyQuaternion(q).normalize()
      grip = f.origin.clone().addScaledVector(dir, f.ringRadius)
    }
    return { ...planeEdit(ann, f.origin, normal, pad), grip: toRas(grip) }
  }
}

function beginPlaneSize(ann: AnnotationLike, startRay: THREE.Ray, bbox?: number[]): HandleDrag {
  const f = planeFrame(ann, bbox)
  const baseHalf = planeRectSize(bbox).width / 2
  const startT = closestLineParam(f.origin, f.u, startRay)
  const grabOffset = startT === null ? 0 : f.halfWidth - startT
  let half = f.halfWidth
  return (ray) => {
    const t = closestLineParam(f.origin, f.u, ray)
    if (t !== null) half = Math.max(t + grabOffset, PLANE_MIN_HALF_MM)
    return {
      ...planeEdit(ann, f.origin, f.normal, half - baseHalf),
      grip: toRas(f.origin.clone().addScaledVector(f.u, half)),
    }
  }
}

export function beginHandleDrag(
  ann: AnnotationLike,
  handle: ExtentHandleId,
  startRay: THREE.Ray,
  boundingBoxMm?: number[],
): HandleDrag {
  if (handle === 'plane-move') return beginPlaneMove(ann, startRay, boundingBoxMm)
  if (handle === 'plane-size') return beginPlaneSize(ann, startRay, boundingBoxMm)
  if (handle.startsWith('plane-tilt-')) return beginPlaneTilt(ann, handle as PlaneTiltHandle, boundingBoxMm)
  if (handle.startsWith('roi-face-')) return beginRoiFaceDrag(ann, handle as RoiFaceHandle, startRay)
  if (handle === 'roi-move') return beginRoiMove(ann, startRay)
  throw new Error(`Unsupported handle ${handle}`)
}
