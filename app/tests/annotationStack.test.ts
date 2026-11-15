import { describe, expect, it, vi } from 'vitest'
import {
  createAnnotationStack,
  stackToPreviewAnnotations,
} from '../src/ops/annotationStack'
import type { RasPoint } from '../src/domain/types'

const p = (x: number, y: number, z: number): RasPoint => [x, y, z]

describe('annotationStack', () => {
  it('pushCreate makes stack non-empty and previewable', () => {
    const stack = createAnnotationStack()
    expect(stack.isEmpty()).toBe(true)
    const id = stack.pushCreate({
      type: 'line',
      name: 'Distance Line',
      points: [p(0, 0, 0), p(3, 4, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    expect(stack.isEmpty()).toBe(false)
    expect(id).toMatch(/^stack-/)
    const preview = stackToPreviewAnnotations(stack)
    expect(preview).toHaveLength(1)
    expect(preview[0].type).toBe('line')
    expect(preview[0].points).toEqual([p(0, 0, 0), p(3, 4, 0)])
  })

  it('undoLast removes only the most recent entry', () => {
    const stack = createAnnotationStack()
    stack.pushCreate({
      type: 'landmark',
      name: 'Landmark',
      points: [p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    stack.pushCreate({
      type: 'line',
      name: 'Distance Line',
      points: [p(0, 0, 0), p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    const undone = stack.undoLast()
    expect(undone?.type).toBe('line')
    expect(stackToPreviewAnnotations(stack)).toHaveLength(1)
    expect(stackToPreviewAnnotations(stack)[0].type).toBe('landmark')
  })

  it('undoLast on empty stack returns null', () => {
    const stack = createAnnotationStack()
    expect(stack.undoLast()).toBeNull()
  })

  it('upsertCreate replaces an existing stack id', () => {
    const stack = createAnnotationStack()
    const id = stack.pushCreate({
      type: 'line',
      name: 'Distance Line',
      points: [p(0, 0, 0), p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    stack.upsertCreate(id, {
      type: 'line',
      name: 'Distance Line',
      points: [p(0, 0, 0), p(10, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    const preview = stackToPreviewAnnotations(stack)
    expect(preview).toHaveLength(1)
    expect(preview[0].points[1]).toEqual(p(10, 0, 0))
  })

  it('removeById drops a specific entry', () => {
    const stack = createAnnotationStack()
    const id = stack.pushCreate({
      type: 'line',
      name: 'Distance Line',
      points: [p(0, 0, 0), p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    stack.pushCreate({
      type: 'landmark',
      name: 'Landmark',
      points: [p(2, 2, 2)],
      meta: {},
      revisionId: 'rev-1',
    })
    expect(stack.removeById(id)).toBe(true)
    expect(stackToPreviewAnnotations(stack).map((a) => a.type)).toEqual([
      'landmark',
    ])
  })

  it('flush calls writer for each create in order then clears', async () => {
    const stack = createAnnotationStack()
    stack.pushCreate({
      type: 'landmark',
      name: 'A',
      points: [p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    stack.pushCreate({
      type: 'landmark',
      name: 'B',
      points: [p(2, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    const writer = vi.fn(async () => {})
    await stack.flush(writer)
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[0][0].name).toBe('A')
    expect(writer.mock.calls[1][0].name).toBe('B')
    expect(stack.isEmpty()).toBe(true)
  })

  it('flush failure leaves stack intact', async () => {
    const stack = createAnnotationStack()
    stack.pushCreate({
      type: 'landmark',
      name: 'A',
      points: [p(1, 0, 0)],
      meta: {},
      revisionId: 'rev-1',
    })
    await expect(
      stack.flush(async () => {
        throw new Error('api down')
      }),
    ).rejects.toThrow('api down')
    expect(stack.isEmpty()).toBe(false)
  })
})
