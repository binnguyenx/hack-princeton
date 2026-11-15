import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addAnnotation,
  createCandidate,
  createProject,
  readState,
} from '../src/ops'
import { loadProjectPackage, saveProjectPackage } from '../src/io/projectPackage'
import {
  addCase,
  addSample,
  createAnnotation,
  createCandidate as createCandidateDb,
  createProject as createProjectDb,
  deleteAnnotation,
  deleteCandidate,
  getProjectManifest,
  listAnnotations,
  removeSample,
  setStorageFaultsForTests,
  setStorageRootForTests,
  updateAnnotation,
} from '../server/storageSqlite'
import { freshCtx, openDemo } from './helpers'

const META = {
  units: 'mm',
  sizes: [10, 10, 10],
  spacings: [1, 1, 1],
  bboxMm: [10, 10, 10],
}

async function seedRevision() {
  const project = await createProjectDb('Annot')
  const kase = await addCase(project.id, 'Case')
  const sample = await addSample({
    projectId: project.id,
    caseId: kase.id,
    displayName: 'skull.nrrd',
    spatiallyVerified: true,
    meta: META,
    bytes: Buffer.from([1, 2, 3, 4]),
  })
  const cand = await createCandidateDb(sample.id)
  return { project, sample, cand }
}

describe('annotation storage CRUD + cascade', () => {
  let tempRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-ann-'))
    setStorageRootForTests(tempRoot)
    setStorageFaultsForTests({})
  })

  afterEach(async () => {
    setStorageFaultsForTests({})
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('annotations table exists in initDb — createAnnotation persists a row', async () => {
    const { cand } = await seedRevision()
    const ann = await createAnnotation({
      revisionId: cand.revisionId,
      type: 'landmark',
      name: 'Nasion',
      points: [[1, 2, 3]],
      meta: {},
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(ann.id).toBeTruthy()
    expect(ann.revisionId).toBe(cand.revisionId)
    expect(ann.type).toBe('landmark')
    expect(ann.points).toEqual([[1, 2, 3]])
    const listed = await listAnnotations(cand.revisionId)
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Nasion')
  })

  it('getProjectManifest includes annotations for all revisions', async () => {
    const { project, cand } = await seedRevision()
    await createAnnotation({
      revisionId: cand.revisionId,
      type: 'line',
      name: 'Span',
      points: [
        [0, 0, 0],
        [3, 4, 0],
      ],
      meta: {},
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const manifest = await getProjectManifest(project.id)
    expect(manifest.annotations).toBeDefined()
    expect(manifest.annotations).toHaveLength(1)
    expect(manifest.annotations![0].name).toBe('Span')
    expect(manifest.annotations![0].revisionId).toBe(cand.revisionId)
  })

  it('createAnnotation / updateAnnotation / deleteAnnotation roundtrip', async () => {
    const { cand } = await seedRevision()
    const ann = await createAnnotation({
      revisionId: cand.revisionId,
      type: 'text_note',
      name: 'Note',
      points: [[5, 5, 5]],
      meta: { body: 'check rim' },
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const updated = await updateAnnotation(ann.id, {
      name: 'Note 2',
      locked: true,
      meta: { body: 'updated' },
    })
    expect(updated.name).toBe('Note 2')
    expect(updated.locked).toBe(true)
    expect(updated.meta).toEqual({ body: 'updated' })
    await deleteAnnotation(ann.id)
    expect(await listAnnotations(cand.revisionId)).toEqual([])
  })

  it('createAnnotation persists ROI min/max in meta_json', async () => {
    const { cand } = await seedRevision()
    const ann = await createAnnotation({
      revisionId: cand.revisionId,
      type: 'roi',
      name: 'Box',
      points: [
        [0, 0, 0],
        [3, 4, 5],
      ],
      meta: { min: [0, 0, 0], max: [3, 4, 5] },
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const listed = await listAnnotations(cand.revisionId)
    expect(listed).toHaveLength(1)
    expect(listed[0].type).toBe('roi')
    expect(listed[0].meta).toEqual({ min: [0, 0, 0], max: [3, 4, 5] })
    const updated = await updateAnnotation(ann.id, {
      meta: { min: [1, 1, 1], max: [2, 2, 2] },
    })
    expect(updated.meta).toEqual({ min: [1, 1, 1], max: [2, 2, 2] })
  })

  it('deleteCandidate cascades to annotations', async () => {
    const { cand } = await seedRevision()
    await createAnnotation({
      revisionId: cand.revisionId,
      type: 'landmark',
      name: 'L',
      points: [[0, 0, 0]],
      meta: {},
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await deleteCandidate(cand.candidateId)
    expect(await listAnnotations(cand.revisionId)).toEqual([])
  })

  it('removeSample cascades through candidates to annotations', async () => {
    const { project, sample, cand } = await seedRevision()
    await createAnnotation({
      revisionId: cand.revisionId,
      type: 'landmark',
      name: 'L',
      points: [[0, 0, 0]],
      meta: {},
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await removeSample(project.id, sample.caseId, sample.id)
    expect(await listAnnotations(cand.revisionId)).toEqual([])
  })

  it('plane meta.sliceDockActive round-trips through create/update', async () => {
    const { cand } = await seedRevision()
    const ann = await createAnnotation({
      revisionId: cand.revisionId,
      type: 'plane',
      name: 'Mid-sagittal',
      points: [[0, 0, 0]],
      meta: { method: 'point-normal', sliceDockActive: false },
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(ann.meta).toEqual({
      method: 'point-normal',
      sliceDockActive: false,
    })
    const updated = await updateAnnotation(ann.id, {
      meta: { method: 'point-normal', sliceDockActive: true },
    })
    expect(updated.meta.sliceDockActive).toBe(true)
    const listed = await listAnnotations(cand.revisionId)
    expect(listed[0].meta.sliceDockActive).toBe(true)
  })

  it('highlight meta with large triangleIndices array round-trips through storage', async () => {
    const { cand } = await seedRevision()
    const triangleIndices = Array.from({ length: 5000 }, (_, i) => i)
    const ann = await createAnnotation({
      revisionId: cand.revisionId,
      type: 'highlight',
      name: 'Zone',
      points: [[0, 0, 0]],
      meta: { color: 'amber', triangleIndices },
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(ann.meta.color).toBe('amber')
    expect(ann.meta.triangleIndices).toHaveLength(5000)
    expect((ann.meta.triangleIndices as number[])[4999]).toBe(4999)
    const updated = await updateAnnotation(ann.id, {
      meta: { color: 'rose', triangleIndices: triangleIndices.slice(0, 100) },
    })
    expect(updated.meta.color).toBe('rose')
    expect(updated.meta.triangleIndices).toHaveLength(100)
    const listed = await listAnnotations(cand.revisionId)
    expect(listed[0].meta.triangleIndices).toEqual(
      triangleIndices.slice(0, 100),
    )
  })

  it('saveProjectPackage / loadProjectPackage round-trips annotations', async () => {
    const ctx = await openDemo()
    const created = await createCandidate(ctx, 'sample-000')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(
      addAnnotation(ctx, {
        type: 'closed_curve',
        name: 'Rim',
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        meta: {},
        revisionId: created.value.revisionId,
      }).ok,
    ).toBe(true)
    const st = readState(ctx)
    if (!st.ok || !st.value) throw new Error('no state')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hp-pkg-'))
    try {
      await saveProjectPackage(dir, st.value)
      const loaded = await loadProjectPackage(dir)
      expect(loaded.annotations).toHaveLength(1)
      expect(loaded.annotations[0].name).toBe('Rim')
      expect(loaded.annotations[0].points).toEqual([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
