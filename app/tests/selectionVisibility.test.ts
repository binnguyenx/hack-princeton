import { expect, it } from 'vitest'
import { openDemo } from './helpers'
import { selectObject, setVisibility } from '../src/ops'

it('rejects unknown visibility targets and hidden selections without domain changes', async () => {
  const ctx = await openDemo()
  const state = ctx.store.requireState()
  const source = state.samples[0].sourceAnatomy.objectId
  const domain = { samples: state.samples, revisions: state.revisions, dirty: state.dirty }
  expect(setVisibility(ctx, 'unknown-object', false).ok).toBe(false)
  expect(selectObject(ctx, source).ok).toBe(true)
  expect(setVisibility(ctx, source, false).ok).toBe(true)
  expect(ctx.store.requireState().view.selectionObjectId).toBeNull()
  expect(selectObject(ctx, source).ok).toBe(false)
  expect(ctx.store.requireState().samples).toEqual(domain.samples)
  expect(ctx.store.requireState().revisions).toEqual(domain.revisions)
  expect(ctx.store.requireState().dirty).toBe(domain.dirty)
})

it('keeps per-object visibility across tabs, clears stale selection and recovers without a selected object', async () => {
  const { createCandidate, openDocument, setActiveDocument, closeDocument, showAllObjects } = await import('../src/ops')
  const ctx = await openDemo()
  const initial = ctx.store.requireState()
  const sample = initial.samples[0]
  await openDocument(ctx, { kind: 'sample', id: sample.id })
  expect(selectObject(ctx, sample.sourceAnatomy.objectId).ok).toBe(true)
  const created = await createCandidate(ctx, sample.id)
  if (!created.ok) throw new Error(created.error)
  const id = created.value.candidateId
  openDocument(ctx, { kind: 'candidate', id })
  expect(ctx.store.requireState().view.selectionObjectId).toBeNull()
  selectObject(ctx, id)
  setVisibility(ctx, id, false)
  setActiveDocument(ctx, { kind: 'sample', id: sample.id })
  expect(ctx.store.requireState().view.visibility[id]).toBe(false)
  selectObject(ctx, sample.sourceAnatomy.objectId)
  closeDocument(ctx, { kind: 'sample', id: sample.id })
  expect(ctx.store.requireState().view.selectionObjectId).toBeNull()
  expect(showAllObjects(ctx).ok).toBe(true)
  expect(ctx.store.requireState().view.visibility[id]).toBe(true)
  expect(selectObject(ctx, id).ok).toBe(true)
})
