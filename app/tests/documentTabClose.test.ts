import { describe, expect, it } from 'vitest'
import {
  afterCloseOpenDocuments,
  beginCloseDocument,
} from '../src/ops/documentTabs'
import { clearDirty, createCase, createProject, readState } from '../src/ops'
import { freshCtx } from './helpers'

describe('bookmark bar close orchestration (R7, R8)', () => {
  it('beginCloseDocument requires confirm when dirty', () => {
    expect(beginCloseDocument(false)).toBe('close-now')
    expect(beginCloseDocument(true)).toBe('confirm-dirty')
  })

  it('afterCloseOpenDocuments opens picker when no tabs remain', () => {
    expect(afterCloseOpenDocuments(0)).toBe('open-picker')
    expect(afterCloseOpenDocuments(1)).toBe('done')
  })

  it('clearDirty marks the session clean (Save success path)', () => {
    const ctx = freshCtx()
    expect(createProject(ctx, { name: 'Dirty' }).ok).toBe(true)
    expect(createCase(ctx, { name: 'C' }).ok).toBe(true)
    expect(readState(ctx).value?.dirty).toBe(true)
    expect(clearDirty(ctx).ok).toBe(true)
    expect(readState(ctx).value?.dirty).toBe(false)
  })
})
