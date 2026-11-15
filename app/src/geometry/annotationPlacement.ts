import type { AnnotationType, RasPoint } from '../domain/types'

export type PlanePlacementMethod = 'point-normal' | 'three-point'

/** Draft placement outcome — never writes; `ready` means Commit is allowed (R78). */
export type PlacementDecision =
  | { kind: 'accumulate'; points: RasPoint[]; meta?: Record<string, unknown> }
  | {
      kind: 'ready'
      points: RasPoint[]
      meta: Record<string, unknown>
    }
  | { kind: 'ignore' }

export function defaultAnnotationName(type: AnnotationType): string {
  switch (type) {
    case 'landmark':
      return 'Landmark'
    case 'line':
      return 'Distance Line'
    case 'closed_curve':
      return 'Closed Curve'
    case 'text_note':
      return 'Note'
    case 'angle':
      return 'Angle'
    case 'plane':
      return 'Plane'
    case 'open_curve':
      return 'Open Curve'
    case 'roi':
      return 'ROI'
    case 'highlight':
      return 'Highlight'
    default:
      return 'Annotation'
  }
}

function normalizeOrDefault(
  n: RasPoint | undefined,
  fallback: RasPoint,
): RasPoint {
  if (!n) return fallback
  const len = Math.hypot(n[0], n[1], n[2])
  if (len < 1e-12) return fallback
  return [n[0] / len, n[1] / len, n[2] / len]
}

function triangleNormal(a: RasPoint, b: RasPoint, c: RasPoint): RasPoint {
  const ab: RasPoint = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac: RasPoint = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return normalizeOrDefault(
    [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ],
    [0, 0, 1],
  )
}

export function applyPlacementPoint(args: {
  type: AnnotationType
  existing: RasPoint[]
  /** Omitted when evaluating Enter readiness without a new point. */
  next?: RasPoint
  planeMethod?: PlanePlacementMethod
  /** View direction at placement (point-normal planes, R46). */
  viewNormal?: RasPoint
  /**
   * When true, evaluate whether current points are ready to commit
   * (curves / Enter) without requiring another tap.
   */
  forceReady?: boolean
}): PlacementDecision {
  const { type, existing, next, forceReady = false } = args
  const points = next != null ? [...existing, next] : [...existing]

  switch (type) {
    case 'highlight':
      return { kind: 'ignore' }

    case 'landmark':
      if (next == null && !forceReady) return { kind: 'ignore' }
      if (points.length < 1) return { kind: 'ignore' }
      return { kind: 'ready', points: points.slice(0, 1), meta: {} }

    case 'text_note':
      if (next == null && !forceReady) return { kind: 'ignore' }
      if (points.length < 1) return { kind: 'ignore' }
      return {
        kind: 'ready',
        points: points.slice(0, 1),
        meta: { body: '' },
      }

    case 'line':
      // R25: at most two points; a further point resets to a new A.
      if (existing.length >= 2 && next != null) {
        return { kind: 'accumulate', points: [next] }
      }
      if (points.length < 2) {
        if (next == null) return { kind: 'ignore' }
        return { kind: 'accumulate', points }
      }
      return { kind: 'ready', points: points.slice(0, 2), meta: {} }

    case 'roi':
      if (points.length < 2) {
        if (next == null) return { kind: 'ignore' }
        return { kind: 'accumulate', points }
      }
      {
        const [a, b] = points
        const min: RasPoint = [
          Math.min(a[0], b[0]),
          Math.min(a[1], b[1]),
          Math.min(a[2], b[2]),
        ]
        const max: RasPoint = [
          Math.max(a[0], b[0]),
          Math.max(a[1], b[1]),
          Math.max(a[2], b[2]),
        ]
        return {
          kind: 'ready',
          points: [min, max],
          meta: { min, max },
        }
      }

    case 'angle':
      // Order is arm A → vertex → arm B (middle point is the angle vertex).
      if (points.length < 3) {
        if (next == null) return { kind: 'ignore' }
        return { kind: 'accumulate', points }
      }
      return { kind: 'ready', points: points.slice(0, 3), meta: {} }

    case 'closed_curve': {
      // Keep accumulating past 3; finish only via forceReady (Enter / double-click).
      if (forceReady) {
        if (points.length >= 3) {
          return { kind: 'ready', points, meta: {} }
        }
        return { kind: 'ignore' }
      }
      if (next == null) return { kind: 'ignore' }
      return { kind: 'accumulate', points }
    }

    case 'open_curve': {
      // Keep accumulating past 2; finish only via forceReady (Enter / double-click).
      if (forceReady) {
        if (points.length >= 2) {
          return { kind: 'ready', points, meta: {} }
        }
        return { kind: 'ignore' }
      }
      if (next == null) return { kind: 'ignore' }
      return { kind: 'accumulate', points }
    }

    case 'plane': {
      const method = args.planeMethod ?? 'point-normal'
      const normal = normalizeOrDefault(args.viewNormal, [0, 0, 1])
      const meta: Record<string, unknown> = {
        method,
        sliceDockActive: false,
        normal,
        padMm: 10,
      }
      if (method === 'point-normal') {
        if (next == null && !forceReady) return { kind: 'ignore' }
        if (points.length < 1) return { kind: 'ignore' }
        return { kind: 'ready', points: points.slice(0, 1), meta }
      }
      if (points.length < 3) {
        if (next == null) return { kind: 'ignore' }
        return { kind: 'accumulate', points, meta }
      }
      const derived = triangleNormal(points[0], points[1], points[2])
      return {
        kind: 'ready',
        points: points.slice(0, 3),
        meta: { ...meta, normal: derived },
      }
    }

    default:
      return { kind: 'ignore' }
  }
}

/** Whether a draft point list is valid to Commit for the active type. */
export function isDraftReady(args: {
  type: AnnotationType
  points: RasPoint[]
  planeMethod?: PlanePlacementMethod
  meta?: Record<string, unknown>
}): boolean {
  const decision = applyPlacementPoint({
    type: args.type,
    existing: args.points,
    forceReady: true,
    planeMethod: args.planeMethod,
    viewNormal: Array.isArray(args.meta?.normal)
      ? (args.meta!.normal as RasPoint)
      : undefined,
  })
  return decision.kind === 'ready'
}
