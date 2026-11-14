import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  openProject,
  readState,
  saveProject,
  transformCandidate,
} from '../src/ops'
import type { Mat4 } from '../src/domain/types'
import { EditorStore } from '../src/state/store'
import { demoProject, freshCtx, openDemo } from './helpers'

const pose: Mat4 = [1, 0, 0, 3, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('R11 R12 project package', () => {
  it('round-trips ownership, hashes, revisions', async () => {
    const ctx = await openDemo()
    const c = await createCandidate(ctx, 'sample-000')
    expect(c.ok).toBe(true)
    if (!c.ok) return
    await transformCandidate(ctx, {
      candidateId: c.value.candidateId,
      pose,
      apply: true,
    })
    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'proj-'))
    const saved = await saveProject(ctx, tmp)
    expect(saved.ok).toBe(true)

    const ctx2 = freshCtx()
    const opened = await openProject(ctx2, tmp)
    expect(opened.ok).toBe(true)
    const after = readState(ctx2)
    if (!after.ok || !after.value) throw new Error('no state')
    expect(after.value.user.id).toBe('local-dev')
    expect(after.value.candidates).toHaveLength(before.value.candidates.length)
    expect(after.value.revisions.map((r) => r.id).sort()).toEqual(
      before.value.revisions.map((r) => r.id).sort(),
    )
    const src = after.value.samples.find((s) => s.id === 'sample-000')!
    expect(src.sourceAnatomy.volumeHash).toBe(
      before.value.samples.find((s) => s.id === 'sample-000')!.sourceAnatomy
        .volumeHash,
    )
    await rm(tmp, { recursive: true, force: true })
  })

  it('save failure keeps session editable', async () => {
    const ctx = await openDemo()
    ctx.saveWriter = async () => {
      throw new Error('disk full')
    }
    const r = await saveProject(ctx, '/tmp/should-not-matter')
    expect(r.ok).toBe(false)
    const st = readState(ctx)
    expect(st.ok && st.value).toBeTruthy()
  })

  it('atomic open keeps prior project on missing blob', async () => {
    const ctx = await openDemo()
    const prior = readState(ctx)
    if (!prior.ok || !prior.value) throw new Error('no state')
    const bad = await openProject(ctx, path.join(demoProject, 'does-not-exist'))
    expect(bad.ok).toBe(false)
    const still = readState(ctx)
    if (!still.ok || !still.value) throw new Error('no state')
    expect(still.value.project.id).toBe(prior.value.project.id)
    void EditorStore
  })
})
