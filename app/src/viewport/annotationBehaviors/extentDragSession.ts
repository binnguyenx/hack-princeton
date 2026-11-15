import type * as THREE from 'three'
import type { Annotation } from '../../domain/types'
import type { HandleDrag, HandleDragResult } from './extentDrag'

/**
 * One plane/ROI handle drag (mechanical-last-parts R91, R92):
 * live updates at most once per frame, one commit on release, cancel restores the original.
 */
export type ExtentDragSession = {
  readonly active: boolean
  move(ray: THREE.Ray): void
  /** Release: commits the final geometry once (nothing if the pointer never moved). */
  end(): void
  /** Escape / pointercancel: restores the pre-drag geometry. Returns false if already finished. */
  cancel(): boolean
}

export function createExtentDragSession(args: {
  original: Annotation
  drag: HandleDrag
  onLive: (edit: HandleDragResult) => void
  onCommit: (edit: HandleDragResult) => void
  schedule?: (cb: () => void) => unknown
  cancelScheduled?: (handle: unknown) => void
}): ExtentDragSession {
  const schedule = args.schedule ?? ((cb: () => void) => requestAnimationFrame(cb))
  const cancelScheduled = args.cancelScheduled ?? ((h: unknown) => cancelAnimationFrame(h as number))
  let active = true
  let pendingRay: THREE.Ray | null = null
  let frame: unknown = null
  let latest: HandleDragResult | null = null

  const flush = () => {
    frame = null
    if (!active || !pendingRay) return
    latest = args.drag(pendingRay)
    pendingRay = null
    args.onLive(latest)
  }

  const stopFrame = () => {
    if (frame !== null) cancelScheduled(frame)
    frame = null
  }

  return {
    get active() {
      return active
    },
    move(ray) {
      if (!active) return
      pendingRay = ray
      if (frame === null) frame = schedule(flush)
    },
    end() {
      if (!active) return
      stopFrame()
      if (pendingRay) latest = args.drag(pendingRay)
      pendingRay = null
      active = false
      if (latest) args.onCommit(latest)
    },
    cancel() {
      if (!active) return false
      stopFrame()
      pendingRay = null
      active = false
      args.onLive({ points: args.original.points, meta: args.original.meta })
      return true
    },
  }
}
