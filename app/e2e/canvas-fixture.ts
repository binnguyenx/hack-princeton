import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import { createFastApiContractBackend } from '../tests/backendContract/fastapiLifecycle'
import { postJson } from '../tests/backendContract/fixtures'

const appRoot = path.resolve(import.meta.dirname, '..')

/** Canvas journeys use fresh HTTP-created records, never the live application root. */
export const test = base.extend<{ canvasApp: string }>({
  canvasApp: async ({ browserName }, supplyApp) => {
    expect(browserName).toBe('chromium')
    const backend = await createFastApiContractBackend({ frontendDir: path.join(appRoot, 'dist') })
    try {
      const project = await postJson(backend.baseUrl, '/api/projects', { name: 'Canvas browser fixture' })
      expect(project.status).toBe(201)
      const { projectId } = await project.json()
      const kase = await postJson(backend.baseUrl, `/api/projects/${projectId}/cases`, { name: 'Canvas browser case' })
      expect(kase.status).toBe(201)
      const { caseId } = await kase.json()
      const sampleRoot = path.join(appRoot, '../data/samples/skullbreak-000-parietotemporal-complete')
      const metadata = JSON.parse(await readFile(path.join(sampleRoot, 'metadata.json'), 'utf8'))
      const bytes = await readFile(path.join(sampleRoot, metadata.primaryVolume))
      const form = new FormData()
      form.set('file', new Blob([bytes]), metadata.primaryVolume)
      form.set('displayName', 'skullbreak-000-parietotemporal-complete')
      form.set('spatiallyVerified', 'true')
      form.set('meta', JSON.stringify(metadata.spatial))
      const imported = await fetch(`${backend.baseUrl}/api/projects/${projectId}/cases/${caseId}/samples`, { method: 'POST', body: form })
      expect(imported.status).toBe(201)
      await supplyApp(backend.baseUrl)
    } finally { await backend.close() }
  },
  baseURL: async ({ canvasApp }, supplyApp) => { await supplyApp(canvasApp) },
})

export { expect }
