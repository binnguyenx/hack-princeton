/** Shared Place/View pointer gesture classifier (R79–R80). */

export const GESTURE_MOVE_PX = 4
export const GESTURE_HOLD_MS = 280

export type PointerSample = {
  type: 'down' | 'move' | 'up'
  clientX: number
  clientY: number
  timeStamp: number
  altKey: boolean
}

export type GestureResult =
  | { kind: 'tap'; clientX: number; clientY: number }
  | { kind: 'hold'; clientX: number; clientY: number }
  | {
      kind: 'drag'
      clientX: number
      clientY: number
      deltaX: number
      deltaY: number
      altKey: boolean
    }
  | {
      kind: 'modifierDrag'
      clientX: number
      clientY: number
      deltaX: number
      deltaY: number
      altKey: true
    }
  | { kind: 'ignore' }

/** True when the event target is inside a marked canvas surface. */
export function isCanvasSurfaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('[data-canvas-surface="viewport"], [data-canvas-surface="slice"]'))
}

function dist(a: PointerSample, b: PointerSample): number {
  const dx = b.clientX - a.clientX
  const dy = b.clientY - a.clientY
  return Math.hypot(dx, dy)
}

/**
 * Classify a pointer sequence that started on a canvas surface.
 * Pass `move` for in-progress drag detection; `up` to finalize tap/hold.
 */
export function classifyPointerGesture(args: {
  down: PointerSample | null
  move?: PointerSample | null
  up?: PointerSample | null
}): GestureResult {
  const { down, move, up } = args
  if (!down) return { kind: 'ignore' }

  const latest = up ?? move ?? down
  const travel = dist(down, latest)
  const dt = latest.timeStamp - down.timeStamp
  const alt = Boolean(latest.altKey || down.altKey)

  if (travel >= GESTURE_MOVE_PX) {
    const deltaX = latest.clientX - down.clientX
    const deltaY = latest.clientY - down.clientY
    if (alt) {
      return {
        kind: 'modifierDrag',
        clientX: latest.clientX,
        clientY: latest.clientY,
        deltaX,
        deltaY,
        altKey: true,
      }
    }
    return {
      kind: 'drag',
      clientX: latest.clientX,
      clientY: latest.clientY,
      deltaX,
      deltaY,
      altKey: false,
    }
  }

  // Finalize only on up (or explicit hold timeout via up with long dt).
  if (up) {
    if (dt >= GESTURE_HOLD_MS) {
      return { kind: 'hold', clientX: up.clientX, clientY: up.clientY }
    }
    return { kind: 'tap', clientX: up.clientX, clientY: up.clientY }
  }

  return { kind: 'ignore' }
}
