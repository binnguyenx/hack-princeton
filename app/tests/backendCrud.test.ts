import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Mat4 } from '../src/domain/types'
import {
  addCase,
  addSample,
  commitTransform,
  createCandidate,
  createProject,
  deleteCandidate,
  deleteProject,
  findSampleVolume,
  getProjectManifest,
  listProjects,
  readVolume,
  removeCase,
  removeSample,
  restoreRevision,
  setStorageRootForTests,
  setStorageFaultsForTests,
} from '../server/storageSqlite'

const META = {
  units: 'mm',
  sizes: [10, 10, 10],
  spacings: [1, 1, 1],
  bboxMm: [10, 10, 10],
}

const POSE_SHIFT: Mat4 = [
  1, 0, 0, 3,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

describe('backend storage CRUD + atomic NRRD', () => {
  let tempRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-storage-'))
    setStorageRootForTests(tempRoot)
    setStorageFaultsForTests({})
  })

  afterEach(async () => {
    setStorageFaultsForTests({})
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('project CRUD persists list/get/delete', async () => {
    const project = await createProject('Vault A')
    expect(project.name).toBe('Vault A')

    const listed = await listProjects()
    expect(listed.map((p) => p.id)).toContain(project.id)

    const manifest = await getProjectManifest(project.id)
    expect(manifest.project.id).toBe(project.id)
    expect(manifest.user.id).toBe('local-dev')

    await deleteProject(project.id)
    const afterDelete = await listProjects()
    expect(afterDelete.find((p) => p.id === project.id)).toBeUndefined()
  })

  it('sample import writes NRRD and candidate R0 references sample volume', async () => {
    const project = await createProject('Study')
    const kase = await addCase(project.id, 'Case 001')
    const bytes = Buffer.from([1, 2, 3, 4, 5, 6])

    const sample = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'defective_skull.nrrd',
      spatiallyVerified: true,
      meta: META,
      bytes,
    })

    const vol = await findSampleVolume(sample.id)
    expect(vol).toBeTruthy()
    if (!vol) return
    const read = await readVolume(vol.projectId, vol.volumeId)
    expect(Buffer.compare(read, bytes)).toBe(0)

    const c = await createCandidate(sample.id)
    const manifest = await getProjectManifest(project.id)
    const r0 = manifest.revisions.find((r) => r.id === c.revisionId)
    expect(r0?.order).toBe(0)
    expect(r0?.volumeId).toBe(sample.sourceAnatomy.volumeId)
  })

  it('candidate/revision CRUD supports transform, restore, delete', async () => {
    const project = await createProject('Transforms')
    const kase = await addCase(project.id, 'Case')
    const sample = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'sample.nrrd',
      spatiallyVerified: true,
      meta: META,
      bytes: Buffer.from([9, 9, 9]),
    })
    const c = await createCandidate(sample.id)
    const rev1 = await commitTransform(c.candidateId, POSE_SHIFT)
    await restoreRevision(c.candidateId, c.revisionId)

    const manifest = await getProjectManifest(project.id)
    const cand = manifest.candidates.find((x) => x.objectId === c.candidateId)
    expect(cand?.currentRevisionId).toBe(c.revisionId)
    expect(
      manifest.revisions.filter((r) => r.candidateId === c.candidateId),
    ).toHaveLength(2)
    expect(manifest.revisions.find((r) => r.id === rev1)?.order).toBe(1)

    await deleteCandidate(c.candidateId)
    const after = await getProjectManifest(project.id)
    expect(after.candidates.find((x) => x.objectId === c.candidateId)).toBeUndefined()
    expect(after.revisions.find((x) => x.candidateId === c.candidateId)).toBeUndefined()
  })

  it('cascades deletes from sample->candidate/revisions and case->samples', async () => {
    const project = await createProject('Cascade')
    const kase = await addCase(project.id, 'Case')
    const sample = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'sample.nrrd',
      spatiallyVerified: true,
      meta: META,
      bytes: Buffer.from([1, 1, 1, 1]),
    })
    const c = await createCandidate(sample.id)

    const loc = await findSampleVolume(sample.id)
    expect(loc).toBeTruthy()
    if (!loc) return
    const volumeFile = path.join(tempRoot, 'volumes', `${loc.volumeId}.nrrd`)
    await stat(volumeFile)

    await removeSample(project.id, kase.id, sample.id)
    const m1 = await getProjectManifest(project.id)
    expect(m1.samples.find((s) => s.id === sample.id)).toBeUndefined()
    expect(m1.candidates.find((x) => x.objectId === c.candidateId)).toBeUndefined()
    expect(m1.revisions.find((x) => x.candidateId === c.candidateId)).toBeUndefined()
    await expect(stat(volumeFile)).rejects.toThrow()

    const sample2 = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'sample2.nrrd',
      spatiallyVerified: true,
      meta: META,
      bytes: Buffer.from([2, 2]),
    })
    await removeCase(project.id, kase.id)
    const m2 = await getProjectManifest(project.id)
    expect(m2.cases.find((x) => x.id === kase.id)).toBeUndefined()
    expect(m2.samples.find((x) => x.id === sample2.id)).toBeUndefined()
  })

  it('rejects candidate creation for unverified sample', async () => {
    const project = await createProject('Verify')
    const kase = await addCase(project.id, 'Case')
    const sample = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'sample.nrrd',
      spatiallyVerified: false,
      meta: META,
      bytes: Buffer.from([7, 7]),
    })
    await expect(createCandidate(sample.id)).rejects.toThrow(/verified/i)
  })

  it('atomic import rollback: no partial rows/files on write failure', async () => {
    const project = await createProject('Atomic Import')
    const kase = await addCase(project.id, 'Case')
    setStorageFaultsForTests({ failAfterVolumeWrite: true })

    await expect(
      addSample({
        projectId: project.id,
        caseId: kase.id,
        displayName: 'broken.nrrd',
        spatiallyVerified: true,
        meta: META,
        bytes: Buffer.from([1, 2, 3]),
      }),
    ).rejects.toThrow(/injected/i)

    setStorageFaultsForTests({})
    const manifest = await getProjectManifest(project.id)
    expect(manifest.samples).toHaveLength(0)
    const volumeDir = path.join(tempRoot, 'volumes')
    // Directory may exist; no .nrrd blobs should remain.
    const blobs = await (await import('node:fs/promises')).readdir(volumeDir).catch(() => [])
    expect(blobs.filter((f) => f.endsWith('.nrrd'))).toHaveLength(0)
  })

  it('atomic delete rollback: injected failure leaves prior state intact', async () => {
    const project = await createProject('Atomic Delete')
    const kase = await addCase(project.id, 'Case')
    const sample = await addSample({
      projectId: project.id,
      caseId: kase.id,
      displayName: 'sample.nrrd',
      spatiallyVerified: true,
      meta: META,
      bytes: Buffer.from([8, 8, 8]),
    })

    setStorageFaultsForTests({ failBeforeSampleDelete: true })
    await expect(removeSample(project.id, kase.id, sample.id)).rejects.toThrow(/injected/i)
    setStorageFaultsForTests({})

    const manifest = await getProjectManifest(project.id)
    expect(manifest.samples.find((s) => s.id === sample.id)).toBeTruthy()
    const loc = await findSampleVolume(sample.id)
    expect(loc).toBeTruthy()
    if (!loc) return
    const bytes = await readFile(path.join(tempRoot, 'volumes', `${loc.volumeId}.nrrd`))
    expect(bytes.length).toBe(3)
  })
})

