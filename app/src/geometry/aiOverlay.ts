import * as THREE from 'three'
import type { ViewportOverlay } from '../api/chat'

/**
 * How a rendered skull mesh maps voxel indices into its own local space.
 * - `grid-mm`: display GLB built from the NRRD (vertices = ijk × spacing, grid corner origin).
 * - `normalized-grid`: reconstructed MarchingCubes surface (local −1…1 over `resolution` cells).
 */
export type VoxelFrame =
  | { kind: 'grid-mm'; spacing: [number, number, number] }
  | { kind: 'normalized-grid'; sizes: [number, number, number]; resolution: number }

export function tagVoxelFrame(object: THREE.Object3D, frame: VoxelFrame): void {
  object.userData.voxelFrame = frame
}

export function voxelFrameOf(object: THREE.Object3D | null | undefined): VoxelFrame | null {
  const frame = object?.userData?.voxelFrame as VoxelFrame | undefined
  return frame && (frame.kind === 'grid-mm' || frame.kind === 'normalized-grid') ? frame : null
}

/** Voxel index → mesh-local coordinates (matches derivedMesh sampling and skull_to_mesh.py). */
export function voxelToLocal(frame: VoxelFrame, [i, j, k]: [number, number, number]): THREE.Vector3 {
  if (frame.kind === 'grid-mm') {
    const [si, sj, sk] = frame.spacing
    return new THREE.Vector3(i * si, j * sj, k * sk)
  }
  const half = frame.resolution / 2
  const axis = (index: number, size: number) =>
    ((index * (frame.resolution - 1)) / Math.max(1, size - 1) - half) / half
  return new THREE.Vector3(axis(i, frame.sizes[0]), axis(j, frame.sizes[1]), axis(k, frame.sizes[2]))
}

export type SeverityColors = Record<'critical' | 'warning' | 'ok', string>

/** Design-system colours (Signal / warning / success tokens) with literal fallbacks. */
export function severityColors(): SeverityColors {
  const read = (name: string, fallback: string) => {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return value || fallback
    } catch {
      return fallback
    }
  }
  return {
    critical: read('--color-signal', '#d1343e'),
    warning: read('--color-warning', '#b7791f'),
    ok: read('--color-success', '#2f855a'),
  }
}

export const AI_OVERLAY_NAME = 'ai-viewport-overlay'

/**
 * Build the overlay as a child-ready group in the mesh's local frame: a point heat map plus a
 * larger marker on the primary finding. Point size is in screen pixels, so the mesh's own scale
 * (e.g. the reconstructed surface) does not distort it.
 */
export function buildOverlayObject(overlay: ViewportOverlay, frame: VoxelFrame,
  colors: SeverityColors = severityColors()): { group: THREE.Group; focusLocal: THREE.Vector3 | null } {
  const group = new THREE.Group()
  group.name = AI_OVERLAY_NAME
  group.renderOrder = 10
  const positions = new Float32Array(overlay.points.length * 3)
  const vertexColors = new Float32Array(overlay.points.length * 3)
  const color = new THREE.Color()
  overlay.points.forEach((point, index) => {
    voxelToLocal(frame, point.ijk).toArray(positions, index * 3)
    color.set(colors[point.severity]).toArray(vertexColors, index * 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3))
  const material = new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true,
    depthTest: false, transparent: true, opacity: 0.92 })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = 10
  group.add(points)
  let focusLocal: THREE.Vector3 | null = null
  if (overlay.focus_ijk) {
    focusLocal = voxelToLocal(frame, overlay.focus_ijk)
    const focusGeometry = new THREE.BufferGeometry()
    focusGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(focusLocal.toArray()), 3))
    const focus = new THREE.Points(focusGeometry, new THREE.PointsMaterial({ size: 14, sizeAttenuation: false,
      color: new THREE.Color(colors.critical), depthTest: false, transparent: true, opacity: 0.95 }))
    focus.name = `${AI_OVERLAY_NAME}-focus`
    focus.renderOrder = 11
    group.add(focus)
  }
  return { group, focusLocal }
}

export function disposeOverlayObject(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Points) {
      child.geometry.dispose()
      ;(child.material as THREE.Material).dispose()
    }
  })
  group.removeFromParent()
}
