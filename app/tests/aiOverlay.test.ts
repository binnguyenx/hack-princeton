import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { ViewportOverlay } from '../src/api/chat'
import { AI_OVERLAY_NAME, buildOverlayObject, disposeOverlayObject, tagVoxelFrame, voxelFrameOf, voxelToLocal } from '../src/geometry/aiOverlay'

const colors = { critical: '#ff0000', warning: '#ffaa00', ok: '#00ff00' }
const overlay: ViewportOverlay = {
  overlay_id: 'o1', kind: 'rim_thickness', title: 'Rim thickness', unit: 'mm', threshold_mm: 2,
  legend: [{ severity: 'critical', label: '< 2.0 mm' }], frame: 'voxel-ijk', sizes: [512, 512, 512],
  spacing_mm: [0.4, 0.4, 0.4], object_id: 'src', revision_id: null, focus_ijk: [10, 20, 30],
  points: [{ ijk: [10, 20, 30], value_mm: 1.6, severity: 'critical' }, { ijk: [0, 0, 0], value_mm: 6, severity: 'ok' }],
}

describe('AI overlay geometry', () => {
  it('maps voxels into the display GLB frame (ijk × spacing)', () => {
    expect(voxelToLocal({ kind: 'grid-mm', spacing: [0.4, 0.5, 2] }, [10, 20, 3]).toArray()).toEqual([4, 10, 6])
  })

  it('maps voxels into the reconstructed MarchingCubes frame', () => {
    const frame = { kind: 'normalized-grid' as const, sizes: [512, 512, 512] as [number, number, number], resolution: 128 }
    expect(voxelToLocal(frame, [0, 0, 0]).x).toBeCloseTo(-1)
    // Last voxel samples the last cell (127): (127 − 64) / 64
    expect(voxelToLocal(frame, [511, 511, 511]).x).toBeCloseTo(63 / 64)
    // Same rule as derivedMesh.ts: cell x samples voxel round(x/(res−1)·(size−1))
    const cell = 40
    const voxel = Math.round((cell / 127) * 511)
    expect(voxelToLocal(frame, [voxel, 0, 0]).x).toBeCloseTo((cell - 64) / 64, 1)
  })

  it('builds a coloured point layer and a focus marker, and disposes cleanly', () => {
    const { group, focusLocal } = buildOverlayObject(overlay, { kind: 'grid-mm', spacing: [0.4, 0.4, 0.4] }, colors)
    expect(group.name).toBe(AI_OVERLAY_NAME)
    const [points, focus] = group.children as THREE.Points[]
    expect(points.geometry.getAttribute('position').count).toBe(2)
    expect(Array.from(points.geometry.getAttribute('color').array.slice(0, 3))).toEqual([1, 0, 0])
    expect(focusLocal?.toArray().map(v => +v.toFixed(3))).toEqual([4, 8, 12])
    expect(focus.name).toContain('focus')
    const mesh = new THREE.Object3D()
    mesh.add(group)
    disposeOverlayObject(group)
    expect(mesh.children).toHaveLength(0)
  })

  it('reads the frame tag set on a mesh', () => {
    const mesh = new THREE.Object3D()
    expect(voxelFrameOf(mesh)).toBeNull()
    tagVoxelFrame(mesh, { kind: 'grid-mm', spacing: [1, 1, 1] })
    expect(voxelFrameOf(mesh)?.kind).toBe('grid-mm')
  })
})
