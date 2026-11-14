import { expect, it } from 'vitest'
import { Mesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three'
import { IDENTITY_POSE, type Mat4 } from '../src/domain/types'
import { applyPoseToObject } from '../src/geometry/pose'

it('renders full rotation and translation while preserving the derived mesh scale', () => {
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  mesh.scale.set(2, 3, 4)
  const pose: Mat4 = [0, -1, 0, 5, 1, 0, 0, 6, 0, 0, 1, 7, 0, 0, 0, 1]
  applyPoseToObject(mesh, pose)
  expect(new Vector3(1, 0, 0).applyMatrix4(mesh.matrix).toArray()).toEqual([5, 8, 7])
  applyPoseToObject(mesh, IDENTITY_POSE)
  expect(mesh.scale.toArray()).toEqual([2, 3, 4])
})

it('composes relative editor-axis rotations about the candidate origin with the current pose', async () => {
  const { buildPlacementPose, samePose } = await import('../src/geometry/rigidPlacement')
  const base: Mat4 = [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30, 0, 0, 0, 1]
  const result = buildPlacementPose(base, { x: 2, y: -3, z: 4, rx: 0, ry: 0, rz: 90 })
  const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  applyPoseToObject(object, result)
  expect(object.position.toArray()).toEqual([12, 17, 34])
  const point = new Vector3(1, 0, 0).applyMatrix4(object.matrix)
  expect(point.x).toBeCloseTo(12)
  expect(point.y).toBeCloseTo(18)
  expect(point.z).toBeCloseTo(34)
  expect(samePose(result, base)).toBe(false)
  expect(samePose(buildPlacementPose(base, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }), base)).toBe(true)
  expect(() => buildPlacementPose(base, { x: NaN, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })).toThrow()
})
