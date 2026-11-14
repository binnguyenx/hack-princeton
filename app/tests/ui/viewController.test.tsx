/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewController } from '../../src/ui/ViewController'

afterEach(() => cleanup())

describe('3D view controller', () => {
  it('routes frame, direction, projection, and crosshair actions', () => {
    const onCenter = vi.fn()
    const onReset = vi.fn()
    const onPreset = vi.fn()
    const onProjectionChange = vi.fn()
    const onCrosshairChange = vi.fn()
    const onLightingChange = vi.fn()

    render(
      <ViewController
        projection="perspective"
        crosshairEnabled={true}
        lightingIntensity={1}
        onCenter={onCenter}
        onReset={onReset}
        onPreset={onPreset}
        onProjectionChange={onProjectionChange}
        onCrosshairChange={onCrosshairChange}
        onLightingChange={onLightingChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Center 3D view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset 3D view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anterior view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Orthographic projection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide crosshair' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Scene lighting' }), {
      target: { value: '1.4' },
    })

    expect(onCenter).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
    expect(onPreset).toHaveBeenCalledWith('anterior')
    expect(onProjectionChange).toHaveBeenCalledWith('orthographic')
    expect(onCrosshairChange).toHaveBeenCalledWith(false)
    expect(onLightingChange).toHaveBeenCalledWith(1.4)
  })
})
