/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDocument,
  createCandidate,
  createCase,
  createProject,
  openDocument,
  readState,
  setActiveDocument,
} from '../../src/ops'
import { importSample } from '../../src/ops/persistence'
import { DocumentTaskbar } from '../../src/ui/DocumentTaskbar'
import { freshCtx, sample0 } from '../helpers'

afterEach(() => cleanup())

async function setupTwoTabs() {
  const ctx = freshCtx()
  createProject(ctx, { name: 'UI Tabs' })
  const c = createCase(ctx, { name: 'C1' })
  if (!c.ok) throw new Error(c.error)
  const imp = await importSample(ctx, {
    caseId: c.value.caseId,
    sampleDir: sample0,
    sampleId: 'ui-sample',
  })
  if (!imp.ok) throw new Error(imp.error)
  const cand = await createCandidate(ctx, imp.value.sampleId)
  if (!cand.ok) throw new Error(cand.error)
  openDocument(ctx, { kind: 'sample', id: imp.value.sampleId })
  openDocument(ctx, { kind: 'candidate', id: cand.value.candidateId })
  return { ctx, sampleId: imp.value.sampleId, candidateId: cand.value.candidateId }
}

describe('R29 / R25 Document taskbar UI', () => {
  it('activates and closes tabs through ops without deleting records', async () => {
    const { ctx, sampleId, candidateId } = await setupTwoTabs()

    const renderBar = () => {
      const st = readState(ctx)
      if (!st.ok || !st.value) throw new Error('no state')
      return (
        <DocumentTaskbar
          documents={st.value.openDocuments}
          activeDocumentId={st.value.activeDocumentId}
          labelFor={(d) => d.id}
          onActivate={(kind, id) => {
            setActiveDocument(ctx, { kind, id })
            rerender(renderBar())
          }}
          onClose={(kind, id) => {
            closeDocument(ctx, { kind, id })
            rerender(renderBar())
          }}
        />
      )
    }

    const { rerender } = render(renderBar())
    fireEvent.click(screen.getByRole('button', { name: sampleId }))
    expect(readState(ctx).value?.activeDocumentId).toBe(sampleId)

    fireEvent.click(screen.getByRole('button', { name: `Close ${candidateId}` }))
    const st = readState(ctx)
    expect(st.value?.openDocuments.map((d) => d.id)).toEqual([sampleId])
    expect(st.value?.candidates.some((c) => c.objectId === candidateId)).toBe(
      true,
    )
  })
})
