import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { test, expect } from '@playwright/test'
import { createServer, preview, type ViteDevServer } from 'vite'
import { createFastApiContractBackend } from '../tests/backendContract/fastapiLifecycle'

const appRoot = path.resolve(import.meta.dirname, '..')
const built = path.join(appRoot, 'dist')

for (const mode of ['development', 'built'] as const) {
  test(`${mode}: browser workflow, API precedence, bytes and backend restart`, async ({ page }) => {
    const backend = await createFastApiContractBackend({ frontendDir: mode === 'built' ? built : undefined })
    let vite: ViteDevServer | undefined
    const previousOrigin = process.env.HACK_API_ORIGIN
    let origin = backend.baseUrl
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
      if (mode === 'development') {
        process.env.HACK_API_ORIGIN = backend.baseUrl
        vite = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 0 }, configFile: path.join(appRoot, 'vite.config.ts') })
        // Fail before any HTTP request if the dev configuration would use Express.
        expect(vite.config.server.proxy?.['/api']).toMatchObject({ target: backend.baseUrl })
        await vite.listen()
        origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
      }
      await page.goto(origin)
      await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
      await page.getByLabel('Project Name', { exact: true }).fill(`Browser ${mode}`)
      await page.getByRole('button', { name: 'Create Project', exact: true }).click()
      await page.getByRole('button', { name: 'New Case', exact: true }).click()
      await page.getByLabel('Case Name / Identifier').fill(`Case ${mode}`)
      await page.getByRole('button', { name: 'Create Case', exact: true }).click()
      await expect(page.getByText(`Case ${mode}`, { exact: true }).first()).toBeVisible()
      await page.getByRole('button', { name: 'Import Sample', exact: true }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('dialog').getByRole('radio').first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Import Sample', exact: true }).click()
      await expect.poll(async () => {
        const projects = await (await page.request.get(`${origin}/api/projects`)).json()
        if (!projects[0]) return 0
        const state = await (await page.request.get(`${origin}/api/projects/${projects[0].id}`)).json()
        return state.samples.length
      }).toBe(1)
      await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
      await page.getByTitle('Create new candidate implant').click()
      await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
      await expect(page.getByRole('button', { name: /^Transform Tool/ })).toBeEnabled()
      await page.getByRole('button', { name: /^Transform Tool/ }).click()
      await page.getByRole('button', { name: 'Apply', exact: true }).click()
      const projects = await (await page.request.get(`${origin}/api/projects`)).json()
      const projectId = projects[0].id
      await expect.poll(async () => {
        const state = await (await page.request.get(`${origin}/api/projects/${projectId}`)).json()
        return state.revisions.length
      }).toBe(2)
      // Reloading the authoritative manifest closes the editor tab; reopen it via UI.
      await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
      await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
      await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
      await page.getByRole('button', { name: /^Restore Revision/ }).click()
      await expect.poll(async () => {
        const state = await (await page.request.get(`${origin}/api/projects/${projectId}`)).json()
        return state.candidates[0].currentRevisionId === state.revisions[0].id
      }).toBe(true)
      const before = await (await page.request.get(`${origin}/api/projects/${projectId}`)).json()
      const download = await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)
      expect(download.headers()['content-type']).toContain('application/octet-stream')
      const bytes = await download.body()
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(before.samples[0].sourceAnatomy.volumeHash)
      const source = await readFile(path.join(appRoot, '../data/samples/skullbreak-000-parietotemporal/defective_skull.nrrd'))
      expect(bytes).toEqual(source)
      const missing = await page.request.get(`${origin}/api/not-a-route`)
      expect(missing.status()).toBe(404)
      expect(await missing.json()).toEqual({ error: 'API route not found' })
      const invalid = await page.request.post(`${origin}/api/projects`, { data: { name: '' } })
      expect(invalid.status()).toBe(400)
      expect(await invalid.json()).toHaveProperty('error')
      await backend.restart()
      // A process restart may bind another test port. Update the test dev proxy accordingly.
      if (vite) {
        vite.config.server.proxy!['/api'] = { target: backend.baseUrl }
        await vite.close(); vite = undefined
        process.env.HACK_API_ORIGIN = backend.baseUrl
        vite = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 0 }, configFile: path.join(appRoot, 'vite.config.ts') })
        await vite.listen()
        origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
      } else origin = backend.baseUrl
      await page.goto(origin)
      await page.getByRole('button', { name: `Browser ${mode}`, exact: true }).first().click()
      expect(await (await page.request.get(`${origin}/api/projects/${projectId}`)).json()).toEqual(before)
      if (mode === 'built') {
        const route = await page.goto(`${origin}/workspace/browser-refresh`)
        expect(route!.status()).toBe(200)
        await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
      }
      expect(pageErrors).toEqual([])
    } finally {
      if (previousOrigin === undefined) delete process.env.HACK_API_ORIGIN
      else process.env.HACK_API_ORIGIN = previousOrigin
      try { await vite?.close() } finally { await backend.close() }
    }
  })
}

test('preview stays frontend-only even when a development API origin is configured', async ({ page }) => {
  const previous = process.env.HACK_API_ORIGIN
  process.env.HACK_API_ORIGIN = 'http://127.0.0.1:1'
  const server = await preview({ root: appRoot, preview: { host: '127.0.0.1', port: 0 }, configFile: path.join(appRoot, 'vite.config.ts') })
  try {
    expect(server.config.preview.proxy ?? {}).toEqual({})
    const origin = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`
    const response = await page.goto(origin)
    expect(response!.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  } finally {
    if (previous === undefined) delete process.env.HACK_API_ORIGIN
    else process.env.HACK_API_ORIGIN = previous
    await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
