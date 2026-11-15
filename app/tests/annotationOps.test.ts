import { describe, expect, it } from 'vitest'
import {
  addAnnotation,
  createCandidate,
  createProject,
  deleteAnnotation,
  publicOps,
  readState,
  renameAnnotation,
  setAnnotationLocked,
  setAnnotationVisible,
  updateAnnotationMeta,
  updateAnnotationPoints,
} from '../src/ops'
import type { RasPoint } from '../src/domain/types'
import { freshCtx, openDemo } from './helpers'

async function withLandmark() {
  const ctx = await openDemo()
  const created = await createCandidate(ctx, 'sample-000')
  if (!created.ok) throw new Error('createCandidate failed')
  const added = addAnnotation(ctx, {
    type: 'landmark',
    name: 'L1',
    points: [[1, 2, 3]],
    meta: {},
    revisionId: created.value.revisionId,
  })
  if (!added.ok) throw new Error('addAnnotation failed')
  return { ctx, revisionId: created.value.revisionId, ann: added.value }
}

describe('annotation EditorState construction', () => {
  it('EditorState from createProject includes empty annotations array', () => {
    const ctx = freshCtx()
    createProject(ctx, { name: 'T' })
    const s = readState(ctx)
    expect(s.ok && s.value?.annotations).toEqual([])
  })

  it('setStoreFromManifest store path preserves annotations from manifest', async () => {
    const { editorStore } = await import('../src/state/store')
    const { createProject: cp, readState: rs } = await import('../src/ops')
    const local = freshCtx()
    cp(local, { name: 'Manifest' })
    const base = rs(local)
    if (!base.ok || !base.value) throw new Error('no state')
    const ann = {
      id: 'ann-001',
      revisionId: 'rev-001',
      type: 'landmark' as const,
      name: 'L1',
      points: [[1, 2, 3]] as RasPoint[],
      meta: {},
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    // Mirrors App.tsx setStoreFromManifest (R4/R6): annotations from manifest, else [].
    const applyManifest = (manifest: {
      annotations?: typeof ann[]
    } & typeof base.value) => {
      editorStore.setState({
        user: manifest.user,
        project: manifest.project,
        cases: manifest.cases,
        samples: manifest.samples,
        candidates: manifest.candidates,
        revisions: manifest.revisions,
        annotations: manifest.annotations ?? [],
        view: manifest.view,
        volumes: new Map(),
        dirty: false,
        openDocuments: manifest.openDocuments ?? [],
        activeDocumentId: manifest.activeDocumentId ?? null,
      })
    }
    applyManifest({ ...base.value, annotations: [ann] })
    expect(editorStore.getState()?.annotations).toHaveLength(1)
    expect(editorStore.getState()?.annotations[0].name).toBe('L1')
    applyManifest({ ...base.value, annotations: undefined })
    expect(editorStore.getState()?.annotations).toEqual([])
    editorStore.setState(null)
  })
})

describe('addAnnotation', () => {
  it('rejects when active doc is source anatomy', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const sample = st.value.samples.find((x) => x.id === 'sample-000')!
    ctx.store.update((s) => ({
      ...s,
      activeDocumentId: sample.id,
      openDocuments: [{ kind: 'sample', id: sample.id }],
    }))
    const r = addAnnotation(ctx, {
      type: 'landmark',
      name: 'L1',
      points: [[0, 0, 0]] as RasPoint[],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/anatomy|candidate/i)
  })

  it('adds annotation with generated id, revision ownership, and created_at', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const r = addAnnotation(ctx, {
      type: 'landmark',
      name: 'Nasion',
      points: [[1.5, 2.5, 3.5]],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.id).toMatch(/^ann-/)
    expect(r.value.revisionId).toBe(created.value.revisionId)
    expect(r.value.type).toBe('landmark')
    expect(r.value.name).toBe('Nasion')
    expect(r.value.points).toEqual([[1.5, 2.5, 3.5]])
    expect(r.value.locked).toBe(false)
    expect(r.value.visible).toBe(true)
    expect(r.value.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const st = readState(ctx)
    expect(st.ok && st.value?.annotations).toHaveLength(1)
    expect(st.ok && st.value?.dirty).toBe(true)
  })

  it('rejects when revision does not exist', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'landmark',
      name: 'L1',
      points: [[0, 0, 0]],
      meta: {},
      revisionId: 'rev-missing',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/revision/i)
  })

  it('rejects non-finite points', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'landmark',
      name: 'L1',
      points: [[1, Number.NaN, 3]],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/finite/i)
  })
})

describe('annotation mutation ops', () => {
  it('renameAnnotation updates name, leaves other fields unchanged', async () => {
    const { ctx, ann } = await withLandmark()
    const r = renameAnnotation(ctx, { id: ann.id, name: 'Bregma' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.name).toBe('Bregma')
    expect(r.value.points).toEqual(ann.points)
    expect(r.value.type).toBe(ann.type)
    expect(r.value.revisionId).toBe(ann.revisionId)
  })

  it('setAnnotationVisible toggles visible flag only', async () => {
    const { ctx, ann } = await withLandmark()
    const r = setAnnotationVisible(ctx, { id: ann.id, visible: false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.visible).toBe(false)
    expect(r.value.locked).toBe(ann.locked)
    expect(r.value.name).toBe(ann.name)
  })

  it('setAnnotationLocked toggles locked flag only', async () => {
    const { ctx, ann } = await withLandmark()
    const r = setAnnotationLocked(ctx, { id: ann.id, locked: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.locked).toBe(true)
    expect(r.value.visible).toBe(ann.visible)
  })

  it('updateAnnotationPoints replaces points array and marks dirty', async () => {
    const { ctx, ann } = await withLandmark()
    const r = updateAnnotationPoints(ctx, {
      id: ann.id,
      points: [[9, 8, 7]],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.points).toEqual([[9, 8, 7]])
    const st = readState(ctx)
    expect(st.ok && st.value?.dirty).toBe(true)
  })

  it('updateAnnotationPoints rejects non-finite coords', async () => {
    const { ctx, ann } = await withLandmark()
    const r = updateAnnotationPoints(ctx, {
      id: ann.id,
      points: [[1, Number.POSITIVE_INFINITY, 3]],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/finite/i)
  })

  it('updateAnnotationMeta merges meta fields', async () => {
    const { ctx, ann } = await withLandmark()
    updateAnnotationMeta(ctx, { id: ann.id, meta: { body: 'thin wall' } })
    const r = updateAnnotationMeta(ctx, { id: ann.id, meta: { flag: true } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meta).toEqual({ body: 'thin wall', flag: true })
  })

  it('deleteAnnotation removes the annotation from state', async () => {
    const { ctx, ann } = await withLandmark()
    expect(deleteAnnotation(ctx, { id: ann.id }).ok).toBe(true)
    const st = readState(ctx)
    expect(st.ok && st.value?.annotations).toEqual([])
  })

  it('deleteAnnotation no-ops on unknown id rather than throwing', async () => {
    const { ctx } = await withLandmark()
    const r = deleteAnnotation(ctx, { id: 'ann-missing' })
    expect(r.ok).toBe(true)
    const st = readState(ctx)
    expect(st.ok && st.value?.annotations).toHaveLength(1)
  })

  it('all annotation ops are in publicOps', () => {
    const keys = Object.keys(publicOps)
    for (const name of [
      'addAnnotation',
      'renameAnnotation',
      'setAnnotationVisible',
      'setAnnotationLocked',
      'updateAnnotationPoints',
      'updateAnnotationMeta',
      'deleteAnnotation',
    ]) {
      expect(keys).toContain(name)
    }
  })

  it("addAnnotation with type 'angle' accepts 3 points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'angle',
      name: 'A1',
      points: [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
      ],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
  })

  it("addAnnotation with type 'angle' rejects fewer than 3 points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'angle',
      name: 'A1',
      points: [
        [1, 0, 0],
        [0, 0, 0],
      ],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/point/i)
  })

  it("addAnnotation with type 'open_curve' accepts 2+ points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'open_curve',
      name: 'Path',
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
  })

  it("addAnnotation with type 'open_curve' rejects fewer than 2 points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'open_curve',
      name: 'Path',
      points: [[0, 0, 0]],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/point/i)
  })

  it("addAnnotation with type 'roi' accepts 2 points and stores min/max meta", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'roi',
      name: 'Box',
      points: [
        [0, 0, 0],
        [3, 4, 5],
      ],
      meta: { min: [0, 0, 0], max: [3, 4, 5] },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meta).toEqual({ min: [0, 0, 0], max: [3, 4, 5] })
  })

  it("addAnnotation with type 'roi' derives min/max meta from diagonal corners", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'roi',
      name: 'Box',
      points: [
        [3, 0, 5],
        [0, 4, 1],
      ],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meta.min).toEqual([0, 0, 1])
    expect(r.value.meta.max).toEqual([3, 4, 5])
  })

  it("addAnnotation with type 'roi' rejects wrong point count", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'roi',
      name: 'Box',
      points: [[0, 0, 0]],
      meta: {},
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/point/i)
  })

  it("addAnnotation with type 'plane' accepts point-normal meta", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'plane',
      name: 'Cut',
      points: [[0, 0, 0]],
      meta: { method: 'point-normal', sliceDockActive: false },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meta.method).toBe('point-normal')
    expect(r.value.meta.sliceDockActive).toBe(false)
  })

  it("addAnnotation with type 'plane' accepts three-point method and 3 points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'plane',
      name: 'Cut3',
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      meta: { method: 'three-point', sliceDockActive: false },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.meta.method).toBe('three-point')
  })

  it("addAnnotation plane rejects invalid method", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'plane',
      name: 'Bad',
      points: [[0, 0, 0]],
      meta: { method: 'fit-cloud', sliceDockActive: false },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/method|point-normal|three-point/i)
  })

  it("addAnnotation plane three-point rejects fewer than 3 points", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'plane',
      name: 'Short',
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      meta: { method: 'three-point', sliceDockActive: false },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/3|three/i)
  })

  it("addAnnotation with type 'highlight' stores triangle indices in meta", async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    if (!created.ok) throw new Error('createCandidate failed')
    const r = addAnnotation(ctx, {
      type: 'highlight',
      name: 'Zone',
      points: [[0, 0, 0]],
      meta: { color: 'accent', triangleIndices: [0, 1, 2] },
      revisionId: created.value.revisionId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const updated = updateAnnotationMeta(ctx, {
      id: r.value.id,
      meta: { triangleIndices: [0, 1, 2, 3, 4] },
    })
    expect(updated.ok && updated.value.meta.triangleIndices).toEqual([
      0, 1, 2, 3, 4,
    ])
  })
})
