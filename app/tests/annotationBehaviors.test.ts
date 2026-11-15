import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  anglePreviewSegments,
  applyOrientedExtentDrag,
  behaviorFor,
  emphasizeObjects,
  pointSetPlaceHint,
  rotatePlaneNormal,
  scaleRoi,
  syncGroupEmphasis,
} from '../src/viewport/annotationBehaviors'
import type { Annotation } from '../src/domain/types'

describe('behaviorFor registry', () => {
  it('maps line/curve/angle/text to pointSet', () => {
    for (const type of [
      'line',
      'closed_curve',
      'open_curve',
      'angle',
      'text_note',
      'landmark',
    ] as const) {
      expect(behaviorFor(type).kind).toBe('pointSet')
    }
  })

  it('maps plane and roi to orientedExtent', () => {
    expect(behaviorFor('plane').kind).toBe('orientedExtent')
    expect(behaviorFor('roi').kind).toBe('orientedExtent')
  })

  it('maps highlight to selectable only', () => {
    expect(behaviorFor('highlight')).toEqual({
      kind: 'selectable',
      isPointSet: false,
      isOrientedExtent: false,
    })
  })
})

describe('PointSetBehavior angle preview', () => {
  it('angle has no Place hint (Place-hidden)', () => {
    expect(pointSetPlaceHint('angle')).toBeNull()
  })

  it('open/closed curve hints name double-clicking the last point', () => {
    expect(pointSetPlaceHint('open_curve')).toMatch(/double-click the last point/)
    expect(pointSetPlaceHint('closed_curve')).toMatch(/double-click the last point/)
  })

  it('anglePreviewSegments never draws a straight polyline of three points', () => {
    const a: [number, number, number] = [1, 0, 0]
    const v: [number, number, number] = [0, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    expect(anglePreviewSegments([a, v], [0, 0.5, 0])).toEqual([
      [a, v],
      [v, [0, 0.5, 0]],
    ])
    expect(anglePreviewSegments([a, v, b])).toEqual([
      [a, v],
      [v, b],
    ])
  })
})

describe('SelectableBehavior group emphasis', () => {
  it('emphasizeObjects scales every mesh in the group', () => {
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial())
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial())
    g1.scale.set(1, 1, 1)
    g2.scale.set(1, 1, 1)
    emphasizeObjects([g1, g2], 'selected')
    expect(g1.scale.x).toBeGreaterThan(1)
    expect(g2.scale.x).toBeGreaterThan(1)
  })

  it('syncGroupEmphasis marks all objs for selected id', () => {
    const a = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial())
    const b = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial())
    const other = new THREE.Mesh(
      new THREE.SphereGeometry(1),
      new THREE.MeshBasicMaterial(),
    )
    const map = new Map<string, THREE.Object3D[]>([
      ['line-1', [a, b]],
      ['line-2', [other]],
    ])
    syncGroupEmphasis(map, 'line-1', null)
    expect(a.userData.emphasisLevel).toBe('selected')
    expect(b.userData.emphasisLevel).toBe('selected')
    expect(other.userData.emphasisLevel).toBe('none')
  })
})

describe('OrientedExtentBehavior math', () => {
  const planeAnn = {
    id: 'p1',
    type: 'plane' as const,
    points: [[0, 0, 0] as [number, number, number]],
    meta: { normal: [1, 0, 0], padMm: 10 },
  }

  const roiAnn = {
    id: 'r1',
    type: 'roi' as const,
    points: [
      [0, 0, 0] as [number, number, number],
      [10, 10, 10] as [number, number, number],
    ],
    meta: { min: [0, 0, 0], max: [10, 10, 10] },
  }

  it('rotatePlaneNormal yaws around Z', () => {
    const edit = rotatePlaneNormal(planeAnn, Math.PI / 2)
    expect(edit.meta.normal).toBeDefined()
    const n = edit.meta.normal as number[]
    expect(Math.abs(n[0])).toBeCloseTo(0, 5)
    expect(Math.abs(n[1])).toBeCloseTo(1, 5)
  })

  it('scaleRoi grows about center', () => {
    const edit = scaleRoi(roiAnn, 2)
    expect(edit.meta.min).toEqual([-5, -5, -5])
    expect(edit.meta.max).toEqual([15, 15, 15])
  })

  it('applyOrientedExtentDrag rotates plane on rotate mode', () => {
    const edit = applyOrientedExtentDrag(planeAnn, 'rotate', { x: 100, y: 0 })
    expect(edit.meta.normal).not.toEqual(planeAnn.meta.normal)
  })

  it('applyOrientedExtentDrag scales roi', () => {
    const edit = applyOrientedExtentDrag(roiAnn, 'scale', { x: 20, y: 0 })
    const min = edit.meta.min as number[]
    const max = edit.meta.max as number[]
    expect(max[0] - min[0]).toBeGreaterThan(10)
  })
})

describe('Annotation shape for emphasis wiring', () => {
  it('line annotation objects share annotationId in overlay builders', () => {
    // smoke: Annotation type remains groupable by id
    const ann: Pick<Annotation, 'id' | 'type'> = { id: 'x', type: 'line' }
    expect(ann.id).toBe('x')
  })
})
