import { test, expect } from './canvas-fixture'

test('manual binary box/mirror operations commit real volumes, render, restore and preserve source', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const origin = new URL(page.url()).origin
  const projects = await (await page.request.get(`${origin}/api/projects`)).json()
  const projectId = projects[0].id
  const manifest = async () => (await page.request.get(`${origin}/api/projects/${projectId}`)).json()
  const seeded = await manifest()
  expect((await page.request.delete(`${origin}/api/samples/${seeded.samples[0].id}`)).status()).toBe(204)
  const voxels = Buffer.alloc(64)
  voxels[0 + 1 * 4 + 1 * 16] = 1
  voxels[1 + 2 * 4 + 1 * 16] = 1
  const header = Buffer.from('NRRD0005\ntype: uint8\ndimension: 3\nsizes: 4 4 4\nencoding: raw\n\n')
  const bytes = Buffer.concat([header, voxels])
  const form = new FormData()
  form.set('file', new Blob([bytes]), 'source.nrrd')
  form.set('displayName', 'Asymmetric binary fixture')
  form.set('spatiallyVerified', 'true')
  form.set('meta', JSON.stringify({ units: 'mm', space: 'left-posterior-superior', sizes: [4,4,4], spacings: [1,1,1], bboxMm: [4,4,4] }))
  expect((await fetch(`${origin}/api/projects/${projectId}/cases/${seeded.cases[0].id}/samples`, { method: 'POST', body: form })).status).toBe(201)
  await page.reload()
  await page.getByRole('button', { name: 'Open', exact: true }).first().click()
  await page.getByTitle('Create new candidate implant').click()
  const before = await manifest(), candidate = before.candidates[0]
  const runtime = () => page.evaluate(() => window.__hackPrincetonDebug!.readCanvas())
  await expect.poll(async () => (await runtime()).visibleObjectIds).toEqual([candidate.objectId])
  const canvas = page.locator('[data-testid="viewport"] canvas')
  const initial = await canvas.screenshot()
  const setBounds = async (low: number[], high: number[]) => {
    for (const [side, values] of [['Minimum', low], ['Maximum', high]] as const) {
      for (const [index, axis] of ['I','J','K'].entries()) await page.getByLabel(`${side} ${axis}`, { exact: true }).fill(String(values[index]))
    }
  }
  await setBounds([1,1,1], [1,1,1])
  await page.route('**/voxel-operation', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"controlled voxel outage"}' }))
  await page.getByRole('button', { name: 'Commit voxel revision' }).click()
  await expect(page.getByText(/controlled voxel outage/)).toBeVisible()
  expect((await manifest()).revisions).toHaveLength(1)
  await page.unroute('**/voxel-operation')
  await page.getByRole('button', { name: 'Commit voxel revision' }).click()
  await expect.poll(async () => (await manifest()).revisions.length).toBe(2)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  const edited = await manifest(), revision = edited.revisions[1]
  const newBytes = await (await page.request.get(`${origin}/api/candidates/${candidate.objectId}/revisions/${revision.id}/volume`)).body()
  const expected = Buffer.from(bytes); expected[header.length + 1 + 1 * 4 + 1 * 16] = 1
  expect(newBytes).toEqual(expected)
  await expect.poll(async () => (await runtime()).visibleObjectIds).toEqual([candidate.objectId])
  expect(await canvas.screenshot()).not.toEqual(initial)
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click()
  await expect.poll(async () => (await manifest()).candidates[0].currentRevisionId).toBe(before.revisions[0].id)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.getByLabel('Voxel operation', { exact: true }).selectOption('mirror')
  await setBounds([2,1,1], [3,2,1])
  await page.getByLabel('Mirror I-plane').fill('1.5')
  await page.getByRole('button', { name: 'Commit voxel revision' }).click()
  await expect.poll(async () => (await manifest()).revisions.length).toBe(3)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  const completed = await manifest(), mirror = completed.revisions[2]
  expect(mirror.provenance.operation).toBe('reconstruct.mirror-roi')
  expect(mirror.provenance.changedVoxels).toBe(2)
  expect(completed.samples).toEqual(before.samples)
  expect(await (await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)).body()).toEqual(bytes)
  const reflected = Buffer.from(bytes)
  reflected[header.length + 3 + 1 * 4 + 1 * 16] = 1
  reflected[header.length + 2 + 2 * 4 + 1 * 16] = 1
  expect(await (await page.request.get(`${origin}/api/candidates/${candidate.objectId}/revisions/${mirror.id}/volume`)).body()).toEqual(reflected)
  await expect.poll(async () => (await runtime()).visibleObjectIds).toEqual([candidate.objectId])
  await page.screenshot({ path: '/private/tmp/hp-mechanics-voxel-mirror.png' })
  expect(errors).toEqual([])
})
