/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'

afterEach(() => cleanup())

const baseProps = {
  documentName: 'Sample',
  volumeAvailable: true,
  selectedObjectId: null as string | null,
  onModeChange: () => {},
  children: <div>3D model</div>,
}

describe('annotation type selector (Place mode UX)', () => {
  it('shows annotation type buttons in ContextStrip when Place mode is active', () => {
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
      />,
    )

    const strip = screen.getByRole('region', { name: 'Active mode options' })
    expect(strip).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Text Note' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Landmark' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Angle' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Distance Line' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Closed Curve' })).toBeTruthy()
  })

  it('annotation type buttons absent when mode is not place', () => {
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="view"
        isCandidateActive
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Landmark' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Angle' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Distance Line' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Closed Curve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Text Note' })).toBeNull()
  })

  it('Place annotation fires onModeChange to place', () => {
    const onModeChange = vi.fn()
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="view"
        isCandidateActive
        onModeChange={onModeChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Place mode' }))
    expect(onModeChange).toHaveBeenCalledWith('place')
  })

  it('source anatomy active: annotation type buttons absent', () => {
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive={false}
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Landmark' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Angle' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Distance Line' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Closed Curve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Text Note' })).toBeNull()
  })

  it('does not install a competing global Escape shortcut', () => {
    const onModeChange = vi.fn()
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
        onModeChange={onModeChange}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onModeChange).not.toHaveBeenCalled()
  })

  it('Plane type exposes Point-normal / Three-point method selector', () => {
    const onPlaneMethodChange = vi.fn()
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="plane"
        planeMethod="point-normal"
        onAnnotationTypeChange={() => {}}
        onPlaneMethodChange={onPlaneMethodChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Plane' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Point-normal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Three-point' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Three-point' }))
    expect(onPlaneMethodChange).toHaveBeenCalledWith('three-point')
  })

  it('type-switch mid-placement discards draft immediately without confirm', () => {
    const onAnnotationTypeChange = vi.fn()
    const onCancelDraft = vi.fn()
    const apiRef: {
      current: {
        setInProgressPoints: (p: Array<[number, number, number]>) => void
        getInProgressPoints: () => Array<[number, number, number]>
      } | null
    } = {
      current: null,
    }
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="line"
        onAnnotationTypeChange={onAnnotationTypeChange}
        onCancelDraft={onCancelDraft}
        placementApiRef={apiRef}
      />,
    )

    act(() => {
      apiRef.current!.setInProgressPoints([[1, 2, 3]])
    })
    expect(screen.getByTitle('Unsaved draft')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Closed Curve' }))
    expect(onAnnotationTypeChange).toHaveBeenCalledWith('closed_curve')
    expect(screen.queryByText(/Cancel current placement and switch/i)).toBeNull()
    expect(apiRef.current!.getInProgressPoints()).toEqual([])
    expect(onCancelDraft).toHaveBeenCalled()
  })

  it('double-click active annotation type stays in Place', () => {
    const onModeChange = vi.fn()
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="text_note"
        onModeChange={onModeChange}
        onAnnotationTypeChange={() => {}}
      />,
    )

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Text Note' }))
    expect(onModeChange).not.toHaveBeenCalled()
  })

  it('Place strip has no Commit/Cancel buttons', () => {
    const apiRef: {
      current: {
        setDraft: (d: {
          points: Array<[number, number, number]>
          meta: Record<string, unknown>
        }) => void
      } | null
    } = { current: null }

    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
        placementApiRef={apiRef}
        voxels={new Uint8Array(8)}
        volumeSizes={[2, 2, 2]}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Commit annotation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel draft' })).toBeNull()

    act(() => {
      apiRef.current!.setDraft({ points: [[1, 2, 3]], meta: {} })
    })
    expect(screen.getByTitle('Unsaved draft')).toBeTruthy()
  })

  it('keeps slice dock mounted while Place is active', () => {
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="text_note"
        onAnnotationTypeChange={() => {}}
        voxels={new Uint8Array(8)}
        volumeSizes={[2, 2, 2]}
        crosshair={[0, 0, 0]}
        crosshairRas={[0, 0, 0]}
      />,
    )
    expect(screen.getByLabelText('Synchronized slice dock')).toBeTruthy()
    expect(screen.getByText('3D model')).toBeTruthy()
  })
})

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

describe('placement colour (annotation-color-system R4)', () => {
  it.each(['line', 'plane', 'roi', 'highlight'] as const)(
    'shows the five palette swatches while placing a %s and reports the pick',
    (type) => {
      const onPlacementColorChange = vi.fn()
      render(
        <CanvasWorkspace
          {...baseProps}
          activeMode="place"
          isCandidateActive
          hasDisplayMesh
          activeAnnotationType={type}
          onAnnotationTypeChange={() => {}}
          placementColor={null}
          onPlacementColorChange={onPlacementColorChange}
        />,
      )
      const group = screen.getByRole('group', { name: 'Placement color' })
      expect(group.querySelectorAll('button')).toHaveLength(5)
      const expectedDefault = type === 'roi' ? 'amber' : 'accent'
      expect(screen.getByRole('button', { name: `Color ${expectedDefault}` }).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: 'Color emerald' }))
      expect(onPlacementColorChange).toHaveBeenCalledWith('emerald')
    },
  )

  it('shows the session colour once one was picked', () => {
    render(
      <CanvasWorkspace
        {...baseProps}
        activeMode="place"
        isCandidateActive
        activeAnnotationType="roi"
        onAnnotationTypeChange={() => {}}
        placementColor="slate"
        onPlacementColorChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Color slate' }).getAttribute('aria-pressed')).toBe('true')
  })
})

