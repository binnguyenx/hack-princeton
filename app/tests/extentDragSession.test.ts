import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Annotation } from '../src/domain/types'
import { beginHandleDrag } from '../src/viewport/annotationBehaviors/extentDrag'
import { createExtentDragSession } from '../src/viewport/annotationBehaviors/extentDragSession'

const roi: Annotation = {
  id: 'roi-1', revisionId: 'r', type: 'roi', name: 'ROI', points: [[0, 0, 0], [10, 10, 10]],
  meta: { min: [0, 0, 0], max: [10, 10, 10] }, locked: false, visible: true, createdAt: '',
}
const cam = new THREE.Vector3(10, 80, 5)
const rayTo = (x: number) => new THREE.Ray(cam.clone(), new THREE.Vector3(x, 5, 5).sub(cam).normalize())

/** Manual frame scheduler so tests decide when a frame happens. */
function frames() {
  const queue: Array<() => void> = []
  return {
    schedule: (cb: () => void) => { queue.push(cb); return queue.length },
    cancel: () => { queue.length = 0 },
    flush: () => { const run = queue.splice(0); run.forEach((cb) => cb()) },
    pending: () => queue.length,
  }
}

function session() {
  const f = frames()
  const onLive = vi.fn()
  const onCommit = vi.fn()
  const s = createExtentDragSession({
    original: roi,
    drag: beginHandleDrag(roi, 'roi-face-x+', rayTo(10)),
    onLive,
    onCommit,
    schedule: f.schedule,
    cancelScheduled: f.cancel,
  })
  return { s, f, onLive, onCommit }
}

describe('extent drag session (mechanical-last-parts R91, R92, S25)', () => {
  it('sends at most one live update per frame, using the latest pointer', () => {
    const { s, f, onLive } = session()
    s.move(rayTo(12))
    s.move(rayTo(14))
    s.move(rayTo(16))
    expect(onLive).not.toHaveBeenCalled()
    f.flush()
    expect(onLive).toHaveBeenCalledTimes(1)
    expect((onLive.mock.calls[0][0].meta.max as number[])[0]).toBeCloseTo(16, 1)
  })

  it('releasing commits exactly one update with the final geometry', () => {
    const { s, f, onCommit } = session()
    s.move(rayTo(13))
    f.flush()
    s.move(rayTo(18))
    s.end()
    s.end()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect((onCommit.mock.calls[0][0].meta.max as number[])[0]).toBeCloseTo(18, 1)
    expect(f.pending()).toBe(0)
  })

  it('a click without movement commits nothing', () => {
    const { s, onCommit } = session()
    s.end()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancel restores the pre-drag geometry, commits nothing and ignores later events', () => {
    const { s, f, onLive, onCommit } = session()
    s.move(rayTo(15))
    f.flush()
    expect(s.cancel()).toBe(true)
    const restored = onLive.mock.calls.at(-1)![0]
    expect(restored.points).toEqual(roi.points)
    expect(restored.meta).toEqual(roi.meta)
    s.move(rayTo(30))
    f.flush()
    s.end()
    expect(onCommit).not.toHaveBeenCalled()
    expect(onLive.mock.calls.at(-1)![0].meta).toEqual(roi.meta)
    expect(s.active).toBe(false)
    expect(s.cancel()).toBe(false)
  })
})
