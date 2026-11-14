import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Layers,
  Box,
  Search,
  Sparkles,
  ExternalLink,
  Plus,
  FileUp,
  FolderOpen,
} from 'lucide-react'
import type { Candidate, CandidateRevision, Case, Sample } from '../domain/types'

export type CaseTableViewProps = {
  cases: Case[]
  samples: Sample[]
  candidates: Candidate[]
  revisions: CandidateRevision[]
  selectedCaseId: string | null
  onSelectCase: (caseId: string) => void
  onOpenSampleIn3D: (sampleId: string) => void
  onOpenCandidateIn3D: (candidateId: string) => void
  onCreateCandidate: (sampleId: string) => void
  onImportSample: (caseId: string) => void
  onDeleteCase: (caseId: string) => void
  onDeleteSample: (sampleId: string) => void
  onDeleteCandidate: (candidateId: string) => void
  onSwitchToCanvas: () => void
}

export function CaseTableView({
  cases,
  samples,
  candidates,
  revisions,
  selectedCaseId,
  onSelectCase,
  onOpenSampleIn3D,
  onOpenCandidateIn3D,
  onCreateCandidate,
  onImportSample,
  onDeleteCase,
  onDeleteSample,
  onDeleteCandidate,
  onSwitchToCanvas,
}: CaseTableViewProps) {
  const [activeTab, setActiveTab] = useState<'cases' | 'canvas'>('cases')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'samples' | 'candidates'>('all')

  const handleTabChange = (val: string) => {
    if (val === 'canvas') {
      onSwitchToCanvas()
    } else {
      setActiveTab(val as 'cases')
    }
  }

  return (
    <div className="case-management-view">
      <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="management-tabs-root">
        <div className="management-tabs-bar">
          <Tabs.List className="tabs-list" aria-label="Project Management Perspectives">
            <Tabs.Trigger value="cases" className="tab-trigger">
              <Layers size={15} />
              <span>Cases & Anatomy</span>
            </Tabs.Trigger>
            <Tabs.Trigger value="canvas" className="tab-trigger">
              <Box size={15} />
              <span>3D Studio Canvas</span>
            </Tabs.Trigger>
          </Tabs.List>

          {activeTab === 'cases' ? (
            <div className="table-toolbar">
              <div className="table-search">
                <Search size={14} className="table-search__icon" />
                <input
                  type="text"
                  className="table-search__input"
                  placeholder="Filter by keyword…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="table-filter-group">
                <button
                  type="button"
                  className={`filter-chip ${filterType === 'all' ? 'is-active' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-chip ${filterType === 'samples' ? 'is-active' : ''}`}
                  onClick={() => setFilterType('samples')}
                >
                  Samples
                </button>
                <button
                  type="button"
                  className={`filter-chip ${filterType === 'candidates' ? 'is-active' : ''}`}
                  onClick={() => setFilterType('candidates')}
                >
                  Candidates
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <Tabs.Content value="cases" className="tab-content">
          {cases.length === 0 ? (
            <div className="empty-management-state">
              <FolderOpen size={40} className="empty-icon" />
              <h3>No patient cases created yet</h3>
              <p>Create a case to begin organizing defective cranial anatomy samples and reconstruction candidates.</p>
            </div>
          ) : (
            <div className="grouped-cases-container">
              {cases.map((c) => {
                const caseSamples = samples.filter((s) => s.caseId === c.id)
                const caseCandidates = candidates.filter((cand) =>
                  caseSamples.some((s) => s.id === cand.sampleId),
                )
                const totalAssets = caseSamples.length + caseCandidates.length

                return (
                  <div key={c.id} className="case-group atlassian-card">
                    <div
                      className={`case-group__header ${c.id === selectedCaseId ? 'is-selected' : ''}`}
                      onClick={() => onSelectCase(c.id)}
                    >
                      <div className="case-group__title-cluster">
                        <Layers size={16} className="case-group__icon" />
                        <h2 className="case-group__title">{c.name}</h2>
                        <span className="atlassian-count-badge">
                          {totalAssets} {totalAssets === 1 ? 'asset' : 'assets'}
                        </span>
                      </div>
                      <div className="case-group__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onImportSample(c.id)
                          }}
                        >
                          <FileUp size={12} />
                          <span>Import Sample</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteCase(c.id)
                          }}
                        >
                          <span>Delete Case</span>
                        </button>
                      </div>
                    </div>

                    <div className="case-table-wrapper">
                      <table className="enterprise-table">
                        <thead>
                          <tr>
                            <th scope="col" style={{ width: '35%' }}>Asset Name</th>
                            <th scope="col" style={{ width: '20%' }}>Type</th>
                            <th scope="col" style={{ width: '20%' }}>Details</th>
                            <th scope="col" style={{ width: '15%' }}>Operator</th>
                            <th scope="col" style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {totalAssets === 0 ? (
                            <tr>
                              <td colSpan={5} className="table-empty-row">
                                No anatomical samples imported into this case yet.{' '}
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => onImportSample(c.id)}
                                >
                                  Import NRRD volume
                                </button>
                              </td>
                            </tr>
                          ) : null}

                          {filterType !== 'candidates' &&
                            caseSamples.map((s) => (
                              <tr key={s.id} className="enterprise-table__row">
                                <td className="asset-name-cell">
                                  <strong>{s.displayName ?? s.id}</strong>
                                  <span className="asset-subtext">NRRD source volume</span>
                                </td>
                                <td>
                                  <span className="atlassian-tag atlassian-tag--sample">
                                    Protected Sample
                                  </span>
                                </td>
                                <td>
                                  <span className="atlassian-subtle-text">
                                    {s.sourceAnatomy.spatial.sizes.join(' × ')} voxels
                                  </span>
                                </td>
                                <td>
                                  <span className="atlassian-user-link">Local Dev</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div className="row-action-cluster">
                                    <button
                                      type="button"
                                      className="btn btn--secondary btn--xs"
                                      title="Open in 3D Viewport"
                                      onClick={() => onOpenSampleIn3D(s.id)}
                                    >
                                      <ExternalLink size={12} />
                                      <span>Open 3D</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn--primary btn--xs"
                                      title="Create new candidate implant"
                                      onClick={() => onCreateCandidate(s.id)}
                                    >
                                      <Plus size={12} />
                                      <span>Candidate</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn--secondary btn--xs"
                                      onClick={() => onDeleteSample(s.id)}
                                    >
                                      <span>Delete Sample</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}

                          {filterType !== 'samples' &&
                            caseCandidates.map((cand) => {
                              const candRevs = revisions.filter(
                                (r) => r.candidateId === cand.objectId,
                              )
                              const currentRev = revisions.find(
                                (r) => r.id === cand.currentRevisionId,
                              )
                              const revOrder = currentRev?.order ?? 0

                              return (
                                <tr key={cand.objectId} className="enterprise-table__row">
                                  <td className="asset-name-cell">
                                    <strong>{cand.displayName ?? cand.objectId}</strong>
                                    <span className="asset-subtext">Implant Reconstruction</span>
                                  </td>
                                  <td>
                                    <span className="atlassian-tag atlassian-tag--candidate">
                                      <Sparkles size={11} /> Implant Candidate
                                    </span>
                                  </td>
                                  <td>
                                    <span className="atlassian-subtle-text">
                                      Revision {revOrder} ({candRevs.length} checkpoints)
                                    </span>
                                  </td>
                                  <td>
                                    <span className="atlassian-user-link">Local Dev</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div className="row-action-cluster">
                                      <button
                                        type="button"
                                        className="btn btn--secondary btn--xs"
                                        onClick={() => onOpenCandidateIn3D(cand.objectId)}
                                      >
                                        <ExternalLink size={12} />
                                        <span>Edit 3D</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn--secondary btn--xs"
                                        onClick={() => onDeleteCandidate(cand.objectId)}
                                      >
                                        <span>Delete Candidate</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Tabs.Content>

      </Tabs.Root>
    </div>
  )
}
