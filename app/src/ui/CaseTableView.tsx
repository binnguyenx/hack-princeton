import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes'
import {
  Circle,
  FolderOpen,
  Box as CubeIcon,
  Search,
  Layers,
  ExternalLink,
  Plus,
  FileUp,
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
  const normalizedSearch = searchQuery.trim().toLowerCase()

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
              <CubeIcon size={15} />
              <span>3D Studio Canvas</span>
            </Tabs.Trigger>
          </Tabs.List>

          {activeTab === 'cases' ? (
            <div className="table-toolbar">
              <Box style={{ minWidth: 260 }}>
                <TextField.Root
                  size="2"
                  placeholder="Filter by keyword…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                >
                  <TextField.Slot side="left">
                    <Search size={14} />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              <div className="table-filter-group">
                <Button type="button" size="1" variant={filterType === 'all' ? 'solid' : 'soft'} color={filterType === 'all' ? 'blue' : 'gray'} onClick={() => setFilterType('all')}>
                  All
                </Button>
                <Button type="button" size="1" variant={filterType === 'samples' ? 'solid' : 'soft'} color={filterType === 'samples' ? 'blue' : 'gray'} onClick={() => setFilterType('samples')}>
                  Samples
                </Button>
                <Button type="button" size="1" variant={filterType === 'candidates' ? 'solid' : 'soft'} color={filterType === 'candidates' ? 'blue' : 'gray'} onClick={() => setFilterType('candidates')}>
                  Candidates
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <Tabs.Content value="cases" className="tab-content">
          {cases.length === 0 ? (
            <Card className="empty-management-state">
              <FolderOpen size={40} className="empty-icon" />
              <Heading size="4">No patient cases created yet</Heading>
              <Text color="gray" size="2">Create a case to organize anatomy samples and reconstruction candidates.</Text>
            </Card>
          ) : (
            <div className="grouped-cases-container">
              {cases.map((c) => {
                const rawCaseSamples = samples.filter((s) => s.caseId === c.id)
                const rawCaseCandidates = candidates.filter((cand) =>
                  rawCaseSamples.some((s) => s.id === cand.sampleId),
                )
                const filteredSamples = rawCaseSamples.filter((s) => {
                  if (!normalizedSearch) return true
                  const label = (s.displayName ?? s.id).toLowerCase()
                  return label.includes(normalizedSearch)
                })
                const filteredCandidates = rawCaseCandidates.filter((cand) => {
                  if (!normalizedSearch) return true
                  const label = (cand.displayName ?? cand.objectId).toLowerCase()
                  return label.includes(normalizedSearch)
                })
                const showSamples = filterType !== 'candidates'
                const showCandidates = filterType !== 'samples'
                const visibleSamples = showSamples ? filteredSamples : []
                const visibleCandidates = showCandidates ? filteredCandidates : []
                const totalAssets = rawCaseSamples.length + rawCaseCandidates.length
                const totalVisibleAssets = visibleSamples.length + visibleCandidates.length
                const showFilteredEmpty = totalAssets > 0 && totalVisibleAssets === 0

                return (
                  <div key={c.id} className="case-group atlassian-card">
                    <div
                      className={`case-group__header ${c.id === selectedCaseId ? 'is-selected' : ''}`}
                      onClick={() => onSelectCase(c.id)}
                    >
                      <div className="case-group__title-cluster">
                        <Layers size={16} className="case-group__icon" />
                        <Heading size="3" as="h2" className="case-group__title">{c.name}</Heading>
                        <Badge variant="surface" color="gray">
                          {totalAssets} {totalAssets === 1 ? 'asset' : 'assets'}
                        </Badge>
                      </div>
                      <div className="case-group__actions">
                        <Button
                          type="button"
                          variant="soft"
                          color="gray"
                          size="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            onImportSample(c.id)
                          }}
                        >
                          <FileUp size={12} />
                          Import Sample
                        </Button>
                        <Button
                          type="button"
                          variant="soft"
                          color="red"
                          size="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteCase(c.id)
                          }}
                        >
                          Delete Case
                        </Button>
                      </div>
                    </div>

                    <Card>
                      <Table.Root variant="surface" size="2">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>Asset Name</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Details</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Operator</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {totalAssets === 0 ? (
                            <Table.Row>
                              <Table.Cell colSpan={5} className="table-empty-row">
                                No anatomical samples imported into this case yet.{' '}
                                <button type="button" className="link-btn" onClick={() => onImportSample(c.id)}>
                                  Import NRRD volume
                                </button>
                              </Table.Cell>
                            </Table.Row>
                          ) : null}

                          {showFilteredEmpty ? (
                            <Table.Row>
                              <Table.Cell colSpan={5}>
                                <Text size="2" color="gray">No assets match your filter.</Text>
                              </Table.Cell>
                            </Table.Row>
                          ) : null}

                          {visibleSamples.map((s) => (
                            <Table.Row key={s.id}>
                              <Table.RowHeaderCell>
                                <Flex direction="column" gap="1">
                                  <Text weight="medium">{s.displayName ?? s.id}</Text>
                                  <Text size="1" color="gray">NRRD source volume</Text>
                                </Flex>
                              </Table.RowHeaderCell>
                              <Table.Cell>
                                <Badge color="green" variant="soft">Protected Sample</Badge>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="2" color="gray">
                                  {s.sourceAnatomy.spatial.sizes.join(' × ')} voxels
                                </Text>
                              </Table.Cell>
                              <Table.Cell>Local Dev</Table.Cell>
                              <Table.Cell>
                                <Flex gap="2" justify="end">
                                  <Button
                                    type="button"
                                    size="1"
                                    variant="soft"
                                    color="gray"
                                    title="Open in 3D Viewport"
                                    onClick={() => onOpenSampleIn3D(s.id)}
                                  >
                                    <ExternalLink size={12} />
                                    Open 3D
                                  </Button>
                                  <Button
                                    type="button"
                                    size="1"
                                    title="Create new candidate implant"
                                    onClick={() => onCreateCandidate(s.id)}
                                  >
                                    <Plus size={12} />
                                    Candidate
                                  </Button>
                                  <Button
                                    type="button"
                                    size="1"
                                    variant="soft"
                                    color="red"
                                    onClick={() => onDeleteSample(s.id)}
                                  >
                                    Delete Sample
                                  </Button>
                                </Flex>
                              </Table.Cell>
                            </Table.Row>
                          ))}

                          {visibleCandidates.map((cand) => {
                            const candRevs = revisions.filter(
                              (r) => r.candidateId === cand.objectId,
                            )
                            const currentRev = revisions.find(
                              (r) => r.id === cand.currentRevisionId,
                            )
                            const revOrder = currentRev?.order ?? 0

                            return (
                              <Table.Row key={cand.objectId}>
                                <Table.RowHeaderCell>
                                  <Flex direction="column" gap="1">
                                    <Text weight="medium">{cand.displayName ?? cand.objectId}</Text>
                                    <Text size="1" color="gray">Implant reconstruction</Text>
                                  </Flex>
                                </Table.RowHeaderCell>
                                <Table.Cell>
                                  <Badge color="blue" variant="soft">
                                    <Circle size={8} /> Implant Candidate
                                  </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="2" color="gray">
                                    Revision {revOrder} ({candRevs.length} checkpoints)
                                  </Text>
                                </Table.Cell>
                                <Table.Cell>Local Dev</Table.Cell>
                                <Table.Cell>
                                  <Flex gap="2" justify="end">
                                    <Button
                                      type="button"
                                      size="1"
                                      variant="soft"
                                      color="gray"
                                      onClick={() => onOpenCandidateIn3D(cand.objectId)}
                                    >
                                      <ExternalLink size={12} />
                                      Edit 3D
                                    </Button>
                                    <Button
                                      type="button"
                                      size="1"
                                      variant="soft"
                                      color="red"
                                      onClick={() => onDeleteCandidate(cand.objectId)}
                                    >
                                      Delete Candidate
                                    </Button>
                                  </Flex>
                                </Table.Cell>
                              </Table.Row>
                            )
                          })}
                        </Table.Body>
                      </Table.Root>
                    </Card>
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
