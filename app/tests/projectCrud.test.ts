import { describe, expect, it } from 'vitest'
import {
  createCase,
  createProject,
  listProjects,
  readState,
} from '../src/ops'
import { ProjectRegistry } from '../src/ops/projectRegistry'
import { freshCtx } from './helpers'

describe('R26–R28 project/case CRUD', () => {
  it('createProject requires a non-empty name', () => {
    const ctx = freshCtx()
    const r = createProject(ctx, { name: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name/i)
    expect(readState(ctx).value).toBeNull()
  })

  it('createProject opens an empty workspace with zero cases and empty tabs', () => {
    const registry = new ProjectRegistry()
    const ctx = { ...freshCtx(), registry }
    const r = createProject(ctx, { name: 'Vault A' })
    expect(r.ok).toBe(true)
    const st = readState(ctx)
    expect(st.ok && st.value).toBeTruthy()
    if (!st.ok || !st.value) return
    expect(st.value.project.name).toBe('Vault A')
    expect(st.value.cases).toEqual([])
    expect(st.value.samples).toEqual([])
    expect(st.value.openDocuments).toEqual([])
    expect(st.value.activeDocumentId).toBeNull()
    expect(st.value.dirty).toBe(false)
    expect(listProjects(ctx).value?.map((p) => p.name)).toContain('Vault A')
  })

  it('createCase adds a named case to the open project and marks dirty', () => {
    const ctx = freshCtx()
    expect(createProject(ctx, { name: 'Vault B' }).ok).toBe(true)
    const before = readState(ctx)
    if (!before.ok || !before.value) throw new Error('no state')
    const projectId = before.value.project.id

    const missing = createCase(freshCtx(), { name: 'Should fail' })
    expect(missing.ok).toBe(false)

    const emptyName = createCase(ctx, { name: '' })
    expect(emptyName.ok).toBe(false)

    const r = createCase(ctx, { name: 'Primary' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    expect(st.value.cases).toHaveLength(1)
    expect(st.value.cases[0]?.name).toBe('Primary')
    expect(st.value.cases[0]?.projectId).toBe(projectId)
    expect(st.value.dirty).toBe(true)
  })
})
