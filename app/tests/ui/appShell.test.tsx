/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../src/ui/Sidebar'
import { AppHeader } from '../../src/ui/AppHeader'
import { CaseTableView } from '../../src/ui/CaseTableView'
import { NewCaseDialog } from '../../src/ui/dialogs/NewCaseDialog'
import type { Candidate, Case, ProjectSummary, Sample } from '../../src/domain/types'

afterEach(() => cleanup())

describe('R35-R38, R41-R42 Enterprise UI Components', () => {
  it('R35: renders persistent sidebar with studio header, search, and navigation items', () => {
    const projects: ProjectSummary[] = [
      { id: 'p1', name: 'SkullBreak Study 00', caseCount: 2, updatedAt: new Date().toISOString() },
    ]

    render(
      <Sidebar
        activeNav="cases"
        onSelectNav={() => {}}
        currentProject={{ id: 'p1', name: 'SkullBreak Study 00' }}
        projects={projects}
        onOpenProject={() => {}}
        onNewProject={() => {}}
      />,
    )

    expect(screen.getByText('Cranial Studio')).toBeTruthy()
    expect(screen.getByText('Local Dev')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
    expect(screen.getByText('⌘F')).toBeTruthy()
    expect(screen.getByText('Cases & Anatomy')).toBeTruthy()
    expect(screen.getByText('3D Studio Canvas')).toBeTruthy()
    expect(screen.getByText('SkullBreak Study 00')).toBeTruthy()
  })

  it('R36: renders management header with breadcrumbs and action buttons', () => {
    render(
      <AppHeader
        projectName="SkullBreak Study 00"
        caseName="Case 000: Parietotemporal"
        isDirty={true}
        onSave={() => {}}
        onNewCase={() => {}}
        onImportSample={() => {}}
      />,
    )

    expect(screen.getByText('Projects')).toBeTruthy()
    expect(screen.getByText('SkullBreak Study 00')).toBeTruthy()
    expect(screen.getByText('Case 000: Parietotemporal')).toBeTruthy()
    expect(screen.getByText('Unsaved Changes')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /New Case/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Import Sample/i })).toBeTruthy()
  })

  it('R37 & R38: renders grouped cases with asset table, pill badges, and operator avatar', () => {
    const cases: Case[] = [{ id: 'c1', projectId: 'p1', name: 'Case 000: Parietotemporal Defect' }]
    const samples: Sample[] = [
      {
        id: 's1',
        caseId: 'c1',
        displayName: 'defective_skull.nrrd',
        license: 'CC BY-NC-SA 4.0',
        spatiallyVerified: true,
        sourceAnatomy: {
          objectId: 'obj-s1',
          sampleId: 's1',
          volumeId: 'vol-s1',
          spatial: { units: 'mm', sizes: [512, 512, 320], spacings: [0.5, 0.5, 0.5], bboxMm: [256, 256, 160] },
          volumeHash: 'hash1',
        },
      },
    ]
    const candidates: Candidate[] = [
      {
        objectId: 'cand-1',
        sampleId: 's1',
        displayName: 'Implant Candidate 01',
        currentRevisionId: 'rev-0',
      },
    ]

    render(
      <CaseTableView
        cases={cases}
        samples={samples}
        candidates={candidates}
        revisions={[{ id: 'rev-0', candidateId: 'cand-1', order: 0, volumeId: 'v1', pose: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], volumeHash: 'h' }]}
        selectedCaseId="c1"
        onSelectCase={() => {}}
        onOpenSampleIn3D={() => {}}
        onOpenCandidateIn3D={() => {}}
        onCreateCandidate={() => {}}
        onImportSample={() => {}}
        onDeleteCase={() => {}}
        onDeleteSample={() => {}}
        onDeleteCandidate={() => {}}
        onSwitchToCanvas={() => {}}
      />,
    )

    expect(screen.getByText('Case 000: Parietotemporal Defect')).toBeTruthy()
    expect(screen.getByText('defective_skull.nrrd')).toBeTruthy()
    expect(screen.getByText('Protected Sample')).toBeTruthy()
    expect(screen.getByText(/512 × 512 × 320 voxels/i)).toBeTruthy()
    expect(screen.getByText('Implant Candidate 01')).toBeTruthy()
    expect(screen.getByText('Implant Candidate')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open 3D/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Candidate$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Delete Sample$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Delete Candidate$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Delete Case$/i })).toBeTruthy()
  })

  it('delete action callbacks fire for case/sample/candidate rows', () => {
    const cases: Case[] = [{ id: 'c1', projectId: 'p1', name: 'Case 1' }]
    const samples: Sample[] = [
      {
        id: 's1',
        caseId: 'c1',
        displayName: 's1.nrrd',
        license: 'CC BY-NC-SA 4.0',
        spatiallyVerified: true,
        sourceAnatomy: {
          objectId: 'obj-s1',
          sampleId: 's1',
          volumeId: 'vol-s1',
          spatial: { units: 'mm', sizes: [1, 1, 1], spacings: [1, 1, 1], bboxMm: [1, 1, 1] },
          volumeHash: 'hash1',
        },
      },
    ]
    const candidates: Candidate[] = [
      { objectId: 'cand-1', sampleId: 's1', currentRevisionId: 'rev-0' },
    ]
    const onDeleteCase = vi.fn()
    const onDeleteSample = vi.fn()
    const onDeleteCandidate = vi.fn()

    render(
      <CaseTableView
        cases={cases}
        samples={samples}
        candidates={candidates}
        revisions={[{ id: 'rev-0', candidateId: 'cand-1', order: 0, volumeId: 'v1', pose: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], volumeHash: 'h' }]}
        selectedCaseId="c1"
        onSelectCase={() => {}}
        onOpenSampleIn3D={() => {}}
        onOpenCandidateIn3D={() => {}}
        onCreateCandidate={() => {}}
        onImportSample={() => {}}
        onDeleteCase={onDeleteCase}
        onDeleteSample={onDeleteSample}
        onDeleteCandidate={onDeleteCandidate}
        onSwitchToCanvas={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Delete Sample$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete Candidate$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete Case$/i }))

    expect(onDeleteSample).toHaveBeenCalledWith('s1')
    expect(onDeleteCandidate).toHaveBeenCalledWith('cand-1')
    expect(onDeleteCase).toHaveBeenCalledWith('c1')
  })

  it('R41: NewCaseDialog replaces window.prompt with accessible modal', () => {
    let createdName = ''
    render(
      <NewCaseDialog
        open={true}
        onOpenChange={() => {}}
        onCreate={(name) => {
          createdName = name
        }}
        defaultName="Case 1"
      />,
    )

    const input = screen.getByLabelText(/Case Name/i)
    fireEvent.change(input, { target: { value: 'Case 002: Bilateral Repair' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Case/i }))

    expect(createdName).toBe('Case 002: Bilateral Repair')
  })
})
