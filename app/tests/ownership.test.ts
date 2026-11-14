import { describe, expect, it } from 'vitest'
import {
  createCandidate,
  importSample,
  openProject,
  readState,
} from '../src/ops'
import { demoProject, freshCtx, openDemo, sample0, sample1 } from './helpers'

describe('R1 ownership', () => {
  it('loads demo with two samples on case-1 and a second case', async () => {
    const ctx = await openDemo()
    const st = readState(ctx)
    expect(st.ok).toBe(true)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.cases.map((c) => c.id).sort()).toEqual(['case-1', 'case-2'])
    const case1Samples = st.value.samples.filter((s) => s.caseId === 'case-1')
    expect(case1Samples.length).toBeGreaterThanOrEqual(2)
    const case2Samples = st.value.samples.filter((s) => s.caseId === 'case-2')
    expect(case2Samples).toHaveLength(0)
  })

  it('creates two candidates on one sample with correct sampleId', async () => {
    const ctx = freshCtx()
    const opened = await openProject(ctx, demoProject)
    expect(opened.ok).toBe(true)
    const a = await createCandidate(ctx, 'sample-000')
    const b = await createCandidate(ctx, 'sample-000')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const cands = st.value.candidates.filter((c) => c.sampleId === 'sample-000')
    expect(cands).toHaveLength(2)
    expect(cands.every((c) => c.sampleId === 'sample-000')).toBe(true)
  })

  it('importSample attaches to requested case', async () => {
    const ctx = await openDemo()
    const r = await importSample(ctx, {
      caseId: 'case-2',
      sampleDir: sample1,
      sampleId: 'imported-001',
    })
    expect(r.ok).toBe(true)
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const s = st.value.samples.find((x) => x.id === 'imported-001')
    expect(s?.caseId).toBe('case-2')
    expect(s?.spatiallyVerified).toBe(true)
    void sample0
  })
})
