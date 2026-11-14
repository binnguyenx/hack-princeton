import * as THREE from 'three'
import type { Mat4 } from '../domain/types'

/** Apply rigid pose (row-major 4×4 with translation in [3],[7],[11]) to a mesh. */
export function applyPoseToObject(object: THREE.Object3D, pose: Mat4): void {
  object.position.set(pose[3], pose[7], pose[11])
  object.updateMatrix()
}
