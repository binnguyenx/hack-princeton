/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RigidPlacementControls } from '../../src/ui/RigidPlacementControls'
afterEach(cleanup)

it('exposes explicit editor-axis deltas and treats blank input as invalid', () => {
  const changed = vi.fn()
  const { rerender } = render(<RigidPlacementControls onChange={changed} disabled={false} />)
  fireEvent.change(screen.getByLabelText('Translate X (mm)'), { target: { value: '12' } })
  expect(changed).toHaveBeenLastCalledWith({ x: 12, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })
  fireEvent.change(screen.getByLabelText('Rotate Z (degrees)'), { target: { value: '90' } })
  expect(changed).toHaveBeenLastCalledWith({ x: 12, y: 0, z: 0, rx: 0, ry: 0, rz: 90 })
  fireEvent.change(screen.getByLabelText('Translate X (mm)'), { target: { value: '' } })
  expect(changed.mock.lastCall?.[0].x).toBeNaN()
  rerender(<RigidPlacementControls onChange={changed} disabled />)
  expect(screen.getByLabelText('Translate X (mm)').matches(':disabled')).toBe(true)
})
