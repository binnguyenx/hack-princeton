import { expect, test } from '@playwright/test'
import {
  fingerprint,
  listCommands,
  openCandidateCanvas,
  toPlaywrightShortcut,
  triggerCommandFromMenu,
} from './helpers/debugBridge'

/**
 * Registry-driven dead-control detector.
 * Every catalog command must either:
 *  - show a disabled reason in the menu, or
 *  - leave a lastCommand fingerprint (changed / unchanged / rejected)
 * after being triggered from its menu item and (when present) shortcut.
 */
test.describe('no dead controls', () => {
  test('every command menu item is disabled with reason or mutates debug state', async ({
    page,
  }) => {
    await openCandidateCanvas(page)
    const catalog = await listCommands(page)
    expect(catalog.length).toBeGreaterThan(0)
    const commandIds = catalog.map((c) => c.id)

    async function reselectCandidate() {
      await page.evaluate(() => {
        const dbg = window.__hackPrincetonDebug
        const id = dbg?.readCanvas().activeCandidateId
        if (id) dbg.ops.selectObject(dbg.ctx, id)
      })
    }

    for (const id of commandIds) {
      const commands = await listCommands(page)
      const cmd = commands.find((c) => c.id === id)
      if (!cmd) continue

      const item = await triggerCommandFromMenu(page, cmd)
      const disabled = await item.isDisabled()

      if (disabled) {
        const title = await item.getAttribute('title')
        expect(
          title,
          `${cmd.id} is disabled but has no disabled reason shown`,
        ).toBeTruthy()
        // MenuBar title is the user-facing contract; bridge listCommands can
        // lag one frame behind App's buildCanvasCommands for draft/selection.
        if (cmd.disabledReason) {
          expect(title).toBe(cmd.disabledReason)
        }
        await page.keyboard.press('Escape')
        continue
      }

      const before = await fingerprint(page)
      await item.click()

      await expect
        .poll(async () => {
          const after = await fingerprint(page)
          if (after.lastCommand?.id === cmd.id) return after.lastCommand.result
          if (after.lastAction?.id === `command.${cmd.id}`) {
            return after.lastAction.result
          }
          if (JSON.stringify(after) !== JSON.stringify(before)) return 'changed'
          return null
        })
        .not.toBeNull()

      if (cmd.id === 'window.commandSearch') {
        await page.keyboard.press('Escape')
      }
      if (cmd.id === 'select.clear' || cmd.id === 'view.toggleVisibility') {
        await reselectCandidate()
      }
    }
  })

  test('every command shortcut is disabled-aware or mutates debug state', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await openCandidateCanvas(page)
    const catalog = await listCommands(page)
    const commandIds = catalog.filter((c) => c.shortcut).map((c) => c.id)

    async function reselectCandidate() {
      await page.evaluate(() => {
        const dbg = window.__hackPrincetonDebug
        const id = dbg?.readCanvas().activeCandidateId
        if (id) dbg.ops.selectObject(dbg.ctx, id)
      })
    }

    for (const id of commandIds) {
      // Esc is shared by select.clear and object.cancelDraft — exercise once.
      if (id === 'object.cancelDraft') continue

      const commands = await listCommands(page)
      const cmd = commands.find((c) => c.id === id)
      if (!cmd?.shortcut) continue

      // Ensure canvas keybindings (not an input) receive the shortcut.
      await page.locator('[data-testid="viewport"]').click({ position: { x: 8, y: 8 } })

      if (cmd.disabledReason) {
        const before = await fingerprint(page)
        await page.keyboard.press(toPlaywrightShortcut(cmd.shortcut))
        const after = await fingerprint(page)
        if (after.lastCommand?.id === cmd.id) {
          expect(after.lastCommand.result).toBe('rejected')
        } else {
          expect(JSON.stringify(after.camera)).toBe(JSON.stringify(before.camera))
        }
        continue
      }

      const beforeAt = (await fingerprint(page)).lastCommand?.at ?? 0
      await page.keyboard.press(toPlaywrightShortcut(cmd.shortcut))

      await expect
        .poll(
          async () => {
            const after = await fingerprint(page)
            if (
              after.lastCommand?.id === cmd.id &&
              (after.lastCommand.at ?? 0) >= beforeAt
            ) {
              return after.lastCommand.result
            }
            if (after.lastAction?.id === `command.${cmd.id}`) {
              return after.lastAction.result
            }
            return null
          },
          { timeout: 10_000, message: `shortcut for ${cmd.id} left no fingerprint` },
        )
        .not.toBeNull()

      if (cmd.id === 'window.commandSearch') {
        await page.keyboard.press('Escape')
      }
      if (cmd.id === 'select.clear' || cmd.id === 'view.toggleVisibility') {
        await reselectCandidate()
      }
    }
  })
})
