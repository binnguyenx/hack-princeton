import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { unzipSync, strFromU8 } from 'fflate'
import { test, expect } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { createFastApiContractBackend } from '../tests/backendContract/fastapiLifecycle'
import { postJson } from '../tests/backendContract/fixtures'

const appRoot = path.resolve(import.meta.dirname, '..')
for (const mode of ['development', 'built'] as const) {
  test(`${mode}: real package download/import preserves restored history and survives restart`, async ({ page }) => {
    const backend = await createFastApiContractBackend({ frontendDir: path.join(appRoot, 'dist') })
    let vite: ViteDevServer | undefined
    const previousOrigin = process.env.HACK_API_ORIGIN
    let origin = backend.baseUrl
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      if (mode === 'development') {
        process.env.HACK_API_ORIGIN = backend.baseUrl
        vite = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 0 }, configFile: path.join(appRoot, 'vite.config.ts') })
        await vite.listen()
        origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
      }
      const project = await (await postJson(origin, '/api/projects', { name: 'Portable browser study' })).json()
      const kase = await (await postJson(origin, `/api/projects/${project.projectId}/cases`, { name: 'Case' })).json()
      const sourceRoot = path.join(appRoot, '../data/samples/skullbreak-000-parietotemporal-complete')
      const metadata = JSON.parse(await readFile(path.join(sourceRoot, 'metadata.json'), 'utf8'))
      const bytes = await readFile(path.join(sourceRoot, metadata.primaryVolume))
      const form = new FormData()
      form.set('file', new Blob([bytes]), metadata.primaryVolume)
      form.set('displayName', 'skullbreak-000-parietotemporal-complete')
      form.set('spatiallyVerified', 'true')
      form.set('meta', JSON.stringify(metadata.spatial))
      expect((await fetch(`${origin}/api/projects/${project.projectId}/cases/${kase.caseId}/samples`, { method: 'POST', body: form })).status).toBe(201)
      const manifest = async (id: string) => (await page.request.get(`${backend.baseUrl}/api/projects/${id}`)).json()
      const source = (await manifest(project.projectId)).samples[0]
      const candidate = await (await postJson(origin, `/api/samples/${source.id}/candidates`, {})).json()
      const pose = [1, 0, 0, 9, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
      expect((await postJson(origin, `/api/candidates/${candidate.candidateId}/transform`, { pose })).status).toBe(201)
      expect((await postJson(origin, `/api/candidates/${candidate.candidateId}/restore`, { revisionId: candidate.revisionId })).status).toBe(200)
      const before = await manifest(project.projectId)
      await page.goto(origin)
      await page.getByRole('button', { name: 'Open', exact: true }).first().click()
      await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas().visibleObjectIds.length)).toBe(1)
      let releaseWrite!: () => void
      const heldWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
      let writing = false
      await page.route('**/api/projects/*/cases', async (route) => { writing = true; await heldWrite; await route.continue() })
      await page.getByRole('button', { name: 'New Case', exact: true }).click()
      await page.getByLabel('Case Name / Identifier').fill('Pending case')
      await page.getByRole('button', { name: 'Create Case', exact: true }).click()
      await expect.poll(() => writing).toBe(true)
      try {
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Open Package', exact: true })).toBeDisabled()
      } finally { releaseWrite() }
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
      await page.unroute('**/api/projects/*/cases')
      Object.assign(before, await manifest(project.projectId))
      await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
      await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas().visibleObjectIds.length)).toBe(1)
      await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
      await page.getByRole('button', { name: /^Transform Tool/ }).click()
      await page.getByLabel('Translate X (mm)').fill('12')
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Open Package', exact: true })).toBeDisabled()
      await page.keyboard.press('Control+s')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('button', { name: 'Hide active object' }).click()
      await expect.poll(() => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas().visibleObjectIds)).toEqual([])
      await page.route('**/api/projects/*/package', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fixture export failure"}' }))
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'fixture export failure' })).toBeVisible()
      await page.unroute('**/api/projects/*/package')
      let release!: () => void
      const held = new Promise<void>((resolve) => { release = resolve })
      let exportRequests = 0
      await page.route('**/api/projects/*/package', async (route) => { exportRequests++; await held; await route.continue() })
      const downloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(() => exportRequests).toBe(1)
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await page.keyboard.press('Control+s')
      expect(exportRequests).toBe(1)
      release()
      const download = await downloadEvent
      const file = (await download.path())!
      const zip = unzipSync(await readFile(file))
      const exported = JSON.parse(strFromU8(zip['manifest.json']))
      expect(exported.candidates[0].currentRevisionId).toBe(candidate.revisionId)
      expect(exported.revisions).toHaveLength(2)
      expect(Buffer.from(zip[`volumes/${source.sourceAnatomy.volumeId}.nrrd`])).toEqual(bytes)
      await expect(page.getByRole('status').filter({ hasText: 'download started' })).toBeVisible()
      await page.getByRole('button', { name: 'Open Package', exact: true }).first().click()
      await page.getByLabel('Project package (.zip)').setInputFiles(file)
      await page.getByRole('button', { name: 'Import as new project', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'imported and opened' })).toBeVisible()
      const projects = await (await page.request.get(`${origin}/api/projects`)).json()
      expect(projects).toHaveLength(2)
      const importedId = projects.find((item: { id: string }) => item.id !== project.projectId).id
      const copy = await manifest(importedId)
      expect(copy.samples[0].id).not.toBe(source.id)
      expect(copy.samples[0].sourceAnatomy.volumeHash).toBe(source.sourceAnatomy.volumeHash)
      expect(copy.candidates[0].currentRevisionId).toBe(copy.revisions[0].id)
      expect(copy.revisions[1].pose).toEqual(pose)
      expect(copy.revisions[0].volumeId).toBe(copy.revisions[1].volumeId)
      await expect.poll(() => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas().visibleObjectIds)).toEqual([])
      await page.getByRole('button', { name: 'Show object', exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas().visibleObjectIds)).toEqual([copy.candidates[0].objectId])
      if (mode === 'built') await page.screenshot({ path: '/private/tmp/hp-package-imported.png' })
      expect(await manifest(project.projectId)).toEqual(before)
      // Invalid archive and cancellation leave the active copy and all records intact.
      await page.getByRole('button', { name: 'Open Package', exact: true }).first().click()
      await page.getByLabel('Project package (.zip)').setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('broken') })
      await page.getByRole('button', { name: 'Import as new project', exact: true }).click()
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(await manifest(importedId)).toEqual(copy)
      await backend.restart()
      expect(await manifest(importedId)).toEqual(copy)
      // A successful import followed by failed hydration is never retried or called rolled back.
      await page.route('**/api/projects/*', async (route) => {
        if (route.request().method() === 'GET' && ![project.projectId, importedId].some((id) => route.request().url().endsWith(id))) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture hydration failure"}' })
        } else await route.continue()
      })
      if (mode === 'built') await page.goto(backend.baseUrl)
      // Development proxy must follow the restarted backend's new ephemeral port.
      if (mode === 'development') {
        await page.unroute('**/api/projects/*')
        expect(errors).toEqual([])
        return
      }
      await page.getByRole('button', { name: 'Open Package', exact: true }).first().click()
      await page.getByLabel('Project package (.zip)').setInputFiles(file)
      await page.getByRole('button', { name: 'Import as new project', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'was imported, but opening' })).toBeVisible()
      expect(await (await page.request.get(`${backend.baseUrl}/api/projects`)).json()).toHaveLength(3)
      expect(await manifest(project.projectId)).toEqual(before)
      expect(errors).toEqual([])
    } finally {
      if (previousOrigin === undefined) delete process.env.HACK_API_ORIGIN
      else process.env.HACK_API_ORIGIN = previousOrigin
      await vite?.close()
      await backend.close()
    }
  })
}
