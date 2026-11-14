import { expect, type Page, test } from '@playwright/test'

async function openCanvas(page: Page) {
  await page.goto('/')
  const openProject = page.getByRole('button', { name: /^Open$/ }).first()
  if (await openProject.count()) await openProject.click()

  const open3d = page.getByRole('button', { name: /Open 3D/i }).first()
  if (await open3d.count()) {
    await open3d.click()
  } else {
    await page.getByRole('button', { name: '3D Studio Canvas' }).click()
  }

  await expect(page.getByRole('toolbar', { name: 'Interaction modes' })).toBeVisible()
  await expect(page.getByRole('region', { name: '3D view' })).toBeVisible()
  await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()
  await expect(page.getByLabel('Axial anatomy slice')).toBeVisible({ timeout: 60_000 })
}

test('Slicer-standard canvas controls change rendered state without mutating anatomy', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await openCanvas(page)

  await expect(page.getByRole('region', { name: 'Synchronized slice dock' })).toBeVisible()

  const stateBefore = await page.evaluate(() => window.__hackPrincetonDebug?.readState())
  const runtimeBefore = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
  expect(runtimeBefore?.webglStatus).toBe('ready')

  await page.getByRole('button', { name: 'Anterior view' }).click()
  await expect
    .poll(async () => {
      const runtime = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
      return runtime?.lastAction?.id
    })
    .toBe('view.anterior')

  await page.getByRole('button', { name: /Orthographic projection/i }).click()
  await expect
    .poll(async () => {
      const runtime = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
      return runtime?.camera.projection
    })
    .toBe('orthographic')

  await page.getByRole('button', { name: /Show crosshair/i }).click()
  await page.getByLabel('Axial slice offset').fill('10')
  await expect
    .poll(async () => {
      const runtime = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
      return runtime?.crosshairRas[2]
    })
    .not.toBe(runtimeBefore?.crosshairRas[2])

  await page.getByRole('button', { name: /Window \/ Level mode/i }).click()
  const axialSlice = page.getByLabel('Axial anatomy slice')
  const sliceBox = await axialSlice.boundingBox()
  if (!sliceBox) throw new Error('Axial slice has no render box')
  await page.mouse.move(sliceBox.x + sliceBox.width / 2, sliceBox.y + sliceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sliceBox.x + sliceBox.width / 2 + 20, sliceBox.y + sliceBox.height / 2 + 12)
  await page.mouse.up()

  await page.getByRole('button', { name: /Place mode/i }).click()
  await page.mouse.click(sliceBox.x + sliceBox.width * 0.6, sliceBox.y + sliceBox.height * 0.4)
  await expect(page.getByRole('button', { name: /View mode/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const stateAfter = await page.evaluate(() => window.__hackPrincetonDebug?.readState())
  expect(stateAfter?.revisions).toEqual(stateBefore?.revisions)
  expect(stateAfter?.samples).toEqual(stateBefore?.samples)
  expect(browserErrors).toEqual([])
})

test('WebGL context loss is surfaced and restored via Rebuild view', async ({ page }) => {
  await openCanvas(page)
  const canvas = page.locator('[data-testid="viewport"] canvas')
  await expect(canvas).toBeVisible()

  const extensionAvailable = await canvas.evaluate((element) => {
    const gl =
      (element as HTMLCanvasElement).getContext('webgl2') ??
      (element as HTMLCanvasElement).getContext('webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    extension?.loseContext()
    return Boolean(extension)
  })
  test.skip(!extensionAvailable, 'WEBGL_lose_context is unavailable')

  await expect(page.getByText('Rendering interrupted')).toBeVisible()
  await expect
    .poll(async () => {
      const runtime = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
      return runtime?.webglStatus
    })
    .toBe('lost')

  await page.getByRole('button', { name: 'Rebuild view' }).click()
  await expect(page.getByText('Rendering interrupted')).toHaveCount(0)
  await expect
    .poll(async () => {
      const runtime = await page.evaluate(() => window.__hackPrincetonDebug?.readCanvas())
      return runtime?.webglStatus
    })
    .toBe('ready')
})
