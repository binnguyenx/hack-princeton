import { describe, expect, it } from 'vitest'
import {
  readCanvasRuntime,
  resetCanvasRuntime,
  updateCanvasRuntime,
} from '../src/debug/bridge'

describe('canvas automation state', () => {
  it('exposes camera, scene, cross-reference, render, and result state', () => {
    resetCanvasRuntime()
    updateCanvasRuntime({
      activeView: 'three-d',
      mode: 'view',
      camera: {
        position: [10, 20, 30],
        target: [1, 2, 3],
        projection: 'perspective',
        near: 0.1,
        far: 1000,
      },
      visibleObjectIds: ['sample-object'],
      objectWorldMatrices: { 'sample-object': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      crosshairRas: [4, 5, 6],
      sliceOffsets: { axial: 6, sagittal: 4, coronal: 5 },
      pendingOperationCount: 0,
      webglStatus: 'ready',
      lastAction: { id: 'view.reset', result: 'changed' },
    })

    const snapshot = readCanvasRuntime()
    expect(snapshot.camera.position).toEqual([10, 20, 30])
    expect(snapshot.objectWorldMatrices['sample-object']).toHaveLength(16)
    expect(snapshot.crosshairRas).toEqual([4, 5, 6])
    expect(snapshot.sliceOffsets.axial).toBe(6)
    expect(snapshot.webglStatus).toBe('ready')
    expect(snapshot.lastAction).toEqual({ id: 'view.reset', result: 'changed' })
  })

  it('returns a defensive copy', () => {
    const snapshot = readCanvasRuntime()
    snapshot.visibleObjectIds.push('mutated')
    expect(readCanvasRuntime().visibleObjectIds).not.toContain('mutated')
  })
})
