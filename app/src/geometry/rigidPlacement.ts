import { Matrix4 } from 'three'
import type { Mat4 } from '../domain/types'

export type PlacementDelta = { x: number; y: number; z: number; rx: number; ry: number; rz: number }
export const ZERO_PLACEMENT: PlacementDelta = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }

export function isRigidPose(pose: readonly number[]): boolean {
  if (pose.length !== 16 || !pose.every(Number.isFinite)) return false
  if ([pose[12], pose[13], pose[14], pose[15] - 1].some((v) => Math.abs(v) > 1e-6)) return false
  const matrix = new Matrix4().set(...pose as unknown as Mat4)
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    let dot = 0
    for (let k = 0; k < 3; k++) dot += pose[a * 4 + k] * pose[b * 4 + k]
    if (Math.abs(dot - (a === b ? 1 : 0)) > 1e-6) return false
  }
  return Math.abs(matrix.determinant() - 1) <= 1e-6
}

/** Extrinsic X→Y→Z rotation about current candidate origin; editor axes, not patient RAS. */
export function buildPlacementPose(base: Mat4, delta: PlacementDelta): Mat4 {
  if (!isRigidPose(base) || !Object.values(delta).every(Number.isFinite)) throw new Error('A finite rigid pose is required.')
  const radians = (value: number) => value / 180 * Math.PI
  const rotation = new Matrix4().makeRotationZ(radians(delta.rz))
    .multiply(new Matrix4().makeRotationY(radians(delta.ry)))
    .multiply(new Matrix4().makeRotationX(radians(delta.rx)))
    .multiply(new Matrix4().set(...base))
  rotation.setPosition(base[3] + delta.x, base[7] + delta.y, base[11] + delta.z)
  const pose = rotation.transpose().toArray() as unknown as Mat4
  if (!isRigidPose(pose)) throw new Error('Placement exceeds finite rigid coordinates.')
  return pose
}

export function samePose(a: Mat4, b: Mat4): boolean {
  return a.every((value, index) => Math.abs(value - b[index]) <= 1e-9)
}
