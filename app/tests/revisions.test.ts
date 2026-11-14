import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  readState,
  restoreRevision,
  transformCandidate,
} from '../src/ops'
import type { Mat4 } from '../src/domain/types'
import { openDemo } from './helpers'

const p1: Mat4 = [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const p2: Mat4 = [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('R10 revisions', () => {
  it('Applies create ordered revisions; restore moves pointer; sibling untouched', async () => {
    const ctx = await openDemo()
    const a = await createCandidate(ctx, 'sample-000')
    const b = await createCandidate(ctx, 'sample-000')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const t1 = await transformCandidate(ctx, {
      candidateId: a.value.candidateId,
      pose: p1,
      apply: true,
    })
    const t2 = await transformCandidate(ctx, {
      candidateId: a.value.candidateId,
      pose: p2,
      apply: true,
    })
    expect(t1.ok && t2.ok).toBe(true)
    if (!t1.ok || !t2.ok) return

    let st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const revs = st.value.revisions
      .filter((r) => r.candidateId === a.value.candidateId)
      .sort((x, y) => x.order - y.order)
    expect(revs.map((r) => r.order)).toEqual([0, 1, 2])
    expect(st.value.candidates.find((c) => c.objectId === a.value.candidateId)!
      .currentRevisionId).toBe(t2.value.revisionId)

    const first = revs[0]
    expect(
      restoreRevision(ctx, {
        candidateId: a.value.candidateId,
        revisionId: first.id,
      }).ok,
    ).toBe(true)

    st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(
      st.value.candidates.find((c) => c.objectId === a.value.candidateId)!
        .currentRevisionId,
    ).toBe(first.id)
    const sibling = st.value.candidates.find((c) => c.objectId === b.value.candidateId)!
    expect(sibling.currentRevisionId).toBe(
      st.value.revisions.find((r) => r.candidateId === b.value.candidateId && r.order === 0)!
        .id,
    )

    // R10b: new Apply after restore appends
    const t3 = await transformCandidate(ctx, {
      candidateId: a.value.candidateId,
      pose: p2,
      apply: true,
    })
    expect(t3.ok).toBe(true)
    st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const again = st.value.revisions
      .filter((r) => r.candidateId === a.value.candidateId)
      .sort((x, y) => x.order - y.order)
    expect(again).toHaveLength(4)
    expect(again.find((r) => r.id === first.id)?.pose).toEqual(first.pose)
  })

  it('restore to already-current revision is idempotent (no dirty flip, no new revisions)', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const candidate = before.value.candidates.find(
      (c) => c.objectId === created.value.candidateId,
    )
    if (!candidate) throw new Error('candidate missing')
    ctx.store.update((st) => ({ ...st, dirty: false }))
    const reset = readState(ctx)
    if (!reset.ok || !reset.value) throw new Error('no state')
    const beforeDirty = reset.value.dirty
    const beforeRevCount = before.value.revisions.filter(
      (r) => r.candidateId === candidate.objectId,
    ).length

    const restored = restoreRevision(ctx, {
      candidateId: candidate.objectId,
      revisionId: candidate.currentRevisionId,
    })
    expect(restored.ok).toBe(true)

    const after = readState(ctx)
    if (!after.ok || !after.value) throw new Error('no state')
    const afterCandidate = after.value.candidates.find((c) => c.objectId === candidate.objectId)
    expect(afterCandidate?.currentRevisionId).toBe(candidate.currentRevisionId)
    const afterRevCount = after.value.revisions.filter(
      (r) => r.candidateId === candidate.objectId,
    ).length
    expect(afterRevCount).toBe(beforeRevCount)
    expect(after.value.dirty).toBe(beforeDirty)
  })
})
