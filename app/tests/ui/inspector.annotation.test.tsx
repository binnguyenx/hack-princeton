/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Inspector } from '../../src/ui/Inspector'
import type { Annotation, EditorState } from '../../src/domain/types'

afterEach(() => cleanup())

function makeState(candidateActive: boolean): EditorState {
  return {
    user: { id: 'u1', displayName: 'User' },
    project: { id: 'p1', ownerUserId: 'u1', name: 'P' },
    cases: [{ id: 'c1', projectId: 'p1', name: 'Case' }],
    samples: [
      {
        id: 's1',
        caseId: 'c1',
        license: 'x',
        spatiallyVerified: true,
        sourceAnatomy: {
          objectId: 'src-1',
          sampleId: 's1',
          volumeId: 'v1',
          spatial: {
            units: 'mm',
            sizes: [10, 10, 10],
            spacings: [1, 1, 1],
            bboxMm: [10, 10, 10],
          },
          volumeHash: 'h',
        },
      },
    ],
    candidates: candidateActive
      ? [
          {
            objectId: 'cand-1',
            sampleId: 's1',
            currentRevisionId: 'rev-1',
          },
        ]
      : [],
    revisions: candidateActive
      ? [
          {
            id: 'rev-1',
            candidateId: 'cand-1',
            order: 0,
            volumeId: 'v1',
            pose: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            volumeHash: 'h',
          },
        ]
      : [],
    annotations: [],
    view: {
      selectionObjectId: null,
      camera: { position: [0, 0, 1], target: [0, 0, 0] },
      visibility: {},
      inspectionPlane: { enabled: false, axis: 'z', offset: 0 },
    },
    volumes: new Map(),
    dirty: false,
    openDocuments: candidateActive
      ? [{ kind: 'candidate', id: 'cand-1' }]
      : [{ kind: 'sample', id: 's1' }],
    activeDocumentId: candidateActive ? 'cand-1' : 's1',
  }
}

function landmark(name: string, id = 'ann-1'): Annotation {
  return {
    id,
    revisionId: 'rev-1',
    type: 'landmark',
    name,
    points: [[12.4, -5.8, 24.1]],
    meta: {},
    locked: false,
    visible: true,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

describe('Inspector Annotations section', () => {
  it('shows empty state when annotations array is empty', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    expect(screen.getByText('No annotations yet')).toBeTruthy()
  })

  it('renders a row for each annotation', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[landmark('Alpha'), landmark('Beta', 'ann-2')]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    expect(screen.getByTestId('ann-row-ann-1')).toBeTruthy()
    expect(screen.getByTestId('ann-row-ann-2')).toBeTruthy()
    expect(screen.getAllByText('Landmark').length).toBeGreaterThanOrEqual(2)
  })

  it('Place annotation button is disabled with reason when source anatomy is active', () => {
    render(
      <Inspector
        state={makeState(false)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[]}
        isCandidateActive={false}
        onAnnotationAction={() => {}}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Place annotation' })
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    expect(btn.getAttribute('title')).toMatch(/Requires active candidate/)
  })

  it('Place annotation button fires place action with text_note type', () => {
    const onAnnotationAction = vi.fn()
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Place annotation' }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'place',
      annotationType: 'text_note',
    })
  })

  it('expanded row shows RAS coordinates for a landmark', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[landmark('Nasion')]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Landmark'))
    expect(screen.getAllByText(/R 12\.40/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /Jump to/i })).toBeTruthy()
  })

  it('⋯ menu Hide calls onAnnotationAction with setVisible', async () => {
    const user = userEvent.setup()
    const onAnnotationAction = vi.fn()
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[landmark('Nasion')]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
      />,
    )
    await user.click(screen.getByLabelText('Actions for Nasion'))
    await user.click(await screen.findByRole('menuitem', { name: /Hide/i }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'setVisible',
      id: 'ann-1',
      visible: false,
    })
  })

  it('⋯ menu Lock calls onAnnotationAction with setLocked', async () => {
    const user = userEvent.setup()
    const onAnnotationAction = vi.fn()
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[landmark('Nasion')]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
      />,
    )
    await user.click(screen.getByLabelText('Actions for Nasion'))
    await user.click(await screen.findByRole('menuitem', { name: /^Lock$/i }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'setLocked',
      id: 'ann-1',
      locked: true,
    })
  })

  it('plane row shows normal, area, and Show-in-slice-dock switch', () => {
    const onAnnotationAction = vi.fn()
    const plane: Annotation = {
      id: 'ann-plane',
      revisionId: 'rev-1',
      type: 'plane',
      name: 'Cut',
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      meta: { method: 'three-point', sliceDockActive: false },
      locked: false,
      visible: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[plane]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
        boundingBoxMm={[10, 10, 10]}
      />,
    )
    fireEvent.click(screen.getByText('Plane'))
    expect(screen.getByText(/Normal/i)).toBeTruthy()
    expect(screen.getByText(/0\.00,\s*0\.00,\s*1\.00/)).toBeTruthy()
    expect(screen.getAllByText(/100\.00 mm²|Area/i).length).toBeGreaterThan(0)
    const toggle = screen.getByRole('checkbox', { name: /Show in slice dock/i })
    fireEvent.click(toggle)
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'showPlaneInDock',
      annotationId: 'ann-plane',
    })
  })

  it('⋯ menu Delete on measured row shows inline confirmation before firing', async () => {
    const user = userEvent.setup()
    const onAnnotationAction = vi.fn()
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[landmark('Nasion')]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
      />,
    )
    await user.click(screen.getByLabelText('Actions for Nasion'))
    await user.click(await screen.findByRole('menuitem', { name: /Delete/i }))
    expect(onAnnotationAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete' }),
    )
    expect(screen.getByText(/Delete "Nasion"/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'delete',
      id: 'ann-1',
    })
  })

  it('panel row shows angle degrees to one decimal place', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[
          {
            id: 'ann-angle',
            revisionId: 'rev-1',
            type: 'angle',
            name: 'Osteotomy',
            points: [
              [1, 0, 0],
              [0, 0, 0],
              [0, 1, 0],
            ],
            meta: {},
            locked: false,
            visible: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    expect(screen.getByText('90.0°')).toBeTruthy()
  })

  it('panel row shows open-curve length to two decimal places', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[
          {
            id: 'ann-open',
            revisionId: 'rev-1',
            type: 'open_curve',
            name: 'Ridge',
            points: [
              [0, 0, 0],
              [3, 4, 0],
              [3, 4, 12],
            ],
            meta: {},
            locked: false,
            visible: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    expect(screen.getByText('17.00 mm')).toBeTruthy()
  })

  it('highlight row shows triangle count, Clear, color selector, and stale warning', () => {
    const onAnnotationAction = vi.fn()
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[
          {
            id: 'ann-hl',
            revisionId: 'rev-1',
            type: 'highlight',
            name: 'Concern',
            points: [[0, 0, 0]],
            meta: {
              color: 'accent',
              triangleIndices: [0, 1, 2, 3, 4],
              brushRadiusMm: 10,
            },
            locked: false,
            visible: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]}
        isCandidateActive
        onAnnotationAction={onAnnotationAction}
        staleHighlightIds={new Set(['ann-hl'])}
      />,
    )
    expect(screen.getByText('5 triangles')).toBeTruthy()
    fireEvent.click(screen.getByText('Highlight'))
    expect(
      screen.getByText(/Highlight overlay references stale mesh/i),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'updateMeta',
      id: 'ann-hl',
      meta: expect.objectContaining({ triangleIndices: [] }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Color amber' }))
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'updateMeta',
      id: 'ann-hl',
      meta: expect.objectContaining({ color: 'amber' }),
    })
    const brush = screen.getByLabelText('Brush radius')
    fireEvent.change(brush, { target: { value: '20' } })
    expect(onAnnotationAction).toHaveBeenCalledWith({
      type: 'updateMeta',
      id: 'ann-hl',
      meta: expect.objectContaining({ brushRadiusMm: 20 }),
    })
  })

  it('panel row shows ROI volume and expanded extents', () => {
    render(
      <Inspector
        state={makeState(true)}
        activeTool="select"
        onRestoreRevision={() => {}}
        annotations={[
          {
            id: 'ann-roi',
            revisionId: 'rev-1',
            type: 'roi',
            name: 'Crop',
            points: [
              [0, 0, 0],
              [3, 4, 5],
            ],
            meta: { min: [0, 0, 0], max: [3, 4, 5] },
            locked: false,
            visible: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]}
        isCandidateActive
        onAnnotationAction={() => {}}
      />,
    )
    expect(screen.getByText('60.0 mm³')).toBeTruthy()
    fireEvent.click(screen.getByText('ROI'))
    expect(screen.getByText(/3\.00\s*×\s*4\.00\s*×\s*5\.00\s*mm/)).toBeTruthy()
  })
})
