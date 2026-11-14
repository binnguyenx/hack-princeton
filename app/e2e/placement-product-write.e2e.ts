import { test, expect } from './canvas-fixture'

test('canvas Apply posts placement only, not legacy transform', async ({ page }) => {
  const placementUrls: string[] = []
  const transformUrls: string[] = []
  await page.route('**/api/candidates/*/placement', async (route) => {
    placementUrls.push(route.request().url())
    await route.continue()
  })
  await page.route('**/api/candidates/*/transform', async (route) => {
    transformUrls.push(route.request().url())
    await route.continue()
  })

  await page.goto('/')
  await page.getByRole('button', { name: /^Open$/ }).first().click()
  await page.getByTitle('Create new candidate implant').click()
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByRole('button', { name: /^Transform Tool/ }).click()
  await page.getByLabel('Translate X (mm)').fill('5')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(() => placementUrls.length).toBeGreaterThan(0)
  expect(transformUrls).toEqual([])
})