// Operator-invoked, non-destructive workflow on the explicitly selected running app.
// This retains the labeled verification project instead of deleting live records.
import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const origin = process.env.HACK_CUTOVER_ORIGIN
const projectName = process.env.HACK_CUTOVER_PROJECT
const evidence = process.env.HACK_CUTOVER_EVIDENCE
if (!origin || !projectName || !evidence) throw new Error('Explicit origin, project name and evidence path are required')
const browser = await chromium.launch({ channel: process.env.HACK_BROWSER_CHANNEL ?? 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await page.getByRole('button', { name: projectName, exact: true }).first().click()
  await page.getByRole('button', { name: 'New Case', exact: true }).click()
  await page.getByLabel('Case Name / Identifier').fill('Cutover validation — retained verification data')
  await page.getByRole('button', { name: 'Create Case', exact: true }).click()
  await expect(page.getByText('Cutover validation — retained verification data', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Import Sample', exact: true }).first().click()
  await page.getByRole('dialog').getByRole('radio').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Import Sample', exact: true }).click()
  await expect.poll(async () => {
    const projects = await (await page.request.get(`${origin}/api/projects`)).json()
    const project = projects.find((item) => item.name === projectName)
    const manifest = await (await page.request.get(`${origin}/api/projects/${project.id}`)).json()
    return manifest.samples.length
  }, { timeout: 15000 }).toBe(1)
  await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
  await page.getByTitle('Create new candidate implant').click()
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Transform Tool/ })).toBeEnabled()
  await page.getByRole('button', { name: /^Transform Tool/ }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  const projects = await (await page.request.get(`${origin}/api/projects`)).json()
  const project = projects.find((item) => item.name === projectName)
  await expect.poll(async () => {
    const state = await (await page.request.get(`${origin}/api/projects/${project.id}`)).json()
    return state.revisions.length
  }).toBe(2)
  await page.getByRole('button', { name: 'Cases & Anatomy', exact: true }).click()
  await page.getByRole('button', { name: 'Edit 3D', exact: true }).click()
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByRole('button', { name: /^Restore Revision/ }).click()
  await expect.poll(async () => {
    const state = await (await page.request.get(`${origin}/api/projects/${project.id}`)).json()
    return state.candidates[0].currentRevisionId === state.revisions[0].id
  }).toBe(true)
  const before = await (await page.request.get(`${origin}/api/projects/${project.id}`)).json()
  const download = await page.request.get(`${origin}/api/samples/${before.samples[0].id}/volume`)
  expect(download.status()).toBe(200)
  expect(createHash('sha256').update(await download.body()).digest('hex')).toBe(before.samples[0].sourceAnatomy.volumeHash)
  await page.reload()
  await page.getByRole('button', { name: projectName, exact: true }).first().click()
  expect(await (await page.request.get(`${origin}/api/projects/${project.id}`)).json()).toEqual(before)
  expect(errors).toEqual([])
  await writeFile(evidence, JSON.stringify({ at: new Date().toISOString(), origin, projectId: project.id,
    workflow: 'project→case→prepared import→candidate→transform→restore→reload',
    manifest: before, browserErrors: errors, passed: true }, null, 2))
  console.log('Live cutover browser workflow passed; verification records retained')
} finally { await browser.close() }
