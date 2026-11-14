import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApiRouter } from '../server/api'
import {
  setStorageFaultsForTests,
  setStorageRootForTests,
} from '../server/storageSqlite'

const META = {
  units: 'mm',
  sizes: [12, 12, 12],
  spacings: [1, 1, 1],
  bboxMm: [12, 12, 12],
}

describe('backend API CRUD parity + atomic NRRD', () => {
  let tempRoot = ''
  let baseUrl = ''
  let stop: (() => Promise<void>) | null = null

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api', createApiRouter())
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    baseUrl = `http://127.0.0.1:${address.port}`
    stop = async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    }
  })

  afterAll(async () => {
    if (stop) await stop()
  })

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-api-'))
    setStorageRootForTests(tempRoot)
    setStorageFaultsForTests({})
  })

  afterEach(async () => {
    setStorageFaultsForTests({})
    await rm(tempRoot, { recursive: true, force: true })
  })

  async function api(pathname: string, init?: RequestInit) {
    return fetch(`${baseUrl}/api${pathname}`, init)
  }

  it('project/case CRUD over HTTP', async () => {
    const created = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vault HTTP' }),
    })
    expect(created.status).toBe(201)
    const { projectId } = await created.json() as { projectId: string }
    expect(projectId).toBeTruthy()

    const listed = await api('/projects')
    expect(listed.status).toBe(200)
    const projects = await listed.json() as Array<{ id: string }>
    expect(projects.some((p) => p.id === projectId)).toBe(true)

    const mkCase = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case HTTP' }),
    })
    expect(mkCase.status).toBe(201)
    const { caseId } = await mkCase.json() as { caseId: string }
    expect(caseId).toBeTruthy()

    const project = await api(`/projects/${projectId}`)
    const manifest = await project.json() as { cases: Array<{ id: string }> }
    expect(manifest.cases.some((c) => c.id === caseId)).toBe(true)

    const deletedProject = await api(`/projects/${projectId}`, { method: 'DELETE' })
    expect(deletedProject.status).toBe(204)
  })

  it('sample import + NRRD serve + candidate/revision lifecycle over HTTP', async () => {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Study API' }),
    })
    const { projectId } = await p.json() as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case API' }),
    })
    const { caseId } = await c.json() as { caseId: string }

    const bytes = Buffer.from([3, 4, 5, 6, 7])
    const form = new FormData()
    form.set('file', new Blob([bytes]), 'sample.nrrd')
    form.set('displayName', 'sample.nrrd')
    form.set('spatiallyVerified', 'true')
    form.set('meta', JSON.stringify(META))
    const s = await api(`/projects/${projectId}/cases/${caseId}/samples`, {
      method: 'POST',
      body: form,
    })
    expect(s.status).toBe(201)
    const { sampleId } = await s.json() as { sampleId: string }

    const vol = await api(`/samples/${sampleId}/volume`)
    expect(vol.status).toBe(200)
    const arr = new Uint8Array(await vol.arrayBuffer())
    expect(Buffer.compare(Buffer.from(arr), bytes)).toBe(0)

    const cand = await api(`/samples/${sampleId}/candidates`, { method: 'POST' })
    expect(cand.status).toBe(201)
    const { candidateId } = await cand.json() as { candidateId: string }

    const transform = await api(`/candidates/${candidateId}/transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pose: [1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }),
    })
    expect(transform.status).toBe(201)
    const { revisionId } = await transform.json() as { revisionId: string }
    expect(revisionId).toBeTruthy()

    const restore = await api(`/candidates/${candidateId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId }),
    })
    expect(restore.status).toBe(200)

    const delCandidate = await api(`/candidates/${candidateId}`, { method: 'DELETE' })
    expect(delCandidate.status).toBe(204)
  })

  it('rejects candidate creation for unverified sample over HTTP', async () => {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unverified' }),
    })
    const { projectId } = await p.json() as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case' }),
    })
    const { caseId } = await c.json() as { caseId: string }

    const form = new FormData()
    form.set('file', new Blob([Buffer.from([1])]), 'u.nrrd')
    form.set('displayName', 'u.nrrd')
    form.set('spatiallyVerified', 'false')
    form.set('meta', JSON.stringify(META))
    const s = await api(`/projects/${projectId}/cases/${caseId}/samples`, {
      method: 'POST',
      body: form,
    })
    const { sampleId } = await s.json() as { sampleId: string }

    const cand = await api(`/samples/${sampleId}/candidates`, { method: 'POST' })
    expect(cand.status).toBe(409)
  })

  it('atomic import failure leaves no partial sample/volume via HTTP', async () => {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Atomic API' }),
    })
    const { projectId } = await p.json() as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case' }),
    })
    const { caseId } = await c.json() as { caseId: string }

    setStorageFaultsForTests({ failAfterVolumeWrite: true })
    const form = new FormData()
    form.set('file', new Blob([Buffer.from([9, 9])]), 'bad.nrrd')
    form.set('displayName', 'bad.nrrd')
    form.set('spatiallyVerified', 'true')
    form.set('meta', JSON.stringify(META))
    const res = await api(`/projects/${projectId}/cases/${caseId}/samples`, {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(500)
    setStorageFaultsForTests({})

    const project = await api(`/projects/${projectId}`)
    const manifest = await project.json() as { samples: unknown[] }
    expect(manifest.samples).toHaveLength(0)
    const volumesDir = path.join(tempRoot, 'volumes')
    const files = await (await import('node:fs/promises')).readdir(volumesDir).catch(() => [])
    expect(files.filter((f) => f.endsWith('.nrrd'))).toHaveLength(0)
  })

  it('missing NRRD serve fails without mutating metadata', async () => {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Serve' }),
    })
    const { projectId } = await p.json() as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case' }),
    })
    const { caseId } = await c.json() as { caseId: string }

    const bytes = Buffer.from([8, 1, 8, 1])
    const form = new FormData()
    form.set('file', new Blob([bytes]), 'sample.nrrd')
    form.set('displayName', 'sample.nrrd')
    form.set('spatiallyVerified', 'true')
    form.set('meta', JSON.stringify(META))
    const s = await api(`/projects/${projectId}/cases/${caseId}/samples`, {
      method: 'POST',
      body: form,
    })
    const { sampleId } = await s.json() as { sampleId: string }

    const before = await api(`/projects/${projectId}`)
    const beforeManifest = await before.json() as { samples: Array<{ id: string }> }
    expect(beforeManifest.samples.some((x) => x.id === sampleId)).toBe(true)

    // Remove underlying file directly to simulate missing blob.
    const vol = await api(`/samples/${sampleId}/volume`)
    expect(vol.status).toBe(200)
    const manifestRes = await api(`/projects/${projectId}`)
    const manifest = await manifestRes.json() as {
      samples: Array<{ id: string; sourceAnatomy: { volumeId: string } }>
    }
    const sample = manifest.samples.find((x) => x.id === sampleId)
    if (!sample) throw new Error('sample missing')
    await rm(path.join(tempRoot, 'volumes', `${sample.sourceAnatomy.volumeId}.nrrd`))

    const missing = await api(`/samples/${sampleId}/volume`)
    expect(missing.status).toBe(404)

    const after = await api(`/projects/${projectId}`)
    const afterManifest = await after.json() as { samples: Array<{ id: string }> }
    expect(afterManifest.samples.some((x) => x.id === sampleId)).toBe(true)
  })

  it('atomic delete failure keeps previous sample state over HTTP', async () => {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Delete rollback' }),
    })
    const { projectId } = await p.json() as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case' }),
    })
    const { caseId } = await c.json() as { caseId: string }

    const form = new FormData()
    form.set('file', new Blob([Buffer.from([1, 2])]), 'sample.nrrd')
    form.set('displayName', 'sample.nrrd')
    form.set('spatiallyVerified', 'true')
    form.set('meta', JSON.stringify(META))
    const s = await api(`/projects/${projectId}/cases/${caseId}/samples`, {
      method: 'POST',
      body: form,
    })
    const { sampleId } = await s.json() as { sampleId: string }

    setStorageFaultsForTests({ failBeforeSampleDelete: true })
    const del = await api(`/samples/${sampleId}`, { method: 'DELETE' })
    expect(del.status).toBe(500)
    setStorageFaultsForTests({})

    const manifest = await (await api(`/projects/${projectId}`)).json() as { samples: Array<{ id: string }> }
    expect(manifest.samples.some((x) => x.id === sampleId)).toBe(true)
    const volumeRes = await api(`/samples/${sampleId}/volume`)
    expect(volumeRes.status).toBe(200)
    const served = Buffer.from(await volumeRes.arrayBuffer())
    expect(served.length).toBe(2)
  })
})

