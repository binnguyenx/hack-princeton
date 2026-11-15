import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApiRouter } from '../server/api'
import {
  setStorageFaultsForTests,
  setStorageRootForTests,
} from '../server/storageSqlite'
import { decodeNrrdVoxels } from '../src/geometry/nrrdVoxels'

const here = path.dirname(fileURLToPath(import.meta.url))
const tinySeries = path.join(here, 'fixtures/dicom-series-tiny')
const twoSeries = path.join(here, 'fixtures/dicom-series-two')

async function filesToForm(dir: string, displayName?: string): Promise<FormData> {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.dcm'))
  const form = new FormData()
  for (const name of names) {
    const bytes = await readFile(path.join(dir, name))
    form.append('files', new Blob([bytes]), name)
  }
  if (displayName) form.set('displayName', displayName)
  return form
}

describe('DICOM → intensity Sample import API', () => {
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
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-dicom-api-'))
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

  async function projectAndCase() {
    const p = await api('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CT Import' }),
    })
    const { projectId } = (await p.json()) as { projectId: string }
    const c = await api(`/projects/${projectId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case CT' }),
    })
    const { caseId } = (await c.json()) as { caseId: string }
    return { projectId, caseId }
  }

  it('imports one-series DICOM into a Sample with int16 HU volume (R1–R3, R6, R9)', async () => {
    const { projectId, caseId } = await projectAndCase()
    const form = await filesToForm(tinySeries, 'fixture-ct')
    const res = await api(`/projects/${projectId}/cases/${caseId}/samples/from-dicom`, {
      method: 'POST',
      body: form,
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const body = (await res.json()) as {
      sampleId: string
      spatiallyVerified: boolean
    }
    expect(body.sampleId).toBeTruthy()
    expect(body.spatiallyVerified).toBe(true)

    const manifestRes = await api(`/projects/${projectId}`)
    const manifest = (await manifestRes.json()) as {
      samples: Array<{
        id: string
        license: string
        spatiallyVerified: boolean
        sourceAnatomy: { volumeId: string; spatial: { sizes: number[]; spacings: number[] } }
      }>
    }
    const sample = manifest.samples.find((s) => s.id === body.sampleId)
    expect(sample).toBeTruthy()
    expect(sample!.license).toBe('user-supplied-ct')
    expect(sample!.license).not.toMatch(/skullbreak|cq500/i)
    expect(sample!.sourceAnatomy.spatial.sizes).toEqual([8, 8, 4])
    expect(sample!.sourceAnatomy.spatial.spacings[0]).toBeCloseTo(1, 5)

    const volumePath = path.join(
      tempRoot,
      'volumes',
      `${sample!.sourceAnatomy.volumeId}.nrrd`,
    )
    const bytes = new Uint8Array(await readFile(volumePath))
    const decoded = decodeNrrdVoxels(bytes)
    expect(decoded.type).toBe('int16')
    const values = Array.from(decoded.voxels as Int16Array)
    expect(values.some((v) => v < 0 || v > 255)).toBe(true)

    const vol = await api(`/samples/${body.sampleId}/volume`)
    expect(vol.status).toBe(200)
  })

  it('rejects two-series upload with no Sample and no volume file (R7, S4)', async () => {
    const { projectId, caseId } = await projectAndCase()
    const form = await filesToForm(twoSeries)
    const res = await api(`/projects/${projectId}/cases/${caseId}/samples/from-dicom`, {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const manifest = (await (await api(`/projects/${projectId}`)).json()) as {
      samples: unknown[]
    }
    expect(manifest.samples).toHaveLength(0)
    const volumes = await readdir(path.join(tempRoot, 'volumes')).catch(() => [])
    expect(volumes.filter((f) => f.endsWith('.nrrd'))).toHaveLength(0)
  })

  it('fault after volume write leaves no Sample row (R10, S5)', async () => {
    const { projectId, caseId } = await projectAndCase()
    setStorageFaultsForTests({ failAfterVolumeWrite: true })
    const form = await filesToForm(tinySeries)
    const res = await api(`/projects/${projectId}/cases/${caseId}/samples/from-dicom`, {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBeGreaterThanOrEqual(500)
    setStorageFaultsForTests({})

    const manifest = (await (await api(`/projects/${projectId}`)).json()) as {
      samples: unknown[]
    }
    expect(manifest.samples).toHaveLength(0)
    const volumes = await readdir(path.join(tempRoot, 'volumes')).catch(() => [])
    expect(volumes.filter((f) => f.endsWith('.nrrd'))).toHaveLength(0)
  })

  it('does not add an in-place volume replace route (R8)', async () => {
    const res = await api('/samples/any/volume', { method: 'PUT', body: 'x' })
    expect(res.status).toBe(404)
  })
})
