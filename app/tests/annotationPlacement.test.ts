import { describe, expect, it } from 'vitest'
import {
  applyPlacementPoint,
  defaultAnnotationName,
  isDraftReady,
  type PlanePlacementMethod,
} from '../src/geometry/annotationPlacement'
import type { AnnotationType, RasPoint } from '../src/domain/types'

const p = (x: number, y: number, z: number): RasPoint => [x, y, z]

describe('applyPlacementPoint', () => {
  it('marks landmark ready after one tap (does not auto-write)', () => {
    const d = applyPlacementPoint({
      type: 'landmark',
      existing: [],
      next: p(1, 2, 3),
    })
    expect(d).toEqual({
      kind: 'ready',
      points: [p(1, 2, 3)],
      meta: {},
    })
  })

  it('marks text_note ready with empty body meta', () => {
    const d = applyPlacementPoint({
      type: 'text_note',
      existing: [],
      next: p(0, 0, 1),
    })
    expect(d.kind).toBe('ready')
    if (d.kind === 'ready') {
      expect(d.meta).toEqual({ body: '' })
    }
  })

  it('accumulates angle until 3 points then ready (A → vertex → B)', () => {
    expect(
      applyPlacementPoint({
        type: 'angle',
        existing: [],
        next: p(1, 0, 0),
      }).kind,
    ).toBe('accumulate')

    const d = applyPlacementPoint({
      type: 'angle',
      existing: [p(1, 0, 0), p(0, 0, 0)],
      next: p(0, 1, 0),
    })
    // Middle point is the angle vertex.
    expect(d).toEqual({
      kind: 'ready',
      points: [p(1, 0, 0), p(0, 0, 0), p(0, 1, 0)],
      meta: {},
    })
  })

  it('marks line and roi ready on second point', () => {
    for (const type of ['line', 'roi'] as AnnotationType[]) {
      expect(
        applyPlacementPoint({ type, existing: [], next: p(0, 0, 0) }).kind,
      ).toBe('accumulate')
      const d = applyPlacementPoint({
        type,
        existing: [p(0, 0, 0)],
        next: p(3, 4, 0),
      })
      expect(d.kind).toBe('ready')
      if (type === 'roi' && d.kind === 'ready') {
        expect(d.meta).toEqual({
          min: p(0, 0, 0),
          max: p(3, 4, 0),
        })
      }
    }
  })

  it('third line point resets to a single new A (never three points)', () => {
    const d = applyPlacementPoint({
      type: 'line',
      existing: [p(0, 0, 0), p(3, 4, 0)],
      next: p(9, 9, 9),
    })
    expect(d).toEqual({
      kind: 'accumulate',
      points: [p(9, 9, 9)],
    })
  })

  it('keeps accumulating closed/open curves past min count until forceReady', () => {
    const closedThird = applyPlacementPoint({
      type: 'closed_curve',
      existing: [p(0, 0, 0), p(1, 0, 0)],
      next: p(1, 1, 0),
    })
    expect(closedThird).toEqual({
      kind: 'accumulate',
      points: [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)],
    })

    const closedFourth = applyPlacementPoint({
      type: 'closed_curve',
      existing: [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)],
      next: p(0, 1, 0),
    })
    expect(closedFourth.kind).toBe('accumulate')
    if (closedFourth.kind === 'accumulate') {
      expect(closedFourth.points).toHaveLength(4)
    }

    const commitClosed = applyPlacementPoint({
      type: 'closed_curve',
      existing: [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0)],
      forceReady: true,
    })
    expect(commitClosed.kind).toBe('ready')
    if (commitClosed.kind === 'ready') {
      expect(commitClosed.points).toHaveLength(4)
    }

    const openForceTooEarly = applyPlacementPoint({
      type: 'open_curve',
      existing: [p(0, 0, 0)],
      forceReady: true,
    })
    expect(openForceTooEarly.kind).toBe('ignore')

    const openKeepGoing = applyPlacementPoint({
      type: 'open_curve',
      existing: [p(0, 0, 0), p(1, 0, 0)],
      next: p(2, 0, 0),
    })
    expect(openKeepGoing.kind).toBe('accumulate')
  })

  it('marks plane ready by method with normal meta', () => {
    const pn = applyPlacementPoint({
      type: 'plane',
      existing: [],
      next: p(1, 2, 3),
      planeMethod: 'point-normal' satisfies PlanePlacementMethod,
      viewNormal: p(0, 1, 0),
    })
    expect(pn).toEqual({
      kind: 'ready',
      points: [p(1, 2, 3)],
      meta: {
        method: 'point-normal',
        sliceDockActive: false,
        normal: [0, 1, 0],
        padMm: 10,
      },
    })

    const tp = applyPlacementPoint({
      type: 'plane',
      existing: [p(0, 0, 0), p(1, 0, 0)],
      next: p(0, 1, 0),
      planeMethod: 'three-point',
    })
    expect(tp.kind).toBe('ready')
    if (tp.kind === 'ready') {
      expect(tp.meta.method).toBe('three-point')
      expect(tp.meta.normal).toEqual([0, 0, 1])
    }
  })

  it('ignores highlight (paint path owns it)', () => {
    expect(
      applyPlacementPoint({
        type: 'highlight',
        existing: [],
        next: p(0, 0, 0),
      }),
    ).toEqual({ kind: 'ignore' })
  })
})

describe('isDraftReady', () => {
  it('reports readiness without auto-writing', () => {
    expect(
      isDraftReady({ type: 'landmark', points: [p(0, 0, 0)] }),
    ).toBe(true)
    expect(isDraftReady({ type: 'line', points: [p(0, 0, 0)] })).toBe(false)
    expect(
      isDraftReady({ type: 'line', points: [p(0, 0, 0), p(1, 0, 0)] }),
    ).toBe(true)
  })
})

describe('defaultAnnotationName', () => {
  it('returns stable display names', () => {
    expect(defaultAnnotationName('landmark')).toBe('Landmark')
    expect(defaultAnnotationName('line')).toBe('Distance Line')
    expect(defaultAnnotationName('angle')).toBe('Angle')
  })
})
