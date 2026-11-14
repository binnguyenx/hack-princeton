import { test, expect } from './canvas-fixture'
import type { Page } from '@playwright/test'
import type { ProjectManifest } from '../src/io/projectPackage'

const runtime = (page: Page) => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas())
const state = (page: Page) => page.evaluate(() => {
  const result = window.__hackPrincetonDebug!.readState()
  if (!result.ok || !result.value) throw new Error('No application state')
  return { selection: result.value.view.selectionObjectId, visibility: result.value.view.visibility,
    samples: result.value.samples, candidates: result.value.candidates, revisions: result.value.revisions, dirty: result.value.dirty }
})
async function clickAt(page: Page, x = .5, y = .5) {
  const canvas = page.locator('[data-testid="viewport"] canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('No rendered canvas')
  await canvas.click({ position: { x: box.width * x, y: box.height * y } })
}
async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Open$/ }).first().click()
  await page.getByRole('button', { name: 'Open 3D', exact: true }).first().click()
  await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()
}

test('source object raycast, selection outline and rendered hide/show are view-only', async ({ page }) => {
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.method()) })
  await openSample(page)
  const origin = new URL(page.url()).origin
  const projects = await (await page.request.get(`${origin}/api/projects`)).json()
  const manifest = async (): Promise<ProjectManifest> => (await page.request.get(`${origin}/api/projects/${projects[0].id}`)).json()
  const before = await manifest()
  const source = before.samples[0].sourceAnatomy.objectId
  const bytes = await (await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)).body()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  const matrix = (await runtime(page)).objectWorldMatrices[source]
  const dirty = (await state(page)).dirty
  await page.keyboard.press('v')
  const unselected = await page.locator('[data-testid="viewport"] canvas').screenshot()
  await clickAt(page)
  await expect.poll(async () => (await state(page)).selection).toBe(source)
  await expect.poll(async () => (await runtime(page)).highlightedObjectIds).toEqual([source])
  expect(await page.locator('[data-testid="viewport"] canvas').screenshot()).not.toEqual(unselected)
  await page.screenshot({ path: '/private/tmp/hp-select-visible.png' })
  await clickAt(page, .02, .02)
  await expect.poll(async () => (await state(page)).selection).toBeNull()
  await expect.poll(async () => (await runtime(page)).highlightedObjectIds).toEqual([])
  const canvas = page.locator('[data-testid="viewport"] canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 4 })
  await page.mouse.up()
  expect((await state(page)).selection).toBeNull()
  await page.getByRole('button', { name: 'Reset 3D view' }).click()
  await page.keyboard.down('Control')
  await clickAt(page)
  await page.keyboard.up('Control')
  expect((await state(page)).selection).toBeNull()
  await page.getByRole('button', { name: 'Orthographic projection' }).click()
  await clickAt(page)
  await expect.poll(async () => (await state(page)).selection).toBe(source)
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await state(page)).selection).toBeNull()
  await clickAt(page)
  await expect.poll(async () => (await state(page)).selection).toBe(source)
  let lastCamera: number[] = []
  await expect.poll(async () => {
    const next = (await runtime(page)).camera.position
    const delta = lastCamera.length ? Math.max(...next.map((value, index) => Math.abs(value - lastCamera[index]))) : Infinity
    lastCamera = next
    return delta
  }).toBeLessThan(1e-9)
  const camera = (await runtime(page)).camera
  await page.keyboard.press('h')
  await expect(page.getByRole('button', { name: 'Show object', exact: true })).toBeVisible()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([])
  expect((await state(page)).selection).toBeNull()
  expect((await runtime(page)).highlightedObjectIds).toEqual([])
  expect((await runtime(page)).objectWorldMatrices[source]).toEqual(matrix)
  const hiddenCamera = (await runtime(page)).camera
  hiddenCamera.position.forEach((v, i) => expect(v).toBeCloseTo(camera.position[i], 8))
  const rejected = await page.evaluate((id) => {
    const debug = window.__hackPrincetonDebug!
    return debug.ops.selectObject(debug.ctx, id)
  }, source)
  expect(rejected.ok).toBe(false)
  await page.screenshot({ path: '/private/tmp/hp-object-hidden.png' })
  await page.getByRole('button', { name: 'Show object', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  expect((await runtime(page)).objectWorldMatrices[source]).toEqual(matrix)
  await page.getByRole('button', { name: 'Hide active object' }).click()
  await page.getByRole('button', { name: 'Show all objects', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  expect((await state(page)).dirty).toBe(dirty)
  expect(await manifest()).toEqual(before)
  expect(await (await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)).body()).toEqual(bytes)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('candidate/source tabs preserve visibility, clear stale selection and share debug view ops', async ({ page, canvasApp }) => {
  const projects = await (await page.request.get(`${canvasApp}/api/projects`)).json()
  const read = async (): Promise<ProjectManifest> => (await page.request.get(`${canvasApp}/api/projects/${projects[0].id}`)).json()
  const seed = await read()
  const created = await page.request.post(`${canvasApp}/api/samples/${seed.samples[0].id}/candidates`, { data: {} })
  expect(created.status()).toBe(201)
  const { candidateId } = await created.json()
  const before = await read()
  const source = before.samples[0].sourceAnatomy.objectId
  await openSample(page)
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  await clickAt(page)
  await expect.poll(async () => (await state(page)).selection).toBe(source)
  await page.getByRole('button', { name: 'Hide active object' }).click()
  await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
  await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([candidateId])
  expect((await state(page)).selection).toBeNull()
  await page.keyboard.press('v')
  await clickAt(page)
  await expect.poll(async () => (await state(page)).selection).toBe(candidateId)
  await expect.poll(async () => (await runtime(page)).highlightedObjectIds).toEqual([candidateId])
  const rebuild = await page.locator('[data-testid="viewport"] canvas').evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!
    const extension = gl.getExtension('WEBGL_lose_context')
    extension?.loseContext()
    return Boolean(extension)
  })
  expect(rebuild).toBe(true)
  await expect(page.getByText('Rendering interrupted')).toBeVisible()
  await page.getByRole('button', { name: 'Rebuild view' }).click()
  await expect.poll(async () => (await runtime(page)).webglStatus).toBe('ready')
  await expect.poll(async () => (await runtime(page)).highlightedObjectIds).toEqual([candidateId])
  // Debug uses the same view ops and notifies the UI; it performs no HTTP mutation.
  await page.evaluate((id) => { const d = window.__hackPrincetonDebug!; d.ops.setVisibility(d.ctx, id, false) }, candidateId)
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([])
  await page.getByRole('tablist', { name: 'Open documents' }).getByRole('button', { name: 'skullbreak-000-parietotemporal-complete', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show object', exact: true })).toBeVisible()
  expect((await state(page)).selection).toBeNull()
  await page.getByRole('button', { name: 'Show all objects', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  await page.getByRole('tablist', { name: 'Open documents' }).getByRole('button', { name: candidateId, exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([candidateId])
  // Keep a real pointer gesture open while a tab command installs another mesh.
  const tabs = page.getByRole('tablist', { name: 'Open documents' })
  await tabs.getByRole('button', { name: 'skullbreak-000-parietotemporal-complete', exact: true }).click()
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([source])
  await page.keyboard.press('v')
  const canvas = page.locator('[data-testid="viewport"] canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await tabs.getByRole('button', { name: candidateId, exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect.poll(async () => (await runtime(page)).visibleObjectIds).toEqual([candidateId])
  await page.mouse.up()
  expect((await state(page)).selection).toBeNull()
  expect((await runtime(page)).highlightedObjectIds).toEqual([])
  const next = (await canvas.boundingBox())!
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2)
  await page.mouse.down()
  await canvas.dispatchEvent('pointercancel', { pointerId: 1, button: 0 })
  await page.mouse.up()
  expect((await state(page)).selection).toBeNull()
  expect(await read()).toEqual(before)
})
