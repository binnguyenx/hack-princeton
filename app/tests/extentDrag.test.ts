import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Annotation, RasPoint } from '../src/domain/types'
import { beginHandleDrag, extentHandleLayout, planeFrame } from '../src/viewport/annotationBehaviors/extentDrag'
import { roiVolume } from '../src/geometry/annotationMeasure'

function roi(min: RasPoint, max: RasPoint): Annotation {
  return {
    id: 'roi-1', revisionId: 'r', type: 'roi', name: 'ROI', points: [min, max],
    meta: { min, max }, locked: false, visible: true, createdAt: '',
  }
}

/** A ray from `from` through `to`, the way a camera ray through the cursor looks. */
function rayThrough(from: [number, number, number], to: [number, number, number]): THREE.Ray {
  const o = new THREE.Vector3(...from)
  return new THREE.Ray(o, new THREE.Vector3(...to).sub(o).normalize())
}

describe('ROI face drag (mechanical-last-parts R90)', () => {
  it('S23: dragging the +X face 10 mm moves only max.x, from an oblique camera', () => {
    const ann = roi([0, 0, 0], [10, 10, 10])
    const cam: [number, number, number] = [60, 80, 50]
    const drag = beginHandleDrag(ann, 'roi-face-x+', rayThrough(cam, [10, 5, 5]))
    const edit = drag(rayThrough(cam, [20, 5, 5]))
    const min = edit.meta.min as RasPoint
    const max = edit.meta.max as RasPoint
    expect(min).toEqual([0, 0, 0])
    expect(max[0]).toBeCloseTo(20, 1)
    expect(max[1]).toBe(10)
    expect(max[2]).toBe(10)
    expect(edit.points).toEqual([min, max])
    expect(roiVolume(min, max)).toBeCloseTo(2000, 0)
  })

  it('keeps the grab offset: grabbing off the face centre does not jump the face', () => {
    const ann = roi([0, 0, 0], [10, 10, 10])
    const cam: [number, number, number] = [10, 80, 5]
    const drag = beginHandleDrag(ann, 'roi-face-x+', rayThrough(cam, [11, 5, 5]))
    const edit = drag(rayThrough(cam, [11, 5, 5]))
    expect((edit.meta.max as RasPoint)[0]).toBeCloseTo(10, 6)
  })

  it('S24: the dragged face clamps 2 mm from the opposite face', () => {
    const ann = roi([0, 0, 0], [5, 10, 10])
    const cam: [number, number, number] = [5, 80, 5]
    const drag = beginHandleDrag(ann, 'roi-face-x+', rayThrough(cam, [5, 5, 5]))
    const edit = drag(rayThrough(cam, [-5, 5, 5]))
    expect((edit.meta.max as RasPoint)[0]).toBeCloseTo(2, 6)
    expect((edit.meta.min as RasPoint)[0]).toBe(0)
  })

  it('a -Z face moves min.z and leaves max fixed', () => {
    const ann = roi([0, 0, 0], [10, 10, 10])
    const cam: [number, number, number] = [5, 80, 0]
    const drag = beginHandleDrag(ann, 'roi-face-z-', rayThrough(cam, [5, 5, 0]))
    const edit = drag(rayThrough(cam, [5, 5, -4]))
    expect((edit.meta.min as RasPoint)[2]).toBeCloseTo(-4, 1)
    expect(edit.meta.max).toEqual([10, 10, 10])
  })
})

describe('ROI centre move (mechanical-last-parts R90)', () => {
  it('translates the whole box with the pointer, keeping its size', () => {
    const ann = roi([0, 0, 0], [10, 20, 30])
    const cam: [number, number, number] = [5, 10, 200]
    const drag = beginHandleDrag(ann, 'roi-move', rayThrough(cam, [5, 10, 15]))
    const edit = drag(rayThrough(cam, [12, 6, 15]))
    const min = edit.meta.min as RasPoint
    const max = edit.meta.max as RasPoint
    expect(min[0]).toBeCloseTo(7, 6)
    expect(min[1]).toBeCloseTo(-4, 6)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(max[0] - min[0]).toBeCloseTo(10, 6)
    expect(max[1] - min[1]).toBeCloseTo(20, 6)
    expect(max[2] - min[2]).toBeCloseTo(30, 6)
  })
})

function plane(normal: [number, number, number], padMm = 0): Annotation {
  return {
    id: 'pl-1', revisionId: 'r', type: 'plane', name: 'Plane', points: [[0, 0, 0]],
    meta: { method: 'point-normal', normal, padMm }, locked: false, visible: true, createdAt: '',
  }
}

const BBOX = [100, 120, 80]

describe('plane handle layout (mechanical-last-parts R89)', () => {
  it('puts the move handle at the origin, tilt knobs on a ring in the plane, and the size handle on the edge', () => {
    const ann = plane([0, 0.6, 0.8])
    const frame = planeFrame(ann, BBOX)
    const handles = extentHandleLayout(ann, BBOX)
    const ids = handles.map((h) => h.id).sort()
    expect(ids).toEqual(['plane-move', 'plane-size', 'plane-tilt-0', 'plane-tilt-1', 'plane-tilt-2', 'plane-tilt-3'])
    const at = (id: string) => new THREE.Vector3(...handles.find((h) => h.id === id)!.position)
    expect(at('plane-move').toArray()).toEqual([0, 0, 0])
    for (const i of [0, 1, 2, 3]) {
      const knob = at(`plane-tilt-${i}`)
      expect(knob.dot(frame.normal)).toBeCloseTo(0, 6)
      expect(knob.length()).toBeCloseTo(frame.ringRadius, 6)
    }
    const size = at('plane-size')
    expect(size.dot(frame.normal)).toBeCloseTo(0, 6)
    expect(size.length()).toBeCloseTo(frame.halfWidth, 6)
  })
})

describe('plane move (mechanical-last-parts R89)', () => {
  it('drags the origin along the normal from an oblique camera, keeping the normal', () => {
    const ann = plane([0, 0, 1])
    const cam: [number, number, number] = [60, -40, 50]
    const drag = beginHandleDrag(ann, 'plane-move', rayThrough(cam, [0, 0, 0]), BBOX)
    const edit = drag(rayThrough(cam, [0, 0, 12]))
    const origin = edit.points[0]
    expect(origin[0]).toBeCloseTo(0, 6)
    expect(origin[1]).toBeCloseTo(0, 6)
    expect(origin[2]).toBeCloseTo(12, 4)
    expect(edit.meta.normal).toEqual([0, 0, 1])
  })
})

describe('plane tilt (mechanical-last-parts R89, S22)', () => {
  it('rotates the normal so the dragged knob stays on the pointer ray from an oblique camera', () => {
    const ann = plane([0, 0, 1])
    const f = planeFrame(ann, BBOX)
    const knob0 = extentHandleLayout(ann, BBOX).find((h) => h.id === 'plane-tilt-0')!.position
    const cam: [number, number, number] = [-80, -120, 90]
    const drag = beginHandleDrag(ann, 'plane-tilt-0', rayThrough(cam, knob0), BBOX)
    // Aim at a point on the ring sphere 35° out of the plane.
    const a = (35 * Math.PI) / 180
    const target = f.u.clone().multiplyScalar(Math.cos(a) * f.ringRadius).add(f.normal.clone().multiplyScalar(Math.sin(a) * f.ringRadius))
    const ray = rayThrough(cam, target.toArray() as [number, number, number])
    const edit = drag(ray)
    const n = new THREE.Vector3(...(edit.meta.normal as [number, number, number]))
    expect(n.length()).toBeCloseTo(1, 6)
    expect(Math.hypot(n.x, n.y)).toBeGreaterThan(0.3)
    const grip = new THREE.Vector3(...edit.grip!)
    expect(ray.distanceToPoint(grip)).toBeLessThan(1e-3)
    expect(grip.dot(n)).toBeCloseTo(0, 6)
    expect(grip.length()).toBeCloseTo(f.ringRadius, 6)
    expect(edit.points[0]).toEqual([0, 0, 0])
  })

  it('still answers when the pointer leaves the ring sphere (no jump, no NaN)', () => {
    const ann = plane([0, 0, 1])
    const knob0 = extentHandleLayout(ann, BBOX).find((h) => h.id === 'plane-tilt-0')!.position
    const cam: [number, number, number] = [0, -200, 0]
    const drag = beginHandleDrag(ann, 'plane-tilt-0', rayThrough(cam, knob0), BBOX)
    const edit = drag(rayThrough(cam, [400, 0, 300]))
    const n = edit.meta.normal as number[]
    expect(n.every(Number.isFinite)).toBe(true)
  })
})

describe('plane size (mechanical-last-parts R88, R89)', () => {
  it('the size handle edge follows the pointer along the plane, changing the pad', () => {
    const ann = plane([0, 0, 1], 0)
    const f = planeFrame(ann, BBOX)
    const edge = extentHandleLayout(ann, BBOX).find((h) => h.id === 'plane-size')!.position
    const cam: [number, number, number] = [40, -150, 120]
    const drag = beginHandleDrag(ann, 'plane-size', rayThrough(cam, edge), BBOX)
    const target = f.u.clone().multiplyScalar(f.halfWidth + 15)
    const edit = drag(rayThrough(cam, target.toArray() as [number, number, number]))
    expect(Number(edit.meta.padMm)).toBeCloseTo(15, 3)
    const after = planeFrame({ ...ann, points: edit.points, meta: edit.meta }, BBOX)
    expect(after.halfWidth).toBeCloseTo(f.halfWidth + 15, 3)
  })

  it('never shrinks the plane below a 10 mm half-width', () => {
    const ann = plane([0, 0, 1], 0)
    const edge = extentHandleLayout(ann, BBOX).find((h) => h.id === 'plane-size')!.position
    const cam: [number, number, number] = [0, -150, 120]
    const drag = beginHandleDrag(ann, 'plane-size', rayThrough(cam, edge), BBOX)
    const edit = drag(rayThrough(cam, [-500, 0, 0]))
    expect(planeFrame({ ...ann, meta: edit.meta }, BBOX).halfWidth).toBeCloseTo(10, 6)
  })
})
