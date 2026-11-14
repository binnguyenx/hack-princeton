import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  readState,
  transformCandidate,
} from '../src/ops'
import type { Mat4 } from '../src/domain/types'
import { openDemo, openSeed, sample0 } from './helpers'
import { importSample } from '../src/ops'
import { mkdtemp, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const pose: Mat4 = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('R9 / R20 failures', () => {
  it('rejects transform on source anatomy', async () => {
    const ctx = await openDemo()
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const sourceId = st.value.samples[0].sourceAnatomy.objectId
    const r = await transformCandidate(ctx, {
      candidateId: sourceId,
      pose,
      apply: true,
    })
    expect(r.ok).toBe(false)
  })

  it('cancel path: apply:false does not add revision', async () => {
    const ctx = await openDemo()
    const c = await createCandidate(ctx, 'sample-000')
    expect(c.ok).toBe(true)
    if (!c.ok) return
    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const n = before.value.revisions.length
    const preview = await transformCandidate(ctx, {
      candidateId: c.value.candidateId,
      pose,
      apply: false,
    })
    expect(preview.ok).toBe(true)
    const after = readState(ctx)
    if (!after.ok || !after.value) throw new Error('no state')
    expect(after.value.revisions).toHaveLength(n)
  })

  it('createCandidate rejects unverified sample', async () => {
    const ctx = openSeed()
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'unverified-'))
    await mkdir(tmp, { recursive: true })
    const meta = JSON.parse(await readFile(path.join(sample0, 'metadata.json'), 'utf8'))
    // Keep metadata but strip spacings from volume so verification fails
    await copyFile(path.join(sample0, 'metadata.json'), path.join(tmp, 'metadata.json'))
    const good = await readFile(path.join(sample0, 'defective_skull.nrrd'))
    const text = good.toString('binary')
    const split = text.indexOf('\n\n')
    const header = text
      .slice(0, split)
      .split('\n')
      .filter((l) => !l.startsWith('space directions:'))
      .join('\n')
    await writeFile(
      path.join(tmp, 'defective_skull.nrrd'),
      Buffer.from(header + '\n\n' + text.slice(split + 2), 'binary'),
    )
    void meta
    const imp = await importSample(ctx, {
      caseId: 'case-1',
      sampleDir: tmp,
      sampleId: 'bad',
    })
    expect(imp.ok).toBe(true)
    const created = await createCandidate(ctx, 'bad')
    expect(created.ok).toBe(false)
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.candidates.filter((c) => c.sampleId === 'bad')).toHaveLength(0)
  })
})
