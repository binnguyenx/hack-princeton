import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Annotation } from '../src/domain/types'
import {
  accumulateBrushTriangles,
  buildAngleArc,
  buildCurvePolyline,
  buildGlyph,
  buildHighlightOverlay,
  buildLabel,
  buildLine,
  buildPlane,
  buildROIBox,
  syncAnnotationObjects,
} from '../src/viewport/AnnotationOverlay'

function ann(
  partial: Partial<Annotation> & Pick<Annotation, 'type' | 'points'>,
): Annotation {
  return {
    id: 'ann-1',
    revisionId: 'rev-1',
    name: 'Test',
    meta: {},
    locked: false,
    visible: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('AnnotationOverlay builders', () => {
  it('buildGlyph returns a Mesh with SphereGeometry for landmark', () => {
    const mesh = buildGlyph(ann({ type: 'landmark', points: [[1, 2, 3]] }))
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry)
    expect(mesh.position.toArray()).toEqual([1, 2, 3])
  })

  it('buildLine returns a Line object for a 2-point line annotation', () => {
    const line = buildLine(
      ann({
        type: 'line',
        points: [
          [0, 0, 0],
          [3, 4, 0],
        ],
      }),
    )
    expect(line).toBeInstanceOf(THREE.Line)
    expect(line!.geometry.getAttribute('position').count).toBe(2)
  })

  it('line sync attaches shared annotationId to every object in the group', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    syncAnnotationObjects(
      scene,
      [
        ann({
          type: 'line',
          points: [
            [0, 0, 0],
            [3, 4, 0],
          ],
        }),
      ],
      prev,
    )
    const objs = prev.current.get('ann-1') ?? []
    expect(objs.length).toBeGreaterThanOrEqual(3)
    for (const obj of objs) {
      expect(obj.userData.annotationId).toBe('ann-1')
    }
  })

  it('buildPlane grows with meta.padMm', () => {
    const base = buildPlane(
      ann({
        type: 'plane',
        points: [[0, 0, 0]],
        meta: { normal: [0, 0, 1] },
      }),
      [100, 80, 60],
    )
    const padded = buildPlane(
      ann({
        type: 'plane',
        points: [[0, 0, 0]],
        meta: { normal: [0, 0, 1], padMm: 15 },
      }),
      [100, 80, 60],
    )
    const baseGeom = (base[0] as THREE.Mesh).geometry as THREE.PlaneGeometry
    const padGeom = (padded[0] as THREE.Mesh).geometry as THREE.PlaneGeometry
    expect(padGeom.parameters.width).toBe(baseGeom.parameters.width + 30)
    expect(padGeom.parameters.height).toBe(baseGeom.parameters.height + 30)
  })

  it('buildCurveGeometry returns correct vertex count for closed curve', () => {
    const curve = buildCurvePolyline(
      ann({
        type: 'closed_curve',
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ],
      }),
      true,
    )
    expect(curve).toBeInstanceOf(THREE.Line)
    // 4 points + closing back to first → 5 vertices
    expect(curve!.geometry.getAttribute('position').count).toBe(5)
  })

  it('buildLabel returns a Sprite for text note', () => {
    const sprite = buildLabel(
      ann({ type: 'text_note', points: [[0, 0, 0]], meta: { body: 'hello' } }),
      'hello',
    )
    expect(sprite).toBeInstanceOf(THREE.Sprite)
  })

  it('buildAngleArc returns arm geometry and degree label for 3 points', () => {
    const objs = buildAngleArc(
      ann({
        type: 'angle',
        points: [
          [1, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
        ],
      }),
    )
    expect(objs.length).toBeGreaterThanOrEqual(2)
    expect(objs.some((o) => o instanceof THREE.Line)).toBe(true)
    expect(objs.some((o) => o instanceof THREE.Sprite)).toBe(true)
  })

  it('buildAngleArc returns empty when fewer than 3 points', () => {
    expect(
      buildAngleArc(
        ann({
          type: 'angle',
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        }),
      ),
    ).toEqual([])
  })

  it('buildROIBox returns fill mesh + edge lines for ROI', () => {
    const objs = buildROIBox(
      ann({
        type: 'roi',
        points: [
          [0, 0, 0],
          [3, 4, 5],
        ],
        meta: { min: [0, 0, 0], max: [3, 4, 5] },
      }),
    )
    expect(objs).toHaveLength(2)
    expect(objs[0]).toBeInstanceOf(THREE.Mesh)
    expect(objs[1]).toBeInstanceOf(THREE.LineSegments)
  })

  it('buildPlane returns Mesh with PlaneGeometry sized to bbox + 10mm pad', () => {
    const objs = buildPlane(
      ann({
        type: 'plane',
        points: [[0, 0, 0]],
        meta: { method: 'point-normal', normal: [0, 1, 0] },
      }),
      [100, 80, 60],
    )
    expect(objs[0]).toBeInstanceOf(THREE.Mesh)
    const geom = (objs[0] as THREE.Mesh).geometry as THREE.PlaneGeometry
    expect(geom).toBeInstanceOf(THREE.PlaneGeometry)
    // Two largest extents 100×80 + 20 pad
    expect(geom.parameters.width).toBe(120)
    expect(geom.parameters.height).toBe(100)
  })

  it('buildPlane orients from meta.normal', () => {
    const objs = buildPlane(
      ann({
        type: 'plane',
        points: [[1, 2, 3]],
        meta: { normal: [0, 1, 0] },
      }),
    )
    const mesh = objs[0] as THREE.Mesh
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion)
    expect(localZ.y).toBeGreaterThan(0.99)
  })

  it('buildHighlightOverlay filters triangle indices', () => {
    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(12 * 3)
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setIndex([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 3, 1, 2, 4, 2, 3, 5, 3, 4, 6, 4,
      5, 7, 5, 6, 8,
    ])
    const mesh = new THREE.Mesh(geom)
    const overlay = buildHighlightOverlay(
      ann({
        type: 'highlight',
        points: [[0, 0, 0]],
        meta: { color: 'accent', triangleIndices: [0, 1] },
      }),
      mesh,
    )
    expect(overlay).toBeInstanceOf(THREE.Mesh)
    expect(overlay!.geometry.getIndex()!.count).toBe(6)
  })

  it('syncAnnotationObjects diffs add and remove on the scene', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    const a = ann({
      id: 'ann-a',
      type: 'landmark',
      points: [[1, 0, 0]],
    })
    const b = ann({
      id: 'ann-b',
      type: 'landmark',
      points: [[0, 1, 0]],
    })
    syncAnnotationObjects(scene, [a, b], prev)
    expect(prev.current.has('ann-a')).toBe(true)
    expect(prev.current.has('ann-b')).toBe(true)
    const afterAdd = scene.children.length
    expect(afterAdd).toBeGreaterThan(0)

    syncAnnotationObjects(scene, [a], prev)
    expect(prev.current.has('ann-a')).toBe(true)
    expect(prev.current.has('ann-b')).toBe(false)
    expect(scene.children.length).toBeLessThan(afterAdd)

    syncAnnotationObjects(scene, [], prev)
    expect(prev.current.size).toBe(0)
    expect(scene.children.length).toBe(0)
  })

  it('syncAnnotationObjects shows hover cursor preview with zero placed points', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    syncAnnotationObjects(scene, [], prev, null, undefined, {
      type: 'landmark',
      points: [],
      hoverCursor: [5, 6, 7],
    })
    const preview = prev.current.get('__preview__')
    expect(preview?.length).toBeGreaterThan(0)
    expect(scene.children.length).toBeGreaterThan(0)
  })

  it('syncAnnotationObjects extends line preview to hover cursor', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    syncAnnotationObjects(scene, [], prev, null, undefined, {
      type: 'line',
      points: [[0, 0, 0]],
      hoverCursor: [10, 0, 0],
    })
    const preview = prev.current.get('__preview__')
    const line = preview?.find((o) => o instanceof THREE.Line) as THREE.Line
    expect(line).toBeTruthy()
    expect(line.geometry.getAttribute('position').count).toBe(2)
  })

  it('buildHighlightOverlay returns null and fires stale callback for OOR indices', () => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(9), 3),
    )
    geom.setIndex([0, 1, 2])
    const mesh = new THREE.Mesh(geom)
    let stale = false
    const overlay = buildHighlightOverlay(
      ann({
        type: 'highlight',
        points: [[0, 0, 0]],
        meta: { color: 'accent', triangleIndices: [99] },
      }),
      mesh,
      () => {
        stale = true
      },
    )
    expect(overlay).toBeNull()
    expect(stale).toBe(true)
  })

  it('accumulateBrushTriangles returns triangles whose centroids fall in radius', () => {
    const geom = new THREE.BufferGeometry()
    // Two triangles: one at origin, one far away
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 0, 1, 0, 0, 0, 1, 0, 100, 100, 100, 101, 100, 100, 100, 101, 100,
        ]),
        3,
      ),
    )
    geom.setIndex([0, 1, 2, 3, 4, 5])
    const mesh = new THREE.Mesh(geom)
    const near = accumulateBrushTriangles(
      mesh,
      new THREE.Vector3(0.3, 0.3, 0),
      10,
    )
    expect(near).toEqual([0])
    const both = accumulateBrushTriangles(
      mesh,
      new THREE.Vector3(50, 50, 50),
      200,
    )
    expect(both).toEqual([0, 1])
  })

  it('renders a new highlight on a non-indexed display mesh', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
        3,
      ),
    )
    const mesh = new THREE.Mesh(geometry)
    const overlay = buildHighlightOverlay(
      {
        id: 'new-highlight',
        revisionId: 'rev-1',
        type: 'highlight',
        name: 'Highlight',
        points: [[0, 0, 0]],
        meta: { color: 'accent', triangleIndices: [0] },
        locked: false,
        visible: true,
        createdAt: new Date().toISOString(),
      },
      mesh,
    )
    expect(overlay).not.toBeNull()
  })

  it('uses the display mesh world transform for the highlight overlay', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.position.set(10, 20, 30)
    mesh.updateMatrixWorld(true)
    const overlay = buildHighlightOverlay(
      ann({ type: 'highlight', points: [[0, 0, 0]], meta: { triangleIndices: [0] } }),
      mesh,
    )
    expect(overlay?.matrix.elements).toEqual(mesh.matrixWorld.elements)
    expect(overlay?.matrixAutoUpdate).toBe(false)
  })

  it('syncAnnotationObjects passes displayMesh for highlight overlays', () => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(9), 3),
    )
    geom.setIndex([0, 1, 2])
    const mesh = new THREE.Mesh(geom)
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    let staleId: string | null = null
    syncAnnotationObjects(
      scene,
      [
        ann({
          type: 'highlight',
          points: [[0, 0, 0]],
          meta: { color: 'accent', triangleIndices: [0] },
        }),
      ],
      prev,
      mesh,
      (id) => {
        staleId = id
      },
    )
    expect(prev.current.get('ann-1')?.length).toBe(1)
    expect(staleId).toBeNull()
  })
})

function colorsOf(objs: THREE.Object3D[]): number[] {
  const out: number[] = []
  for (const obj of objs) {
    obj.traverse((child) => {
      const mat = (child as THREE.Mesh).material as THREE.Material & { color?: THREE.Color }
      if (mat && mat.color instanceof THREE.Color && !(child instanceof THREE.Sprite)) out.push(mat.color.getHex())
    })
  }
  return out
}

describe('annotation colours (annotation-color-system)', () => {
  it('S1: a line coloured emerald draws its segment and both endpoint glyphs in #10B981', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    const line = ann({ type: 'line', points: [[0, 0, 0], [10, 0, 0]], meta: { color: 'emerald' } })
    syncAnnotationObjects(scene, [line], prev)
    const colors = colorsOf(prev.current.get('ann-1') ?? [])
    expect(colors.length).toBeGreaterThanOrEqual(3)
    expect(new Set(colors)).toEqual(new Set([0x10b981]))
  })

  it('S2: an ROI with no colour stays amber', () => {
    expect(new Set(colorsOf(buildROIBox(ann({ type: 'roi', points: [[0, 0, 0], [10, 10, 10]] }))))).toEqual(
      new Set([0xf59e0b]),
    )
  })

  it('a plane coloured slate draws its fill, outline and origin glyph in slate', () => {
    const objs = buildPlane(ann({ type: 'plane', points: [[0, 0, 0]], meta: { color: 'slate', normal: [0, 0, 1] } }))
    expect(new Set(colorsOf(objs))).toEqual(new Set([0x64748b]))
  })

  it('angle arms and vertex, closed curves and highlight overlays use the annotation colour', () => {
    const angle = buildAngleArc(ann({ type: 'angle', points: [[1, 0, 0], [0, 0, 0], [0, 1, 0]], meta: { color: 'rose' } }))
    expect(new Set(colorsOf(angle))).toEqual(new Set([0xf43f5e]))
    const curve = buildCurvePolyline(ann({ type: 'closed_curve', points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], meta: { color: 'amber' } }), true)
    expect(colorsOf(curve ? [curve] : [])).toEqual([0xf59e0b])
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    const hl = buildHighlightOverlay(ann({ type: 'highlight', points: [[0, 0, 0]], meta: { color: 'slate', triangleIndices: [0] } }), mesh)
    expect(colorsOf(hl ? [hl] : [])).toEqual([0x64748b])
  })

  it('R7: the placement preview uses the colour selected for placement', () => {
    const scene = new THREE.Scene()
    const prev = { current: new Map<string, THREE.Object3D[]>() }
    syncAnnotationObjects(scene, [], prev, null, undefined, {
      type: 'line',
      points: [[0, 0, 0]],
      hoverCursor: [5, 0, 0],
      color: 'emerald',
    })
    expect(new Set(colorsOf(prev.current.get('__preview__') ?? []))).toEqual(new Set([0x10b981]))
  })
})
