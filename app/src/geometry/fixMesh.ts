import * as THREE from 'three'
import type { SpatialMeta } from '../domain/types'
import { voxelsToDisplayMesh } from './derivedMesh'
import { decodeNrrdVoxels } from './nrrdVoxels'
import { tagVoxelFrame, voxelFrameOf } from './aiOverlay'

/** DESIGN.md `accent` token. The predicted fix is the one strong colour in the canvas. */
export const FIX_ACCENT = 0x2f6bff
export const SKULL_PART_NAME = 'skull'
export const FIX_PART_NAME = 'predicted-fix'

/** Voxels the candidate adds to the source skull (candidate AND NOT source). Takes decoded voxels. */
export function fixMaskFromVoxels(candidate: Uint8Array, source: Uint8Array): Uint8Array {
  if (candidate.length !== source.length) throw new Error('Fix and skull grids differ')
  const fix = new Uint8Array(candidate.length)
  for (let n = 0; n < candidate.length; n++) fix[n] = candidate[n] > 0 && source[n] === 0 ? 1 : 0
  return fix
}

/** Voxels the candidate adds to the source skull (candidate AND NOT source). */
export function fixMaskVoxels(candidateBytes: Uint8Array, sourceBytes: Uint8Array): Uint8Array {
  return fixMaskFromVoxels(decodeNrrdVoxels(candidateBytes).voxels, decodeNrrdVoxels(sourceBytes).voxels)
}

/**
 * Skull (source bone, neutral) and predicted fix (Accent) as two parts of one group. Both meshes come
 * from the same grid, resolution and scale, so they share one frame (cranial-reconstruction-candidate R12).
 */
export function buildFixScene(
  sourceBytes: Uint8Array,
  candidateBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { resolution?: number },
): THREE.Group {
  const source = decodeNrrdVoxels(sourceBytes).voxels
  const fix = fixMaskFromVoxels(decodeNrrdVoxels(candidateBytes).voxels, source)
  if (!fix.some((v) => v > 0)) throw new Error('This candidate has no fix voxels to show')
  const skull = voxelsToDisplayMesh(source, spatial, options)
  skull.name = SKULL_PART_NAME
  const fixMesh = voxelsToDisplayMesh(fix, spatial, { ...options, color: FIX_ACCENT })
  fixMesh.name = FIX_PART_NAME
  const group = new THREE.Group()
  group.name = 'predicted-fix-scene'
  group.add(skull, fixMesh)
  const frame = voxelFrameOf(skull)
  if (frame) tagVoxelFrame(group, frame)
  return group
}

export function setFixVisible(scene: THREE.Object3D, visible: boolean): void {
  const part = scene.getObjectByName(FIX_PART_NAME)
  if (part) part.visible = visible
}
