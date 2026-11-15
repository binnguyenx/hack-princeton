import { expect, type Page, test } from '@playwright/test'
import { openCandidateCanvas } from './helpers/debugBridge'

type RasPoint = [number, number, number]

type Annotation = {
  id: string
  revisionId: string
  type: string
  name: string
  points: RasPoint[]
  meta: Record<string, unknown>
  locked: boolean
  visible: boolean
  createdAt: string
}

type SessionIds = {
  projectId: string
  sampleId: string
  candidateId: string
  revisionId: string
}

async function readEditorState(page: Page) {
  return page.evaluate(() => {
    const dbg = window.__hackPrincetonDebug
    if (!dbg) return null
    const st = dbg.readState()
    if (st && typeof st === 'object' && 'ok' in st && st.ok) return st.value
    return (st as { value?: unknown } | null)?.value ?? null
  })
}

async function getSessionIds(page: Page): Promise<SessionIds> {
  return page.evaluate(() => {
    const dbg = window.__hackPrincetonDebug
    if (!dbg) throw new Error('debug bridge missing')
    const st = dbg.readState()
    const state =
      st && typeof st === 'object' && 'ok' in st && st.ok
        ? st.value
        : (st as { value?: {
            project: { id: string }
            samples: Array<{ id: string }>
            candidates: Array<{ objectId: string; currentRevisionId: string }>
          } })?.value
    if (!state) throw new Error('no editor state')
    const cand = state.candidates[0]
    const sample = state.samples[0]
    if (!cand || !sample) throw new Error('missing sample/candidate')
    return {
      projectId: state.project.id,
      sampleId: sample.id,
      candidateId: cand.objectId,
      revisionId: cand.currentRevisionId,
    }
  })
}

async function postAnnotation(
  page: Page,
  revisionId: string,
  fields: {
    type: string
    name: string
    points: RasPoint[]
    meta?: Record<string, unknown>
    locked?: boolean
    visible?: boolean
  },
): Promise<Annotation> {
  return page.evaluate(
    async ({ revisionId: rev, fields: body }) => {
      const res = await fetch(`/api/revisions/${rev}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    { revisionId, fields },
  )
}

async function patchAnnotation(
  page: Page,
  id: string,
  partial: Record<string, unknown>,
): Promise<Annotation> {
  return page.evaluate(
    async ({ id: annId, partial: body }) => {
      const res = await fetch(`/api/annotations/${annId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    { id, partial },
  )
}

async function listRevisionAnnotations(page: Page, revisionId: string) {
  return page.evaluate(async (rev) => {
    const res = await fetch(`/api/revisions/${rev}/annotations`)
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<Annotation[]>
  }, revisionId)
}

async function getProjectManifest(page: Page, projectId: string) {
  return page.evaluate(async (pid) => {
    const res = await fetch(`/api/projects/${pid}`)
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<{ annotations?: Annotation[] }>
  }, projectId)
}

async function reopenWithAnnotations(page: Page) {
  await openCandidateCanvas(page)
}

async function waitForAnnRow(page: Page, id: string) {
  const row = page.getByTestId(`ann-row-${id}`)
  await expect(row).toBeVisible({ timeout: 60_000 })
  return row
}

function euclid(a: RasPoint, b: RasPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

function closedLength(pts: RasPoint[]): number {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) total += euclid(pts[i], pts[i + 1])
  total += euclid(pts[pts.length - 1], pts[0])
  return total
}

test.describe('annotation phase 1 (S1–S13)', () => {
  test('S1 text note: Place + click → panel/API; RAS matches crosshair ≤0.1 mm', async ({
    page,
  }) => {
    await openCandidateCanvas(page)

    await page.getByRole('button', { name: /Place mode/i }).click()
    const noteBtn = page
      .getByRole('toolbar', { name: 'Annotation types' })
      .getByRole('button', { name: 'Text Note', exact: true })
    await expect(noteBtn).toBeVisible()
    if ((await noteBtn.getAttribute('aria-pressed')) !== 'true') {
      await noteBtn.click({ force: true })
    }
    await expect(noteBtn).toHaveAttribute('aria-pressed', 'true')

    const axial = page.getByLabel('Axial anatomy slice')
    await expect(axial).toBeVisible({ timeout: 60_000 })
    const box = await axial.boundingBox()
    if (!box) throw new Error('axial slice has no box')

    // Capture RAS at the moment a new landmark lands in the store (before async reload).
    const { revisionId } = await getSessionIds(page)
    const beforeApiCount = (await listRevisionAnnotations(page, revisionId)).filter(
      (a) => a.type === 'text_note',
    ).length

    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)

    // Ready placement queues on the uncommitted stack; Mod+S flushes (R78).
    await expect(page.locator('.document-taskbar__tab.is-dirty')).toBeVisible({
      timeout: 15_000,
    })

    // Crosshair RAS at the click (same IJK used for placement).
    const ras = await page.evaluate(() => {
      return window.__hackPrincetonDebug?.readCanvas()?.crosshairRas ?? null
    })
    expect(ras).toBeTruthy()

    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+s' : 'Control+s',
    )

    let persisted: Annotation | undefined
    await expect
      .poll(async () => {
        const listed = await listRevisionAnnotations(page, revisionId)
        const notes = listed.filter((a) => a.type === 'text_note')
        if (notes.length <= beforeApiCount) return false
        const sorted = [...notes].sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
        )
        persisted = sorted.find((a) => {
          const p = a.points[0]
          if (!p || !ras) return false
          return (
            Math.abs(p[0] - ras[0]) <= 0.1 &&
            Math.abs(p[1] - ras[1]) <= 0.1 &&
            Math.abs(p[2] - ras[2]) <= 0.1
          )
        })
        return Boolean(persisted)
      })
      .toBe(true)

    const pt = persisted!.points[0]
    expect(Math.abs(pt[0] - ras![0])).toBeLessThanOrEqual(0.1)
    expect(Math.abs(pt[1] - ras![1])).toBeLessThanOrEqual(0.1)
    expect(Math.abs(pt[2] - ras![2])).toBeLessThanOrEqual(0.1)

    await expect(await waitForAnnRow(page, persisted!.id)).toBeVisible()
  })

  test('S2 jump: landmark panel Jump-to updates slice crosshair RAS', async ({ page }) => {
    await openCandidateCanvas(page)
    const { revisionId } = await getSessionIds(page)
    const target: RasPoint = [12.5, -4.25, 18]
    const created = await postAnnotation(page, revisionId, {
      type: 'landmark',
      name: 'Jump Target',
      points: [target],
      meta: {},
    })
    await reopenWithAnnotations(page)

    const row = await waitForAnnRow(page, created.id)
    await row.locator('.annotation-row__header').click()
    await row.locator('button', { hasText: 'Jump to' }).click()

    await expect
      .poll(async () => {
        const ras = await page.evaluate(
          () => window.__hackPrincetonDebug?.readCanvas()?.crosshairRas ?? null,
        )
        if (!ras) return false
        // Jump converts RAS→IJK (rounded)→display; allow one voxel of slack.
        return (
          Math.abs(ras[0] - target[0]) <= 2 &&
          Math.abs(ras[1] - target[1]) <= 2 &&
          Math.abs(ras[2] - target[2]) <= 2
        )
      })
      .toBe(true)
  })

  test('S3 distance line: point update → mm agrees to 2 dp (API + panel)', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { revisionId, projectId } = await getSessionIds(page)
    const a: RasPoint = [0, 0, 0]
    const b: RasPoint = [3, 4, 0]
    const created = await postAnnotation(page, revisionId, {
      type: 'line',
      name: 'Span',
      points: [a, b],
      meta: {},
    })

    expect(euclid(a, b).toFixed(2)).toBe('5.00')

    const b2: RasPoint = [6, 8, 0]
    const updated = await patchAnnotation(page, created.id, { points: [a, b2] })
    expect(euclid(updated.points[0], updated.points[1]).toFixed(2)).toBe('10.00')

    const manifest = await getProjectManifest(page, projectId)
    const line = manifest.annotations?.find((x) => x.id === created.id)
    expect(line?.points).toEqual([a, b2])

    await reopenWithAnnotations(page)
    const row = await waitForAnnRow(page, created.id)
    await expect(row).toContainText('10.00 mm')
  })

  test('S4 closed curve: length equals polyline + closing segment ≤0.01 mm', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { revisionId } = await getSessionIds(page)
    const pts: RasPoint[] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [0, 5, 0],
    ]
    const created = await postAnnotation(page, revisionId, {
      type: 'closed_curve',
      name: 'Rim',
      points: pts,
      meta: {},
    })

    const expected = closedLength(pts)
    const listed = await listRevisionAnnotations(page, revisionId)
    const curve = listed.find((a) => a.id === created.id)
    expect(curve).toBeTruthy()
    expect(Math.abs(closedLength(curve!.points) - expected)).toBeLessThanOrEqual(0.01)

    await reopenWithAnnotations(page)
    await expect(await waitForAnnRow(page, created.id)).toContainText(
      `${expected.toFixed(2)} mm`,
    )
  })

  test('S5 text note: panel body edit truncates to 40 chars in row preview', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { revisionId, projectId } = await getSessionIds(page)
    const created = await postAnnotation(page, revisionId, {
      type: 'text_note',
      name: 'Note 1',
      points: [[1, 2, 3]],
      meta: { body: 'short' },
    })
    await reopenWithAnnotations(page)

    const row = await waitForAnnRow(page, created.id)
    await row.locator('.annotation-row__header').click()
    const longBody =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789extra_chars_here_should_truncate'
    const textarea = row.locator('textarea')
    await textarea.fill(longBody)
    await textarea.blur()

    await expect
      .poll(async () => {
        const manifest = await getProjectManifest(page, projectId)
        return String(manifest.annotations?.find((a) => a.id === created.id)?.meta?.body ?? '')
      })
      .toBe(longBody)

    await reopenWithAnnotations(page)
    const preview = `${longBody.slice(0, 40)}…`
    await expect(await waitForAnnRow(page, created.id)).toContainText(preview)
  })

  test('S6 hide: visible=false; measurement remains in panel', async ({ page }) => {
    await openCandidateCanvas(page)
    const { revisionId } = await getSessionIds(page)
    const created = await postAnnotation(page, revisionId, {
      type: 'line',
      name: 'Hide Me',
      points: [
        [0, 0, 0],
        [5, 0, 0],
      ],
      meta: {},
    })
    await reopenWithAnnotations(page)

    const row = await waitForAnnRow(page, created.id)
    await expect(row).toContainText('5.00 mm')
    await row.scrollIntoViewIfNeeded()
    await row.locator('button[aria-label="Hide annotation"]').click({ force: true })

    await expect
      .poll(async () => {
        const listed = await listRevisionAnnotations(page, revisionId)
        return listed.find((a) => a.id === created.id)?.visible
      })
      .toBe(false)

    await expect(row).toContainText('5.00 mm')
    await expect(row.locator('button[aria-label="Show annotation"]')).toBeVisible()
  })

  test('S7 lock: locked flag persists; control points unchanged', async ({ page }) => {
    await openCandidateCanvas(page)
    const { revisionId } = await getSessionIds(page)
    const pts: RasPoint[] = [
      [1, 1, 1],
      [2, 2, 2],
    ]
    const created = await postAnnotation(page, revisionId, {
      type: 'line',
      name: 'Lock Me',
      points: pts,
      meta: {},
    })
    await reopenWithAnnotations(page)

    const row = await waitForAnnRow(page, created.id)
    await row.scrollIntoViewIfNeeded()
    await row.locator('button[aria-label="Lock position"]').click({ force: true })

    await expect
      .poll(async () => {
        const listed = await listRevisionAnnotations(page, revisionId)
        return listed.find((a) => a.id === created.id)?.locked
      })
      .toBe(true)

    const locked = (await listRevisionAnnotations(page, revisionId)).find(
      (a) => a.id === created.id,
    )
    expect(locked?.points).toEqual(pts)
  })

  test('S8 persist: two annotations survive reopen; GET /api/projects/:id includes both', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { projectId, revisionId } = await getSessionIds(page)
    const a1 = await postAnnotation(page, revisionId, {
      type: 'landmark',
      name: 'Persist A',
      points: [[1, 2, 3]],
      meta: {},
    })
    const a2 = await postAnnotation(page, revisionId, {
      type: 'line',
      name: 'Persist B',
      points: [
        [0, 0, 0],
        [2, 0, 0],
      ],
      meta: {},
    })

    const manifest = await getProjectManifest(page, projectId)
    const ids = new Set((manifest.annotations ?? []).map((a) => a.id))
    expect(ids.has(a1.id)).toBe(true)
    expect(ids.has(a2.id)).toBe(true)

    await reopenWithAnnotations(page)
    const state = (await readEditorState(page)) as {
      annotations?: Annotation[]
    } | null
    const names = new Set((state?.annotations ?? []).map((a) => a.name))
    expect(names.has('Persist A')).toBe(true)
    expect(names.has('Persist B')).toBe(true)
    await expect(await waitForAnnRow(page, a1.id)).toBeVisible()
    await expect(await waitForAnnRow(page, a2.id)).toContainText('2.00 mm')
  })

  test('S9 source anatomy: Place annotation disabled; type buttons absent', async ({
    page,
  }) => {
    await openCandidateCanvas(page)

    // Return to cases and open source anatomy (not a candidate).
    await page.getByRole('button', { name: /Cases & Anatomy/i }).click()
    const open3d = page.getByRole('button', { name: /Open 3D/i }).first()
    await expect(open3d).toBeVisible({ timeout: 60_000 })
    await open3d.click()

    await expect(page.getByRole('toolbar', { name: 'Interaction modes' })).toBeVisible({
      timeout: 60_000,
    })

    await expect(page.getByRole('button', { name: 'Place annotation' })).toBeDisabled({
      timeout: 60_000,
    })
    await expect(page.getByRole('button', { name: 'Place annotation' })).toHaveAttribute(
      'title',
      /Requires active candidate/i,
    )

    await page.getByRole('button', { name: /Place mode/i }).click()
    await expect(
      page.getByRole('toolbar', { name: 'Annotation types' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('toolbar', { name: 'Annotation types' }).getByRole('button', {
        name: 'Landmark',
        exact: true,
      }),
    ).toHaveCount(0)
  })

  test('S10 Escape mid-curve: clears in-progress; existing annotations untouched', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { revisionId } = await getSessionIds(page)
    const existing = await postAnnotation(page, revisionId, {
      type: 'landmark',
      name: 'Keep Me',
      points: [[9, 9, 9]],
      meta: {},
    })
    await reopenWithAnnotations(page)
    await waitForAnnRow(page, existing.id)
    const beforeListed = await listRevisionAnnotations(page, revisionId)
    const beforeIds = new Set(beforeListed.map((a) => a.id))

    await page.getByRole('button', { name: /Place mode/i }).click()
    const curveBtn = page
      .getByRole('toolbar', { name: 'Annotation types' })
      .getByRole('button', { name: 'Closed Curve', exact: true })
    await curveBtn.click({ force: true })
    await expect(curveBtn).toHaveAttribute('aria-pressed', 'true')

    const axial = page.getByLabel('Axial anatomy slice')
    await expect(axial).toBeVisible({ timeout: 60_000 })
    const box = await axial.boundingBox()
    if (!box) throw new Error('axial slice has no box')
    // Two points = in-progress closed curve (needs ≥3 to queue); Esc discards draft.
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4)
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)

    await expect(page.getByTitle('Unsaved draft')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commit annotation' })).toHaveCount(0)

    await page.keyboard.press('Escape')

    // Escape clears the in-progress draft without writing.
    await expect(page.getByTitle('Unsaved draft')).toHaveCount(0, { timeout: 10_000 })

    const listed = await listRevisionAnnotations(page, revisionId)
    expect(listed.some((a) => a.id === existing.id)).toBe(true)
    expect(listed.map((a) => a.id).sort()).toEqual([...beforeIds].sort())
    await expect(page.getByTestId(`ann-row-${existing.id}`)).toBeVisible()
  })

  test('S11 cascade: DELETE /api/candidates/:id removes annotations', async ({ page }) => {
    await openCandidateCanvas(page)
    const { sampleId, projectId } = await getSessionIds(page)

    const createdCand = await page.evaluate(async (sid) => {
      const res = await fetch(`/api/samples/${sid}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<{ candidateId: string; revisionId: string }>
    }, sampleId)

    expect(createdCand.revisionId).toBeTruthy()

    await postAnnotation(page, createdCand.revisionId, {
      type: 'landmark',
      name: 'Cascade Cand',
      points: [[0, 0, 1]],
      meta: {},
    })

    const before = await listRevisionAnnotations(page, createdCand.revisionId)
    expect(before.length).toBeGreaterThan(0)

    const del = await page.evaluate(async (cid) => {
      const res = await fetch(`/api/candidates/${cid}`, { method: 'DELETE' })
      return res.status
    }, createdCand.candidateId)
    expect(del).toBe(204)

    const after = await page.evaluate(async (rev) => {
      const res = await fetch(`/api/revisions/${rev}/annotations`)
      if (res.status === 404) return []
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as Annotation[]
    }, createdCand.revisionId)
    expect(after).toEqual([])

    // Project manifest must not retain the deleted candidate's annotations.
    const manifest = await getProjectManifest(page, projectId)
    expect(
      (manifest.annotations ?? []).filter((a) => a.revisionId === createdCand.revisionId),
    ).toEqual([])
  })

  test('S12 cascade: DELETE /api/samples/:id removes annotations of its candidates', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { projectId } = await getSessionIds(page)

    const disposable = await page.evaluate(async (pid) => {
      const caseRes = await fetch(`/api/projects/${pid}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `e2e-cascade-${Date.now()}` }),
      })
      if (!caseRes.ok) throw new Error(await caseRes.text())
      const { caseId } = (await caseRes.json()) as { caseId: string }

      const meta = {
        units: 'mm',
        sizes: [2, 2, 2],
        spacings: [1, 1, 1],
        bboxMm: [2, 2, 2],
      }
      const fd = new FormData()
      fd.set('displayName', 'cascade-sample.nrrd')
      fd.set('spatiallyVerified', 'true')
      fd.set('meta', JSON.stringify(meta))
      fd.set(
        'file',
        new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' }),
        'cascade-sample.nrrd',
      )
      const sampleRes = await fetch(
        `/api/projects/${pid}/cases/${caseId}/samples`,
        { method: 'POST', body: fd },
      )
      if (!sampleRes.ok) throw new Error(await sampleRes.text())
      const sample = (await sampleRes.json()) as { sampleId: string }

      const candRes = await fetch(`/api/samples/${sample.sampleId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!candRes.ok) throw new Error(await candRes.text())
      const cand = (await candRes.json()) as {
        candidateId: string
        revisionId: string
      }

      const annRes = await fetch(`/api/revisions/${cand.revisionId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'landmark',
          name: 'Cascade Sample Ann',
          points: [[4, 5, 6]],
          meta: {},
        }),
      })
      if (!annRes.ok) throw new Error(await annRes.text())

      return { sampleId: sample.sampleId, revisionId: cand.revisionId }
    }, projectId)

    const before = await listRevisionAnnotations(page, disposable.revisionId)
    expect(before.length).toBeGreaterThan(0)

    const del = await page.evaluate(async (sid) => {
      const res = await fetch(`/api/samples/${sid}`, { method: 'DELETE' })
      return res.status
    }, disposable.sampleId)
    expect(del).toBe(204)

    const after = await page.evaluate(async (rev) => {
      const res = await fetch(`/api/revisions/${rev}/annotations`)
      if (res.status === 404) return []
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as Annotation[]
    }, disposable.revisionId)
    expect(after).toEqual([])
  })

  test('S13 package round-trip: ProjectManifest.annotations serialize/restore', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const { projectId, revisionId } = await getSessionIds(page)
    const created = await postAnnotation(page, revisionId, {
      type: 'closed_curve',
      name: 'Package Rim',
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
      meta: {},
    })

    const manifest = await getProjectManifest(page, projectId)
    expect(Array.isArray(manifest.annotations)).toBe(true)
    const fromManifest = manifest.annotations!.find((a) => a.id === created.id)
    expect(fromManifest).toBeTruthy()
    expect(fromManifest!.name).toBe('Package Rim')
    expect(fromManifest!.points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ])

    // Same JSON shape saveProjectPackage writes into manifest.json.
    const roundTripped = JSON.parse(
      JSON.stringify({ annotations: manifest.annotations }),
    ) as { annotations: Annotation[] }
    expect(roundTripped.annotations).toEqual(manifest.annotations)

    await reopenWithAnnotations(page)
    const state = (await readEditorState(page)) as {
      annotations?: Annotation[]
    } | null
    const restored = state?.annotations?.find((a) => a.id === created.id)
    expect(restored?.name).toBe('Package Rim')
    expect(restored?.points).toEqual(fromManifest!.points)
  })
})
