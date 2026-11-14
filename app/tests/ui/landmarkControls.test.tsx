/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LandmarkControls } from '../../src/ui/LandmarkControls'
import type { SourceLandmark } from '../../src/domain/types'
afterEach(cleanup)
it('measures saved source points, rejects identical points and disables deletion while pending', () => {
  const a: SourceLandmark = { id: 'a', label: 'A', sampleId: 'sample', sourceObjectId: 'source', volumeHash: 'hash', ijk: [0, 0, 0], ras: [0, 0, 0] }
  const points = [a, { ...a, id: 'b', label: 'B', ras: [3, 4, 0] as [number, number, number] }]
  render(<LandmarkControls points={points} persistent={false} pending onPersistentChange={vi.fn()} onDelete={vi.fn()} onLocate={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('First landmark'), { target: { value: 'a' } })
  fireEvent.change(screen.getByLabelText('Second landmark'), { target: { value: 'b' } })
  expect(screen.getByLabelText('Landmark distance').textContent).toBe('5.00 mm')
  fireEvent.change(screen.getByLabelText('Second landmark'), { target: { value: 'a' } })
  expect(screen.getByLabelText('Landmark distance').textContent).toContain('distinct')
  expect((screen.getByRole('button', { name: 'Delete A' }) as HTMLButtonElement).disabled).toBe(true)
})
