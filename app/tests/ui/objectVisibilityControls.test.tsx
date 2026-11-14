/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ViewController } from '../../src/ui/ViewController'
afterEach(cleanup)

it('offers visible hide/show and recovery controls without requiring a selected object', () => {
  const toggle = vi.fn(), showAll = vi.fn()
  const common = { projection: 'perspective' as const, crosshairEnabled: false, lightingIntensity: 1,
    onCenter: vi.fn(), onReset: vi.fn(), onPreset: vi.fn(), onProjectionChange: vi.fn(),
    onCrosshairChange: vi.fn(), onLightingChange: vi.fn() }
  const { rerender } = render(<ViewController {...common} objectVisible canToggleVisibility
    onToggleVisibility={toggle} onShowAll={showAll} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide active object' }))
  expect(toggle).toHaveBeenCalledTimes(1)
  rerender(<ViewController {...common} objectVisible={false} canToggleVisibility
    onToggleVisibility={toggle} onShowAll={showAll} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show active object' }))
  fireEvent.click(screen.getByRole('button', { name: 'Show all objects' }))
  expect(toggle).toHaveBeenCalledTimes(2)
  expect(showAll).toHaveBeenCalledTimes(1)
})
