import { expect, type Page } from '@playwright/test'
import type { CanvasRuntimeSnapshot } from '../../src/debug/bridge'
import type { CommandDef } from '../../src/commands/registry'

export async function waitForViewportReady(page: Page, timeoutMs = 60_000) {
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const dbg = window.__hackPrincetonDebug
          if (!dbg) return null
          return dbg.readCanvas()?.webglStatus ?? null
        })
      },
      { timeout: timeoutMs },
    )
    .toBe('ready')
}

export async function readCanvas(page: Page): Promise<CanvasRuntimeSnapshot | null> {
  return page.evaluate(() => window.__hackPrincetonDebug?.readCanvas() ?? null)
}

export async function listCommands(page: Page): Promise<CommandDef[]> {
  return page.evaluate(() => window.__hackPrincetonDebug?.listCommands() ?? [])
}

export async function openCandidateCanvas(page: Page) {
  await page.goto('/')

  // Wait for projects home to finish listing before clicking Open.
  await expect
    .poll(async () => page.getByRole('button', { name: /^Open$/ }).count(), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: /^Open$/ }).first().click()

  const edit3d = page.getByRole('button', { name: /Edit 3D/i }).first()
  const open3d = page.getByRole('button', { name: /Open 3D/i }).first()
  await expect
    .poll(async () => (await edit3d.count()) + (await open3d.count()), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0)
  if (await edit3d.count()) await edit3d.click()
  else await open3d.click()

  await expect(page.getByRole('toolbar', { name: 'Interaction modes' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()

  // Prefer API-backed candidate so annotation POSTs satisfy SQLite FKs.
  await page.evaluate(async () => {
    const dbg = window.__hackPrincetonDebug
    if (!dbg) throw new Error('debug bridge missing')
    const st = dbg.readState()
    const state = st && 'ok' in st && st.ok ? st.value : (st as { value?: unknown })?.value
    if (!state || typeof state !== 'object') throw new Error('no state')
    const s = state as {
      project: { id: string }
      samples: Array<{ id: string }>
      candidates: Array<{ objectId: string; currentRevisionId: string }>
    }

    if (s.candidates.length === 0) {
      const sampleId = s.samples[0]?.id
      if (!sampleId) throw new Error('no sample')
      const res = await fetch(`/api/samples/${sampleId}/candidates`, { method: 'POST' })
      if (!res.ok) {
        // Fall back to in-memory create when API route is unavailable.
        await dbg.ops.createCandidate(dbg.ctx, sampleId)
      } else {
        const created = (await res.json()) as { candidateId: string }
        const manifestRes = await fetch(`/api/projects/${s.project.id}`)
        if (!manifestRes.ok) throw new Error(await manifestRes.text())
        const manifest = await manifestRes.json()
        dbg.ctx.store.update((curr) => ({
          ...curr,
          candidates: manifest.candidates,
          revisions: manifest.revisions,
          annotations: manifest.annotations ?? [],
          samples: manifest.samples,
          cases: manifest.cases,
        }))
        dbg.ops.openDocument(dbg.ctx, { kind: 'candidate', id: created.candidateId })
        dbg.ops.selectObject(dbg.ctx, created.candidateId)
        return
      }
    }

    const nextRaw = dbg.readState()
    const next =
      nextRaw && 'ok' in nextRaw && nextRaw.ok
        ? nextRaw.value
        : (nextRaw as { value?: typeof s })?.value
    const cand = next?.candidates[0]
    if (!cand) throw new Error('no candidate after create')
    dbg.ops.openDocument(dbg.ctx, { kind: 'candidate', id: cand.objectId })
    dbg.ops.selectObject(dbg.ctx, cand.objectId)
  })

  // Nudge App tick so bridge store mutations are reflected in React.
  await page.getByRole('button', { name: /View mode/i }).click()
  await page.getByRole('button', { name: /Place mode/i }).click()
  await page.getByRole('button', { name: /View mode/i }).click()

  await waitForViewportReady(page)
}

export function toPlaywrightShortcut(shortcut: string): string {
  return shortcut
    .replace(/Mod\+/gi, process.platform === 'darwin' ? 'Meta+' : 'Control+')
    .replace(/Ctrl\+/gi, 'Control+')
    .replace(/\bEsc\b/gi, 'Escape')
    .replace(/\bBackspace\b/gi, 'Backspace')
    .replace(/\bEnter\b/gi, 'Enter')
}

export async function triggerCommandFromMenu(page: Page, cmd: CommandDef) {
  const [top] = cmd.menuPath.split('/')
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('button', {
    name: top,
    exact: true,
  }).click()
  const item = page.locator(`[data-command-id="${cmd.id}"]`)
  await expect(item).toBeVisible()
  return item
}

export async function fingerprint(page: Page) {
  return page.evaluate(() => {
    const dbg = window.__hackPrincetonDebug
    const canvas = dbg?.readCanvas()
    const state = dbg?.readState()
    const value =
      state && typeof state === 'object' && 'ok' in state && state.ok
        ? state.value
        : (state as { value?: unknown })?.value
    return {
      lastCommand: canvas?.lastCommand ?? null,
      lastAction: canvas?.lastAction ?? null,
      activeTool: canvas?.activeTool ?? null,
      mode: canvas?.mode ?? null,
      selectionObjectId: canvas?.selectionObjectId ?? null,
      visibility: canvas?.visibility ?? {},
      activeRevisionId: canvas?.activeRevisionId ?? null,
      camera: canvas?.camera ?? null,
      viewPresetAction: canvas?.lastAction?.id ?? null,
      dirty: (value as { dirty?: boolean } | undefined)?.dirty ?? null,
      commandPaletteHint: Boolean(
        document.querySelector('[role="dialog"], .command-palette'),
      ),
    }
  })
}
