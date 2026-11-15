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

async function getRevisionId(page: Page): Promise<string> {
  const revId = await page.evaluate(() => {
    const dbg = window.__hackPrincetonDebug
    const st = dbg?.readState()
    const state =
      st && 'ok' in st && st.ok
        ? st.value
        : (st as { value?: { candidates: Array<{ currentRevisionId: string }> } })?.value
    return state?.candidates[0]?.currentRevisionId ?? null
  })
  expect(revId).toBeTruthy()
  return revId!
}

async function postAnnotation(
  page: Page,
  revisionId: string,
  fields: {
    type: string
    name: string
    points: RasPoint[]
    meta?: Record<string, unknown>
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

/** Re-open canvas so App loadProject pulls annotations from the manifest into UI state. */
async function reopenWithAnnotations(page: Page) {
  await openCandidateCanvas(page)
}

async function ensureCandidateSelected(page: Page) {
  await page.evaluate(() => {
    const dbg = window.__hackPrincetonDebug
    if (!dbg) throw new Error('debug bridge missing')
    const st = dbg.readState()
    const state =
      st && typeof st === 'object' && 'ok' in st && st.ok
        ? st.value
        : (st as { value?: { candidates: Array<{ objectId: string }> } })?.value
    const cand = state?.candidates[0]
    if (!cand) throw new Error('no candidate')
    dbg.ops.openDocument(dbg.ctx, { kind: 'candidate', id: cand.objectId })
    dbg.ops.selectObject(dbg.ctx, cand.objectId)
  })
  await page.getByRole('button', { name: /View mode/i }).click()
  await page.getByRole('button', { name: /Place mode/i }).click()
  await page.getByRole('button', { name: /View mode/i }).click()
}

function expectedAngleDegrees(a: RasPoint, b: RasPoint, c: RasPoint): number {
  const ab = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const cb = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
  const abLen = Math.hypot(ab[0], ab[1], ab[2])
  const cbLen = Math.hypot(cb[0], cb[1], cb[2])
  const dot = ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]
  const cos = Math.min(1, Math.max(-1, dot / (abLen * cbLen)))
  return (Math.acos(cos) * 180) / Math.PI
}

function openCurveLength(pts: RasPoint[]): number {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  return total
}

test.describe('annotation phase 2 (S14–S21)', () => {
  test('S14 angle degree matches acos(dot(norm(A−B), norm(C−B))) × (180/π)', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const A: RasPoint = [1, 0, 0]
    const B: RasPoint = [0, 0, 0]
    const C: RasPoint = [0, 1, 0]
    const expected = expectedAngleDegrees(A, B, C)

    const created = await postAnnotation(page, revisionId, {
      type: 'angle',
      name: 'Angle ABC',
      points: [A, B, C],
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible({ timeout: 15_000 })
    const measure = row.locator('.annotation-row__measure')
    await expect(measure).toContainText(`${expected.toFixed(1)}°`)
    const parsed = Number.parseFloat(await measure.innerText())
    expect(Math.abs(parsed - expected)).toBeLessThanOrEqual(0.1)
  })

  test('S15 plane Show in slice dock adds orientation; closing leaves plane', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const planeName = `Inspect Plane ${Date.now()}`
    const created = await postAnnotation(page, revisionId, {
      type: 'plane',
      name: planeName,
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      meta: { method: 'point-normal', sliceDockActive: false },
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible()
    await row.locator('.annotation-row__header').click()

    const toggle = row.getByRole('checkbox', { name: 'Show in slice dock' })
    await expect(toggle).toBeVisible()
    // Controlled checkbox: click then wait for meta/API round-trip.
    await toggle.click()

    await expect
      .poll(async () => {
        return page.evaluate((id) => {
          const dbg = window.__hackPrincetonDebug
          const st = dbg?.readState()
          const state =
            st && 'ok' in st && st.ok
              ? st.value
              : (st as {
                  value?: {
                    view?: { inspectionPlane?: { enabled: boolean } }
                    annotations?: Array<{
                      id: string
                      meta?: { sliceDockActive?: boolean }
                    }>
                  }
                })?.value
          const planeOn = Boolean(state?.view?.inspectionPlane?.enabled)
          const metaOn = Boolean(
            state?.annotations?.find((a) => a.id === id)?.meta?.sliceDockActive,
          )
          return planeOn || metaOn
        }, created.id)
      })
      .toBe(true)

    await expect(page.getByRole('region', { name: 'Synchronized slice dock' })).toBeVisible()

    // Closing the driven slice (uncheck) must leave the plane annotation.
    if (await toggle.isChecked()) await toggle.click()
    await expect(page.getByTestId(`ann-row-${created.id}`)).toBeVisible()
    await expect(
      page.getByTestId(`ann-row-${created.id}`).locator('.annotation-row__name'),
    ).toHaveText(planeName)
  })

  test('S16 open curve length equals sum of consecutive segments (no close)', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const points: RasPoint[] = [
      [0, 0, 0],
      [3, 0, 0],
      [3, 4, 0],
      [3, 4, 12],
      [3, 10, 12],
    ]
    const expected = openCurveLength(points)
    const created = await postAnnotation(page, revisionId, {
      type: 'open_curve',
      name: 'Open Path',
      points,
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible()
    const measure = row.locator('.annotation-row__measure')
    await expect(measure).toContainText(`${expected.toFixed(2)} mm`)
    const parsed = Number.parseFloat(await measure.innerText())
    expect(Math.abs(parsed - expected)).toBeLessThanOrEqual(0.01)
  })

  test('S17 ROI volume equals product of edge lengths after resize', async ({ page }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const created = await postAnnotation(page, revisionId, {
      type: 'roi',
      name: 'ROI Box',
      points: [
        [0, 0, 0],
        [2, 2, 2],
      ],
      meta: { min: [0, 0, 0], max: [2, 2, 2] },
    })
    await patchAnnotation(page, created.id, {
      points: [
        [0, 0, 0],
        [3, 4, 5],
      ],
      meta: { min: [0, 0, 0], max: [3, 4, 5] },
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible()
    const measure = row.locator('.annotation-row__measure')
    await expect(measure).toContainText('60.0 mm³')
    const parsed = Number.parseFloat(await measure.innerText())
    expect(Math.abs(parsed - 60)).toBeLessThanOrEqual(0.1)
  })

  test('S18 highlight Clear removes strokes; row remains for repaint', async ({ page }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const indices = Array.from({ length: 10 }, (_, i) => i)
    const paintName = `Paint Zone ${Date.now()}`
    const created = await postAnnotation(page, revisionId, {
      type: 'highlight',
      name: paintName,
      points: [[0, 0, 0]],
      meta: { color: 'accent', triangleIndices: indices },
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible()
    await expect(row.locator('.annotation-row__measure')).toContainText('10 triangles')
    await row.locator('.annotation-row__header').click()
    await row.getByRole('button', { name: 'Clear' }).click()

    await expect
      .poll(async () => {
        return page.evaluate((id) => {
          const dbg = window.__hackPrincetonDebug
          const st = dbg?.readState()
          const state =
            st && 'ok' in st && st.ok
              ? st.value
              : (st as {
                  value?: {
                    annotations: Array<{ id: string; meta: { triangleIndices?: number[] } }>
                  }
                })?.value
          const ann = state?.annotations.find((a) => a.id === id)
          return (ann?.meta.triangleIndices ?? []).length
        }, created.id)
      })
      .toBe(0)

    const clearedRow = page.getByTestId(`ann-row-${created.id}`)
    await expect(clearedRow).toBeVisible()
    await expect(clearedRow.locator('.annotation-row__name')).toHaveText(paintName)
    await expect(clearedRow.locator('.annotation-row__measure')).toContainText('0 triangles')
  })

  test('S19 Surface Highlight disabled with reason when no display mesh', async ({
    page,
  }) => {
    // Block mesh assets + volume bytes so rebuild cannot produce a display mesh.
    await page.route('**/*.{glb,gltf}', (route) => route.abort())
    await page.route('**/api/samples/*/volume', (route) => route.abort())
    await page.route('**/api/volumes/**', (route) => route.abort())

    await openCandidateCanvas(page)
    await ensureCandidateSelected(page)
    await page.getByRole('button', { name: /Place mode/i }).click()

    const highlight = page
      .getByRole('toolbar', { name: 'Annotation types' })
      .getByRole('button', { name: 'Surface Highlight', exact: true })
    await expect(highlight).toBeVisible({ timeout: 15_000 })
    await expect(highlight).toBeDisabled()
    await expect(highlight).toHaveAttribute('title', /Requires candidate mesh/i)
  })

  test('S20 Place types listed (no Landmark/Angle) with type and measurement', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    await ensureCandidateSelected(page)
    await page.getByRole('button', { name: /Place mode/i }).click()

    const typeNames = [
      'Text Note',
      'Distance Line',
      'Closed Curve',
      'Plane',
      'Open Curve',
      'ROI',
      'Surface Highlight',
    ]
    const typeToolbar = page.getByRole('toolbar', { name: 'Annotation types' })
    for (const name of typeNames) {
      await expect(
        typeToolbar.getByRole('button', { name, exact: true }),
      ).toBeVisible()
    }
    await expect(
      typeToolbar.getByRole('button', { name: 'Angle', exact: true }),
    ).toHaveCount(0)

    const revisionId = await getRevisionId(page)
    const run = `S20-${Date.now()}`
    const specs: Array<{
      type: string
      name: string
      points: RasPoint[]
      meta?: Record<string, unknown>
    }> = [
      {
        type: 'line',
        name: `${run}-Line`,
        points: [
          [0, 0, 0],
          [10, 0, 0],
        ],
      },
      {
        type: 'closed_curve',
        name: `${run}-Closed`,
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
      {
        type: 'text_note',
        name: `${run}-Note`,
        points: [[0, 0, 1]],
        meta: { body: 'check rim' },
      },
      {
        type: 'angle',
        name: `${run}-Angle`,
        points: [
          [1, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
        ],
      },
      {
        type: 'plane',
        name: `${run}-Plane`,
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        meta: { method: 'point-normal', sliceDockActive: false },
      },
      {
        type: 'open_curve',
        name: `${run}-Open`,
        points: [
          [0, 0, 0],
          [2, 0, 0],
          [2, 2, 0],
        ],
      },
      {
        type: 'roi',
        name: `${run}-ROI`,
        points: [
          [0, 0, 0],
          [1, 1, 1],
        ],
        meta: { min: [0, 0, 0], max: [1, 1, 1] },
      },
      {
        type: 'highlight',
        name: `${run}-Highlight`,
        points: [[0, 0, 0]],
        meta: { color: 'accent', triangleIndices: [0, 1, 2] },
      },
    ]

    const createdIds: string[] = []
    for (const spec of specs) {
      const created = await postAnnotation(page, revisionId, spec)
      createdIds.push(created.id)
    }
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)
    await page.getByRole('button', { name: /Place mode/i }).click()

    const typeToolbarAfter = page.getByRole('toolbar', { name: 'Annotation types' })
    for (const name of typeNames) {
      await expect(
        typeToolbarAfter.getByRole('button', { name, exact: true }),
      ).toBeVisible()
    }

    const list = page.locator('.annotation-list[aria-label="Annotations"]')
    await expect(list).toBeVisible()

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      const row = page.getByTestId(`ann-row-${createdIds[i]}`)
      await expect(row).toBeVisible()
      await expect(row.locator('.annotation-row__type')).toHaveText(spec.type)
      await expect(row.locator('.annotation-row__name')).toHaveText(spec.name)
      await expect(row.locator('.annotation-row__measure')).not.toHaveText('')
      await expect(row.getByLabel('Delete annotation')).toBeVisible()
    }
  })

  test('S21 stale highlight indices show warning and skip overlay', async ({ page }) => {
    await openCandidateCanvas(page)
    const revisionId = await getRevisionId(page)
    const created = await postAnnotation(page, revisionId, {
      type: 'highlight',
      name: 'Stale Paint',
      points: [[0, 0, 0]],
      meta: { color: 'accent', triangleIndices: [999_999] },
    })
    await reopenWithAnnotations(page)
    await ensureCandidateSelected(page)

    const row = page.getByTestId(`ann-row-${created.id}`)
    await expect(row).toBeVisible()
    await row.locator('.annotation-row__header').click()
    await expect(page.locator('.annotation-stale-warning')).toContainText(
      /stale mesh|repaint required/i,
    )
  })
})
