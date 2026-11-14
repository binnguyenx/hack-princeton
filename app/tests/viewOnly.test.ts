import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  navigateCamera,
  readState,
  setInspectionPlane,
  setVisibility,
} from '../src/ops'
import { openDemo } from './helpers'

describe('R5 view-only ops', () => {
  it('camera, visibility, inspection plane do not change volumes or revisions', async () => {
    const ctx = await openDemo()
    const c = await createCandidate(ctx, 'sample-000')
    expect(c.ok).toBe(true)
    if (!c.ok) return
    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const revCount = before.value.revisions.length
    const hashes = [...before.value.volumes.entries()].map(([id, b]) => [
      id,
      b.length,
    ])

    expect(
      navigateCamera(ctx, { position: [1, 2, 3], target: [0, 0, 0] }).ok,
    ).toBe(true)
    expect(setVisibility(ctx, c.value.candidateId, false).ok).toBe(true)
    expect(
      setInspectionPlane(ctx, { enabled: true, axis: 'y', offset: 12 }).ok,
    ).toBe(true)

    const after = readState(ctx)
    if (!after.ok || !after.value) throw new Error('no state')
    expect(after.value.revisions).toHaveLength(revCount)
    expect(
      [...after.value.volumes.entries()].map(([id, b]) => [id, b.length]),
    ).toEqual(hashes)
    expect(after.value.view.camera.position).toEqual([1, 2, 3])
    expect(after.value.view.inspectionPlane.axis).toBe('y')
  })
})
