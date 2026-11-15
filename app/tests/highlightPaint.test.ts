import { describe, expect, it } from 'vitest'
import { resolveHighlightStroke } from '../src/geometry/highlightPaint'

describe('resolveHighlightStroke', () => {
  it('starts a new brush when there is no active stack entry', () => {
    const result = resolveHighlightStroke({
      activeEntry: null,
      strokeIndices: [1, 2],
      color: 'amber',
    })
    expect(result.mode).toBe('create')
    expect(result.triangleIndices).toEqual([1, 2])
    expect(result.color).toBe('amber')
  })

  it('accumulates strokes onto the same brush when color matches', () => {
    const result = resolveHighlightStroke({
      activeEntry: {
        id: 'stack-1',
        meta: { color: 'amber', triangleIndices: [1, 2] },
      },
      strokeIndices: [2, 3],
      color: 'amber',
    })
    expect(result).toEqual({
      mode: 'upsert',
      id: 'stack-1',
      triangleIndices: [1, 2, 3],
      color: 'amber',
    })
  })

  it('starts a new brush when Place color differs from the active entry', () => {
    const result = resolveHighlightStroke({
      activeEntry: {
        id: 'stack-1',
        meta: { color: 'amber', triangleIndices: [1, 2, 3] },
      },
      strokeIndices: [9],
      color: 'rose',
    })
    expect(result.mode).toBe('create')
    expect(result.triangleIndices).toEqual([9])
    expect(result.color).toBe('rose')
  })

  it('does not take triangle indices from a cleared draft when upserting', () => {
    const result = resolveHighlightStroke({
      activeEntry: {
        id: 'stack-1',
        meta: { color: 'emerald', triangleIndices: [4, 5] },
      },
      strokeIndices: [6],
      color: 'emerald',
      draftTriangleIndices: [],
    })
    expect(result.mode).toBe('upsert')
    expect(result.triangleIndices).toEqual([4, 5, 6])
  })
})
