import * as THREE from 'three'
import type { Mat4 } from '../domain/types'

/** Row-major rigid pose; retain the display object's derived volume scale. */
export function applyPoseToObject(object: THREE.Object3D, pose: Mat4): void {
  const rotation = new THREE.Matrix4().set(...pose)
  object.setRotationFromMatrix(rotation)
  object.position.set(pose[3], pose[7], pose[11])
  object.updateMatrix()
}
