/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuBar } from '../../src/ui/MenuBar'
import type { CommandDef } from '../../src/commands/registry'

afterEach(() => cleanup())

const COMMANDS: CommandDef[] = [
  {
    id: 'file.saveProject',
    label: 'Save Project',
    menuPath: 'File/Save Project',
    shortcut: 'Mod+S',
    tier: 'P0',
  },
  {
    id: 'view.focus',
    label: 'Focus Selection',
    menuPath: 'View/Focus Selection',
    shortcut: 'F',
    tier: 'P0',
  },
]

describe('MenuBar behavior', () => {
  it('closes menu after running a command', () => {
    const onRun = vi.fn()
    render(<MenuBar commands={COMMANDS} onRun={onRun} />)

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: /Save Project/i }))
    expect(onRun).toHaveBeenCalledWith('file.saveProject')
    expect(screen.queryByRole('button', { name: /Save Project/i })).toBeNull()
  })

  it('closes open menu when clicking outside', () => {
    render(<MenuBar commands={COMMANDS} onRun={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('button', { name: /Save Project/i })).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('button', { name: /Save Project/i })).toBeNull()
  })
})
