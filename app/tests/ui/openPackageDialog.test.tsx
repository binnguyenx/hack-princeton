/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenPackageDialog } from '../../src/ui/dialogs/OpenPackageDialog'
afterEach(cleanup)
it('does not import until explicitly submitted and preserves the file on an import error', async () => {
  const upload = vi.fn().mockRejectedValue(new Error('Hash mismatch'))
  const close = vi.fn()
  render(<OpenPackageDialog onClose={close} onImport={upload} busy={false} />)
  expect((screen.getByRole('button', { name: 'Import as new project' }) as HTMLButtonElement).disabled).toBe(true)
  const file = new File(['bad'], 'project.zip', { type: 'application/zip' })
  fireEvent.change(screen.getByLabelText('Project package (.zip)'), { target: { files: [file] } })
  expect(upload).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Import as new project' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Hash mismatch'))
  expect(upload).toHaveBeenCalledWith(file)
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(close).toHaveBeenCalledTimes(1)
})

it('blocks duplicate submission and dismissal while an import is unresolved', async () => {
  let finish!: () => void
  const upload = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  const close = vi.fn()
  const { rerender } = render(<OpenPackageDialog onClose={close} onImport={upload} busy={false} />)
  fireEvent.change(screen.getByLabelText('Project package (.zip)'), { target: { files: [new File(['zip'], 'project.zip')] } })
  fireEvent.click(screen.getByRole('button', { name: 'Import as new project' }))
  fireEvent.click(screen.getByRole('button', { name: 'Import as new project' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(upload).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  rerender(<OpenPackageDialog onClose={close} onImport={upload} busy />)
  expect((screen.getByLabelText('Project package (.zip)') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
  finish()
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
})
