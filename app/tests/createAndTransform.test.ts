import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  readState,
  transformCandidate,
} from '../src/ops'
import { IDENTITY_POSE, type Mat4 } from '../src/domain/types'
import { openDemo } from './helpers'

const translated: Mat4 = [
  1, 0, 0, 10,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

describe('R4 create and transform isolation', () => {
  it('transform Apply leaves source and sibling volume hashes unchanged', async () => {
    const ctx = await openDemo()
    const a = await createCandidate(ctx, 'sample-000')
    const b = await createCandidate(ctx, 'sample-000')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const sourceHash = before.value.samples.find((s) => s.id === 'sample-000')!
      .sourceAnatomy.volumeHash
    const siblingVol = before.value.revisions.find(
      (r) => r.id === before.value!.candidates.find((c) => c.objectId === b.value.candidateId)!
        .currentRevisionId,
    )!.volumeHash

    const t = await transformCandidate(ctx, {
      candidateId: a.value.candidateId,
      pose: translated,
      apply: true,
    })
    expect(t.ok).toBe(true)

    const after = readState(ctx)
    if (!after.ok || !after.value) throw new Error('no state')
    expect(
      after.value.samples.find((s) => s.id === 'sample-000')!.sourceAnatomy.volumeHash,
    ).toBe(sourceHash)
    const siblingAfter = after.value.revisions.find(
      (r) =>
        r.id ===
        after.value!.candidates.find((c) => c.objectId === b.value.candidateId)!
          .currentRevisionId,
    )!
    expect(siblingAfter.volumeHash).toBe(siblingVol)
    expect(siblingAfter.pose).toEqual(IDENTITY_POSE)
  })
})
