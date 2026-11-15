import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Annotation } from '../src/domain/types'
import { calloutAnchor, captureCamera, projectToCapture, withHidden } from '../src/viewport/reportCapture'

const box = new THREE.Box3(new THREE.Vector3(-80, -100, -60), new THREE.Vector3(80, 100, 90))
const ann = (over: Partial<Annotation>): Annotation => ({
  id: 'a', revisionId: 'r', type: 'landmark', name: 'n', points: [[1, 2, 3]], meta: {}, locked: false,
  visible: true, createdAt: '', ...over,
})

describe('report capture helpers (ai-case-report R7–R9, S7)', () => {
  it('a left capture looks from patient left at the box centre with superior up', () => {
    const camera = captureCamera('left', box, 1200, 900)
    const centre = box.getCenter(new THREE.Vector3())
    const dir = camera.position.clone().sub(centre).normalize()
    expect(dir.x).toBeCloseTo(-1, 6)
    expect(camera.up.toArray()).toEqual([0, 0, 1])
    expect(projectToCapture([centre.x, centre.y, centre.z], camera, 1200, 900)).toMatchObject({ x: 600, y: 450, inFront: true })
  })

  it('frames the whole box inside the image for every preset', () => {
    for (const preset of ['anterior', 'posterior', 'left', 'right', 'superior', 'inferior', 'hero_oblique'] as const) {
      const camera = captureCamera(preset, box, 1200, 900)
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = projectToCapture([x, y, z], camera, 1200, 900)
        expect(p.inFront, preset).toBe(true)
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1200)
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(900)
      }
    }
  })

  it('returns a new camera each time and never mutates one passed around (S7)', () => {
    const a = captureCamera('anterior', box, 100, 100)
    const b = captureCamera('anterior', box, 100, 100)
    expect(a).not.toBe(b)
  })

  it("withHidden restores each object's own visibility, even when rendering throws", () => {
    const gizmo = new THREE.Object3D(); const grid = new THREE.Object3D(); grid.visible = false
    expect(() => withHidden([gizmo, grid], () => {
      expect(gizmo.visible).toBe(false)
      throw new Error('context lost')
    })).toThrow('context lost')
    expect(gizmo.visible).toBe(true)
    expect(grid.visible).toBe(false)
  })

  it('callout anchors: ROI centre, curve centroid, otherwise first point', () => {
    expect(calloutAnchor(ann({ type: 'roi', points: [[0, 0, 0], [10, 20, 30]], meta: { min: [0, 0, 0], max: [10, 20, 30] } }))).toEqual([5, 10, 15])
    expect(calloutAnchor(ann({ type: 'closed_curve', points: [[0, 0, 0], [3, 0, 0], [0, 3, 0]] }))).toEqual([1, 1, 0])
    expect(calloutAnchor(ann({ type: 'plane', points: [[7, 8, 9]] }))).toEqual([7, 8, 9])
  })
})
