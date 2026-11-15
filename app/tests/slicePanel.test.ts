import { describe, expect, it } from 'vitest'
import { SLICE_BG_RGB, SLICE_INK_RGB, windowedSliceRgba } from '../src/report/slicePanel'

describe('slice panel pixels (ai-case-report R5, R7)', () => {
  it('windows the axial slice through the centre into the slice dock colours', () => {
    // 2×2×2 volume; only voxel (1,0,1) is bone.
    const voxels = new Uint8Array(8)
    voxels[1 + 2 * (0 + 2 * 1)] = 255
    const axial = windowedSliceRgba(voxels, [2, 2, 2], 'axial', 1, 127.5, 255)
    expect([axial.width, axial.height]).toEqual([2, 2])
    const px = (i: number) => Array.from(axial.rgba.slice(i * 4, i * 4 + 3))
    expect(px(1)).toEqual([...SLICE_INK_RGB])
    expect(px(0)).toEqual([...SLICE_BG_RGB])
    expect(axial.rgba[3]).toBe(255)
  })

  it('a different offset gives a different slice', () => {
    const voxels = new Uint8Array(8)
    voxels[1 + 2 * (0 + 2 * 1)] = 255
    const lower = windowedSliceRgba(voxels, [2, 2, 2], 'axial', 0, 127.5, 255)
    expect(Array.from(lower.rgba.slice(4, 7))).toEqual([...SLICE_BG_RGB])
  })
})

import { resolveSliceCentre } from '../src/report/slicePanel'
import type { Annotation, SpatialMeta } from '../src/domain/types'

describe('slice centre (ai-case-report R5 / Design: shot centre)', () => {
  const spatial: SpatialMeta = { units: 'mm', sizes: [100, 80, 60], spacings: [1, 1, 1], bboxMm: [100, 80, 60] }
  const ann = (over: Partial<Annotation>): Annotation => ({ id: 'a', revisionId: 'r', type: 'landmark', name: 'n',
    points: [[10, 20, 30]], meta: {}, locked: false, visible: true, createdAt: '', ...over })

  it('volume centre is the middle voxel', () => {
    expect(resolveSliceCentre('volume', [], spatial, [100, 80, 60])).toEqual([50, 40, 30])
  })

  it('a named annotation centres on its anchor, clamped into the volume', () => {
    const centre = resolveSliceCentre({ annotation_id: 'a' }, [ann({})], spatial, [100, 80, 60])
    expect(centre.every((v, i) => v >= 0 && v < [100, 80, 60][i])).toBe(true)
  })

  it('defect prefers an ROI, then a closed curve, else the volume centre', () => {
    const roi = ann({ id: 'roi', type: 'roi', points: [[0, 0, 0], [4, 4, 4]], meta: { min: [0, 0, 0], max: [4, 4, 4] } })
    const curve = ann({ id: 'c', type: 'closed_curve', points: [[40, 40, 40], [42, 40, 40], [40, 42, 40]] })
    const viaRoi = resolveSliceCentre('defect', [curve, roi], spatial, [100, 80, 60])
    const viaCurve = resolveSliceCentre('defect', [curve], spatial, [100, 80, 60])
    expect(viaRoi).not.toEqual(viaCurve)
    expect(resolveSliceCentre('defect', [], spatial, [100, 80, 60])).toEqual([50, 40, 30])
  })
})
