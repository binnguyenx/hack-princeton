/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Inspector } from '../../src/ui/Inspector'
import { openDemo } from '../helpers'
import { openDocument, selectObject } from '../../src/ops'
afterEach(cleanup)

it('distinguishes the sample document id from its selected canonical source object', async () => {
  const ctx = await openDemo()
  const sample = ctx.store.requireState().samples[0]
  openDocument(ctx, { kind: 'sample', id: sample.id })
  selectObject(ctx, sample.sourceAnatomy.objectId)
  const current = ctx.store.requireState()
  const { rerender } = render(<Inspector state={current} activeTool="select" onRestoreRevision={() => {}} />)
  expect(screen.getByText('Document ID')).toBeTruthy()
  expect(screen.getByText('Selected object')).toBeTruthy()
  expect(screen.getByTitle(sample.sourceAnatomy.objectId)).toBeTruthy()
  rerender(<Inspector state={{ ...current, view: { ...current.view, selectionObjectId: null } }}
    activeTool="select" onRestoreRevision={() => {}} />)
  expect(screen.getByText('None')).toBeTruthy()
})
