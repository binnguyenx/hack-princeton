/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  GESTURE_HOLD_MS,
  GESTURE_MOVE_PX,
  classifyPointerGesture,
  isCanvasSurfaceTarget,
  type PointerSample,
} from '../src/viewport/canvasGestures'

function sample(
  partial: Partial<PointerSample> & Pick<PointerSample, 'type'>,
): PointerSample {
  return {
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
    altKey: false,
    ...partial,
  }
}

describe('isCanvasSurfaceTarget', () => {
  it('accepts viewport and slice surfaces', () => {
    const viewport = document.createElement('div')
    viewport.setAttribute('data-canvas-surface', 'viewport')
    const inner = document.createElement('canvas')
    viewport.appendChild(inner)
    expect(isCanvasSurfaceTarget(inner)).toBe(true)

    const slice = document.createElement('div')
    slice.setAttribute('data-canvas-surface', 'slice')
    expect(isCanvasSurfaceTarget(slice)).toBe(true)
  })

  it('rejects chrome without data-canvas-surface', () => {
    const strip = document.createElement('div')
    strip.className = 'canvas-context-strip'
    const btn = document.createElement('button')
    strip.appendChild(btn)
    expect(isCanvasSurfaceTarget(btn)).toBe(false)
    expect(isCanvasSurfaceTarget(null)).toBe(false)
  })
})

describe('classifyPointerGesture', () => {
  it('classifies tap when movement and duration are under thresholds', () => {
    const g = classifyPointerGesture({
      down: sample({ type: 'down', clientX: 10, clientY: 10, timeStamp: 1000 }),
      up: sample({ type: 'up', clientX: 12, clientY: 11, timeStamp: 1100 }),
    })
    expect(g).toEqual({ kind: 'tap', clientX: 12, clientY: 11 })
  })

  it('classifies drag when movement exceeds threshold', () => {
    const g = classifyPointerGesture({
      down: sample({ type: 'down', clientX: 0, clientY: 0, timeStamp: 0 }),
      move: sample({
        type: 'move',
        clientX: GESTURE_MOVE_PX + 1,
        clientY: 0,
        timeStamp: 50,
      }),
    })
    expect(g.kind).toBe('drag')
    if (g.kind === 'drag') {
      expect(g.altKey).toBe(false)
      expect(g.deltaX).toBe(GESTURE_MOVE_PX + 1)
    }
  })

  it('classifies modifierDrag when alt is held during drag', () => {
    const g = classifyPointerGesture({
      down: sample({ type: 'down', clientX: 0, clientY: 0, timeStamp: 0 }),
      move: sample({
        type: 'move',
        clientX: 20,
        clientY: 0,
        timeStamp: 40,
        altKey: true,
      }),
    })
    expect(g).toMatchObject({ kind: 'modifierDrag', altKey: true })
  })

  it('classifies hold when duration exceeds hold ms with little movement', () => {
    const g = classifyPointerGesture({
      down: sample({ type: 'down', clientX: 5, clientY: 5, timeStamp: 0 }),
      up: sample({
        type: 'up',
        clientX: 6,
        clientY: 5,
        timeStamp: GESTURE_HOLD_MS + 20,
      }),
    })
    expect(g.kind).toBe('hold')
  })

  it('ignores events that never left chrome (no down on surface)', () => {
    const g = classifyPointerGesture({
      down: null,
      up: sample({ type: 'up', clientX: 1, clientY: 1, timeStamp: 10 }),
    })
    expect(g).toEqual({ kind: 'ignore' })
  })
})
