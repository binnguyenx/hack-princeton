/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../../src/ui/CommandPalette'
import type { CommandDef } from '../../src/commands/registry'

afterEach(() => cleanup())

const COMMANDS: CommandDef[] = [
  {
    id: 'file.saveProject',
    label: 'Save Project',
    menuPath: 'File/Save Project',
    shortcut: 'Mod+S',
    aliases: ['save'],
    tier: 'P0',
  },
]

describe('CommandPalette', () => {
  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} commands={COMMANDS} onClose={onClose} onRun={() => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking outside panel', () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} commands={COMMANDS} onClose={onClose} onRun={() => {}} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('runs selected command and closes', () => {
    const onClose = vi.fn()
    const onRun = vi.fn()
    render(<CommandPalette open={true} commands={COMMANDS} onClose={onClose} onRun={onRun} />)
    fireEvent.click(screen.getByRole('button', { name: /Save Project/i }))
    expect(onRun).toHaveBeenCalledWith('file.saveProject')
    expect(onClose).toHaveBeenCalled()
  })
})
