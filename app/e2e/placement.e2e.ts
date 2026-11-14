import { test, expect } from './canvas-fixture'
import type { ProjectManifest } from '../src/io/projectPackage'

test('manual numeric placement previews, cancels, commits and restores real geometry poses', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Open$/ }).first().click()
  await page.getByTitle('Create new candidate implant').click()
  await expect(page.getByRole('toolbar', { name: 'Interaction modes' })).toBeVisible()
  const origin = new URL(page.url()).origin
  const projects = await (await page.request.get(`${origin}/api/projects`)).json()
  const manifest = async (): Promise<ProjectManifest> => (await page.request.get(`${origin}/api/projects/${projects[0].id}`)).json()
  const before = await manifest()
  const candidate = before.candidates[0]
  const bytes = await (await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)).body()
  const runtime = () => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas())
  await expect.poll(async () => Object.keys((await runtime()).objectWorldMatrices).length).toBe(1)
  const initialMatrix = (await runtime()).objectWorldMatrices[candidate.objectId]
  const cameraBefore = (await runtime()).camera
  const start = async () => {
    await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
    await page.getByRole('button', { name: /^Transform Tool/ }).click()
    await expect(page.getByLabel('Translate X (mm)')).toBeVisible()
  }
  await start()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByLabel('Translate X (mm)').fill('12')
  await page.getByLabel('Rotate Z (degrees)').fill('90')
  await expect.poll(async () => (await runtime()).objectWorldMatrices[candidate.objectId][12]).toBeCloseTo(12)
  const preview = (await runtime()).objectWorldMatrices[candidate.objectId]
  expect(preview[1]).toBeCloseTo(1)
  expect(preview[4]).toBeCloseTo(-1)
  const cameraAfter = (await runtime()).camera
  cameraAfter.position.forEach((value, index) => expect(value).toBeCloseTo(cameraBefore.position[index], 8))
  cameraAfter.target.forEach((value, index) => expect(value).toBeCloseTo(cameraBefore.target[index], 8))
  expect(cameraAfter.projection).toBe(cameraBefore.projection)
  expect(await manifest()).toEqual(before)
  await page.screenshot({ path: '/private/tmp/hp-manual-placement-preview.png' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(async () => (await runtime()).objectWorldMatrices[candidate.objectId]).toEqual(initialMatrix)
  expect(await manifest()).toEqual(before)
  await start()
  await page.getByLabel('Translate X (mm)').fill('7')
  await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
  await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
  await expect(page.getByLabel('Translate X (mm)')).toHaveCount(0)
  await start()
  await page.getByLabel('Translate X (mm)').fill('')
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByLabel('Translate X (mm)').fill('12')
  await page.getByLabel('Rotate Z (degrees)').fill('90')
  await page.route('**/api/candidates/*/placement', (route) => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: 'Controlled test outage' }) }))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  expect(await manifest()).toEqual(before)
  await expect(page.getByLabel('Translate X (mm)')).toHaveValue('12')
  await page.unroute('**/api/candidates/*/placement')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(async () => (await manifest()).revisions.length).toBe(2)
  const after = await manifest()
  expect(after.revisions[0]).toEqual(before.revisions[0])
  const saved = after.revisions.find((revision) => revision.id === after.candidates[0].currentRevisionId)!
  expect(saved.pose[3]).toBeCloseTo(12)
  expect(saved.pose[1]).toBeCloseTo(-1)
  expect(saved.pose[4]).toBeCloseTo(1)
  expect(saved.volumeHash).toBe(before.revisions[0].volumeHash)
  await expect.poll(async () => (await runtime()).objectWorldMatrices[candidate.objectId][1]).toBeCloseTo(1)
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByRole('button', { name: /^Restore Revision/ }).click()
  await expect.poll(async () => (await manifest()).candidates[0].currentRevisionId).toBe(before.revisions[0].id)
  await expect.poll(async () => (await runtime()).objectWorldMatrices[candidate.objectId]).toEqual(initialMatrix)
  expect(await (await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)).body()).toEqual(bytes)
})
