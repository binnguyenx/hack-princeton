import { describe, expect, it } from 'vitest'
import { buildCanvasCommands, matchesCommand } from '../src/commands/registry'

describe('canvas command registry', () => {
  it('exposes unique shortcuts for shipped commands', () => {
    const commands = buildCanvasCommands({
      hasProject: true,
      hasActiveDocument: true,
      isCandidateActive: true,
      isDraftActive: true,
      canRestore: true,
      hasSelection: true,
    })

    const shortcuts = commands
      .map((c) => c.shortcut)
      .filter((s): s is string => !!s && s !== 'Esc')
    const set = new Set(shortcuts)
    expect(set.size).toBe(shortcuts.length)
  })

  it('matches command palette query by label, path, and aliases', () => {
    const commands = buildCanvasCommands({
      hasProject: true,
      hasActiveDocument: true,
      isCandidateActive: true,
      isDraftActive: false,
      canRestore: true,
      hasSelection: false,
    })
    const focus = commands.find((c) => c.id === 'view.focus')
    expect(focus).toBeTruthy()
    if (!focus) return
    expect(matchesCommand(focus, 'focus')).toBe(true)
    expect(matchesCommand(focus, 'View/Focus')).toBe(true)
  })
})
