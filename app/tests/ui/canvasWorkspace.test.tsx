/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'

afterEach(() => cleanup())

describe('cross-reference workbench hierarchy', () => {
  it('opens volume-backed documents 3D-first with a synchronized slice dock', () => {
    render(
      <CanvasWorkspace
        documentName="skullbreak-000-parietotemporal-complete"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId={null}
        onModeChange={() => {}}
      >
        <div>3D model</div>
      </CanvasWorkspace>,
    )

    expect(screen.getByRole('region', { name: '3D view' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Synchronized slice dock' })).toBeTruthy()
    expect(screen.getByText('Axial')).toBeTruthy()
    expect(screen.getByText('Sagittal')).toBeTruthy()
    expect(screen.getByText('Coronal')).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()
  })

  it('keeps only pointer modes in the mode rail', () => {
    render(
      <CanvasWorkspace
        documentName="Sample"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId={null}
        onModeChange={() => {}}
      >
        <div>3D model</div>
      </CanvasWorkspace>,
    )

    const rail = screen.getByRole('toolbar', { name: 'Interaction modes' })
    expect(rail.textContent).toContain('View')
    expect(rail.textContent).toContain('Window / Level')
    expect(rail.textContent).toContain('Place')
    expect(rail.textContent).not.toContain('Save')
    expect(rail.textContent).not.toContain('Reset')
  })

  it('collapses slices to a labelled summary and restores them', () => {
    render(
      <CanvasWorkspace
        documentName="Sample"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId={null}
        onModeChange={() => {}}
      >
        <div>3D model</div>
      </CanvasWorkspace>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse slice dock' }))
    expect(screen.getByText('Slices: Axial · Sagittal · Coronal')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Axial slice view' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand slice dock' }))
    expect(screen.getByRole('region', { name: 'Axial slice view' })).toBeTruthy()
  })

  it('opens the inspector only for a selected object', () => {
    const onModeChange = vi.fn()
    const { rerender } = render(
      <CanvasWorkspace
        documentName="Sample"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId={null}
        onModeChange={onModeChange}
      >
        <div>3D model</div>
      </CanvasWorkspace>,
    )

    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()
    rerender(
      <CanvasWorkspace
        documentName="Sample"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId="sample-object"
        onModeChange={onModeChange}
        inspector={<div>Protected source anatomy</div>}
      >
        <div>3D model</div>
      </CanvasWorkspace>,
    )
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()
    expect(screen.getByText('Protected source anatomy')).toBeTruthy()
  })
})
