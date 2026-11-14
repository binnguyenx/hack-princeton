import { describe, expect, it } from 'vitest'
import {
  closeDocument,
  createCandidate,
  createCase,
  createProject,
  openDocument,
  readState,
  setActiveDocument,
} from '../src/ops'
import { importSample } from '../src/ops/persistence'
import { freshCtx, sample0 } from './helpers'

async function projectWithSample() {
  const ctx = freshCtx()
  expect(createProject(ctx, { name: 'Tabs' }).ok).toBe(true)
  const c = createCase(ctx, { name: 'Case 1' })
  expect(c.ok).toBe(true)
  if (!c.ok) throw new Error(c.error)
  const imp = await importSample(ctx, {
    caseId: c.value.caseId,
    sampleDir: sample0,
    sampleId: 'sample-tab-0',
  })
  expect(imp.ok).toBe(true)
  if (!imp.ok) throw new Error(imp.error)
  return { ctx, sampleId: imp.value.sampleId, caseId: c.value.caseId }
}

describe('R29–R31 / R34 document tabs', () => {
  it('openDocument adds a sample tab and sets it active', async () => {
    const { ctx, sampleId } = await projectWithSample()
    const r = openDocument(ctx, { kind: 'sample', id: sampleId })
    expect(r.ok).toBe(true)
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.openDocuments).toEqual([{ kind: 'sample', id: sampleId }])
    expect(st.value.activeDocumentId).toBe(sampleId)
  })

  it('openDocument on unknown id fails', async () => {
    const { ctx } = await projectWithSample()
    const r = openDocument(ctx, { kind: 'sample', id: 'missing' })
    expect(r.ok).toBe(false)
  })

  it('setActiveDocument switches the active tab', async () => {
    const { ctx, sampleId } = await projectWithSample()
    const cand = await createCandidate(ctx, sampleId)
    expect(cand.ok).toBe(true)
    if (!cand.ok) return
    expect(openDocument(ctx, { kind: 'sample', id: sampleId }).ok).toBe(true)
    expect(
      openDocument(ctx, { kind: 'candidate', id: cand.value.candidateId }).ok,
    ).toBe(true)
    expect(
      setActiveDocument(ctx, { kind: 'sample', id: sampleId }).ok,
    ).toBe(true)
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.activeDocumentId).toBe(sampleId)
    expect(st.value.openDocuments).toHaveLength(2)
  })

  it('closeDocument removes the tab but keeps the sample or candidate record', async () => {
    const { ctx, sampleId } = await projectWithSample()
    const cand = await createCandidate(ctx, sampleId)
    expect(cand.ok).toBe(true)
    if (!cand.ok) return
    const candidateId = cand.value.candidateId
    expect(openDocument(ctx, { kind: 'candidate', id: candidateId }).ok).toBe(
      true,
    )
    expect(closeDocument(ctx, { kind: 'candidate', id: candidateId }).ok).toBe(
      true,
    )
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.openDocuments).toEqual([])
    expect(st.value.candidates.some((c) => c.objectId === candidateId)).toBe(
      true,
    )
    expect(st.value.samples.some((s) => s.id === sampleId)).toBe(true)
  })
})
