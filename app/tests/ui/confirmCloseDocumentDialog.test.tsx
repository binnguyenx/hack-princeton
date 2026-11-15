/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmCloseDocumentDialog } from '../../src/ui/dialogs/ConfirmCloseDocumentDialog'

afterEach(() => cleanup())

describe('ConfirmCloseDocumentDialog (R8)', () => {
  it('offers Save, Discard, and Cancel', () => {
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmCloseDocumentDialog
        open
        onOpenChange={() => {}}
        onSave={onSave}
        onDiscard={onDiscard}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
