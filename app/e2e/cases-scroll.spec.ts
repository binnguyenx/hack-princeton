import { expect, test } from '@playwright/test'

test('Cases & Anatomy asset list scrolls when content overflows', async ({
  page,
}) => {
  await page.goto('/')
  const openProject = page.getByRole('button', { name: /^Open$/ }).first()
  if (await openProject.count()) await openProject.click()

  await expect(page.getByRole('tab', { name: 'Cases & Anatomy' })).toBeVisible()

  const scrollRegion = page.locator('.tab-content')
  await expect(scrollRegion).toBeVisible()

  const metrics = await scrollRegion.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
  }))

  expect(
    metrics.overflowY === 'auto' || metrics.overflowY === 'scroll',
    `tab-content overflow-y should scroll, got ${metrics.overflowY}`,
  ).toBe(true)

  // With many assets the region must be able to scroll; with few, at least
  // the scroll container must not clip without a scrollport.
  if (metrics.scrollHeight > metrics.clientHeight + 1) {
    await scrollRegion.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect
      .poll(async () => scrollRegion.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)
  } else {
    // Still prove the element is a scrollport (not overflow:hidden parent).
    expect(metrics.clientHeight).toBeGreaterThan(0)
  }
})
