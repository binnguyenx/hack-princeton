import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from './api/client'
import type { Object3D } from 'three'
import { installDebugBridge } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import { applyPoseToObject } from './geometry/pose'
import type { Mat4, SpatialMeta } from './domain/types'
import {
  closeDocument,
  navigateCamera,
  openDocument,
  setActiveDocument,
} from './ops'
import {
  fetchPreparedSample,
  loadSampleCatalog,
  type SampleCatalogEntry,
} from './ops/importPrepared'
import { editorStore } from './state/store'
import type { ProjectSummary, EditorState } from './domain/types'
import { Sidebar, type NavItem } from './ui/Sidebar'
import { AppHeader } from './ui/AppHeader'
import { ProjectsHome } from './ui/ProjectsHome'
import { CaseTableView } from './ui/CaseTableView'
import { DocumentTaskbar } from './ui/DocumentTaskbar'
import { ToolRail, type ToolId } from './ui/ToolRail'
import { Inspector } from './ui/Inspector'
import { Viewport } from './viewport/Viewport'
import { NewProjectDialog } from './ui/dialogs/NewProjectDialog'
import { NewCaseDialog } from './ui/dialogs/NewCaseDialog'
import { ImportSampleDialog } from './ui/dialogs/ImportSampleDialog'

const ctx = { store: editorStore }

const nudgePose: Mat4 = [
  1, 0, 0, 8,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export default function App() {
  const [nav, setNav] = useState<NavItem>('projects')
  const [activeTool, setActiveTool] = useState<ToolId>('navigate')
  const [message, setMessage] = useState<string | null>(null)
  const [signal, setSignal] = useState(false)
  const [mesh, setMesh] = useState<Object3D | null>(null)
  const [viewportStatus, setViewportStatus] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SampleCatalogEntry[]>([])

  // Modal Dialog states (replacing window.prompt)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  const [importSampleOpen, setImportSampleOpen] = useState(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const state = useMemo(() => editorStore.getState(), [tick])

  const setStoreFromManifest = useCallback((manifest: {
    user: EditorState['user']
    project: EditorState['project']
    cases: EditorState['cases']
    samples: EditorState['samples']
    candidates: EditorState['candidates']
    revisions: EditorState['revisions']
    viewState: EditorState['view']
    openDocuments?: EditorState['openDocuments']
    activeDocumentId?: string | null
  }) => {
    editorStore.setState({
      user: manifest.user,
      project: manifest.project,
      cases: manifest.cases,
      samples: manifest.samples,
      candidates: manifest.candidates,
      revisions: manifest.revisions,
      view: manifest.viewState,
      volumes: new Map(),
      dirty: false,
      openDocuments: manifest.openDocuments ?? [],
      activeDocumentId: manifest.activeDocumentId ?? null,
    })
    setActiveProjectId(manifest.project.id)
    setSelectedCaseId((prev) =>
      manifest.cases.some((c) => c.id === prev) ? prev : (manifest.cases[0]?.id ?? null),
    )
    refresh()
  }, [refresh])

  const loadProject = useCallback(async (projectId: string) => {
    const manifest = await apiClient.getProjectManifest(projectId)
    setStoreFromManifest(manifest)
  }, [setStoreFromManifest])

  const refreshProjects = useCallback(async () => {
    const rows = await apiClient.listProjects()
    setProjects(rows)
  }, [])

  useEffect(() => {
    installDebugBridge(ctx)
    void refreshProjects().catch((e) => {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    })
    void loadSampleCatalog()
      .then(setCatalog)
      .catch((e) => {
        setSignal(true)
        setMessage(e instanceof Error ? e.message : String(e))
      })
  }, [refreshProjects])

  // Auto-select first case if none selected
  useEffect(() => {
    if (state?.cases && state.cases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(state.cases[0].id)
    }
  }, [state?.cases, selectedCaseId])

  useEffect(() => {
    if (nav !== 'canvas') return
    void rebuildMeshForActiveDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when tab/tick changes
  }, [nav, state?.activeDocumentId, state?.revisions.length, tick])

  async function ensureVolumeLoaded(docId: string): Promise<void> {
    const st = editorStore.getState()
    if (!st) return
    const sample = st.samples.find((s) => s.id === docId)
    if (!sample) {
      const cand = st.candidates.find((c) => c.objectId === docId)
      if (!cand) return
      const source = st.samples.find((s) => s.id === cand.sampleId)
      if (!source) return
      if (st.volumes.has(source.sourceAnatomy.volumeId)) return
      const bytes = await apiClient.fetchSampleVolume(source.id)
      editorStore.update((curr) => {
        const nextVolumes = new Map(curr.volumes)
        nextVolumes.set(source.sourceAnatomy.volumeId, bytes)
        return { ...curr, volumes: nextVolumes }
      })
      return
    }
    if (st.volumes.has(sample.sourceAnatomy.volumeId)) return
    const bytes = await apiClient.fetchSampleVolume(sample.id)
    editorStore.update((curr) => {
      const nextVolumes = new Map(curr.volumes)
      nextVolumes.set(sample.sourceAnatomy.volumeId, bytes)
      return { ...curr, volumes: nextVolumes }
    })
  }

  async function rebuildMeshForActiveDocument() {
    const st = editorStore.getState()
    if (!st?.activeDocumentId) {
      setMesh(null)
      setViewportStatus('Select or open an anatomy asset to view in 3D')
      return
    }
    const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
    if (!doc) {
      setMesh(null)
      return
    }

    let volumeId: string | undefined
    let spatial: SpatialMeta | null = null
    let pose: Mat4 | null = null

    if (doc.kind === 'sample') {
      const sample = st.samples.find((s) => s.id === doc.id)
      if (!sample) {
        setViewportStatus('Sample volume missing')
        return
      }
      volumeId = sample.sourceAnatomy.volumeId
      spatial = sample.sourceAnatomy.spatial
    } else {
      const cand = st.candidates.find((c) => c.objectId === doc.id)
      if (!cand) {
        setViewportStatus('Candidate record missing')
        return
      }
      const rev = st.revisions.find((r) => r.id === cand.currentRevisionId)
      if (!rev) {
        setViewportStatus('Revision missing')
        return
      }
      volumeId = rev.volumeId
      const sample = st.samples.find((s) => s.id === cand.sampleId)
      spatial = sample?.sourceAnatomy.spatial ?? null
      pose = rev.pose
    }

    if (!volumeId || !spatial) {
      setViewportStatus('No geometry for active document')
      return
    }
    if (!st.volumes.get(volumeId)) {
      try {
        await ensureVolumeLoaded(doc.id)
      } catch (e) {
        setSignal(true)
        setMessage(e instanceof Error ? e.message : String(e))
      }
    }
    const bytes = editorStore.getState()?.volumes.get(volumeId)
    if (!bytes) {
      setViewportStatus('Volume bytes missing')
      return
    }

    setViewportStatus('Reconstructing anatomical surface…')
    await new Promise((r) => setTimeout(r, 16))
    try {
      const m = volumeToDisplayMesh(bytes, spatial, { resolution: 96 })
      if (pose) applyPoseToObject(m, pose)
      setMesh(m)
      setViewportStatus(null)
    } catch (e) {
      setMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Surface reconstruction failed')
    }
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (!e.metaKey && !e.ctrlKey) return
      }
      if (nav === 'canvas') {
        if (e.key === 'v' || e.key === 'V') setActiveTool('select')
        if (e.key === 't' || e.key === 'T') {
          setActiveTool('transform')
        }
        if (e.key === 'Escape') {
          setActiveTool('select')
          setMessage('Transform cancelled')
          setSignal(false)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void onSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void onRestore()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function handleCreateProject(name: string) {
    try {
      const created = await apiClient.createProject(name)
      await refreshProjects()
      await loadProject(created.projectId)
      setNav('cases')
      setSignal(false)
      setMessage(`Created project: ${name}`)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleOpenProject(id: string) {
    try {
      await loadProject(id)
      setNav('cases')
      setSignal(false)
      setMessage(null)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      await apiClient.deleteProject(projectId)
      if (activeProjectId === projectId) {
        editorStore.setState(null)
        setActiveProjectId(null)
        setSelectedCaseId(null)
        setNav('projects')
        refresh()
      }
      await refreshProjects()
      setSignal(false)
      setMessage('Project deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCreateCase(name: string) {
    if (!activeProjectId) {
      setSignal(true)
      setMessage('Open a project first')
      return
    }
    try {
      await apiClient.createCase(activeProjectId, name)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage(`Created case: ${name}`)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteCase(caseId: string) {
    if (!activeProjectId) return
    try {
      await apiClient.deleteCase(activeProjectId, caseId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Case deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleImportSample(catalogId: string) {
    if (!selectedCaseId || !activeProjectId) {
      setSignal(true)
      setMessage('Open a project and select a case first')
      return
    }
    const entry = catalog.find((c) => c.id === catalogId)
    if (!entry) {
      setSignal(true)
      setMessage('Unknown prepared sample')
      return
    }
    try {
      setViewportStatus('Importing prepared NRRD volume…')
      const { bytes, meta } = await fetchPreparedSample(entry)
      const imported = await apiClient.importSample(activeProjectId, selectedCaseId, {
        displayName: entry.label,
        spatiallyVerified: true,
        meta: meta.spatial,
        bytes,
        filename: entry.primaryVolume,
      })
      await loadProject(activeProjectId)
      openDocument(ctx, { kind: 'sample', id: imported.sampleId })
      setMessage(
        imported.spatiallyVerified
          ? `Imported and spatially verified: ${entry.label}`
          : `Imported ${entry.label} (unverified — candidate creation blocked)`,
      )
      setSignal(false)
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteSample(sampleId: string) {
    if (!activeProjectId) return
    try {
      await apiClient.deleteSample(sampleId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Sample deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function activeCandidateId(): string | null {
    const st = editorStore.getState()
    if (!st?.activeDocumentId) return null
    const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
    if (doc?.kind === 'candidate') return doc.id
    return null
  }

  async function onSave() {
    setSignal(false)
    setMessage('All management changes are already persisted')
  }

  async function onRestore() {
    const candidateId = activeCandidateId()
    if (!candidateId) {
      setSignal(true)
      setMessage('Open a candidate tab to restore')
      return
    }
    const st = editorStore.getState()
    if (!st) return
    const cand = st.candidates.find((c) => c.objectId === candidateId)
    if (!cand) return
    const revs = st.revisions
      .filter((r) => r.candidateId === cand.objectId)
      .sort((a, b) => a.order - b.order)
    if (revs.length < 2) {
      setMessage('No earlier revision recorded yet')
      return
    }
    const prev = revs[revs.length - 2]
    try {
      await apiClient.restoreRevision(cand.objectId, prev.id)
      if (activeProjectId) await loadProject(activeProjectId)
      setSignal(false)
      setMessage(`Restored revision R${prev.order}`)
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function applyTransform() {
    const candidateId = activeCandidateId()
    if (!candidateId) {
      setSignal(true)
      setMessage('Open a candidate tab, then Transform')
      return
    }
    try {
      await apiClient.transformCandidate(candidateId, [...nudgePose])
      if (activeProjectId) await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Transform committed (new revision)')
      setActiveTool('select')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCreateCandidate(sampleId: string) {
    if (!activeProjectId) {
      setSignal(true)
      setMessage('Open a project first')
      return
    }
    try {
      const created = await apiClient.createCandidate(sampleId)
      await loadProject(activeProjectId)
      openDocument(ctx, { kind: 'candidate', id: created.candidateId })
      setSignal(false)
      setMessage('Implant candidate created (Revision 0 initialized)')
      setNav('canvas')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteCandidate(candidateId: string) {
    if (!activeProjectId) return
    try {
      await apiClient.deleteCandidate(candidateId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Candidate deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function handleOpenSampleIn3D(sampleId: string) {
    openDocument(ctx, { kind: 'sample', id: sampleId })
    setNav('canvas')
    refresh()
  }

  function handleOpenCandidateIn3D(candidateId: string) {
    openDocument(ctx, { kind: 'candidate', id: candidateId })
    setNav('canvas')
    refresh()
  }

  const selectedCase = state?.cases.find((c) => c.id === selectedCaseId)
  const isCandidateActive = activeCandidateId() !== null

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={nav}
        onSelectNav={setNav}
        currentProject={state?.project ?? null}
        projects={projects}
        onOpenProject={handleOpenProject}
        onNewProject={() => setNewProjectOpen(true)}
        isDirty={state?.dirty}
      />

      <main className="app-main">
        <AppHeader
          projectName={state?.project.name}
          caseName={selectedCase?.name}
          isDirty={state?.dirty}
          onSave={() => void onSave()}
          onNewCase={() => setNewCaseOpen(true)}
          onImportSample={() => setImportSampleOpen(true)}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenPackage={() => {
            setMessage('Opening local package file picker…')
          }}
          onNavigateHome={() => setNav('projects')}
        />

        <div className="app-content">
          {nav === 'projects' ? (
            <ProjectsHome
              projects={projects}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onDeleteProject={(id) => void handleDeleteProject(id)}
              onOpenPackage={() => {
                setMessage('Opening local package…')
              }}
            />
          ) : null}

          {nav === 'cases' && state?.project ? (
            <CaseTableView
              cases={state.cases}
              samples={state.samples}
              candidates={state.candidates}
              revisions={state.revisions}
              selectedCaseId={selectedCaseId}
              onSelectCase={setSelectedCaseId}
              onOpenSampleIn3D={handleOpenSampleIn3D}
              onOpenCandidateIn3D={handleOpenCandidateIn3D}
              onCreateCandidate={handleCreateCandidate}
              onImportSample={(caseId) => {
                setSelectedCaseId(caseId)
                setImportSampleOpen(true)
              }}
              onDeleteCase={(caseId) => void handleDeleteCase(caseId)}
              onDeleteSample={(sampleId) => void handleDeleteSample(sampleId)}
              onDeleteCandidate={(candidateId) => void handleDeleteCandidate(candidateId)}
              onSwitchToCanvas={() => setNav('canvas')}
            />
          ) : null}

          {nav === 'canvas' ? (
            <div className="studio-canvas-workspace">
              <DocumentTaskbar
                documents={state?.openDocuments ?? []}
                activeDocumentId={state?.activeDocumentId ?? null}
                isDirty={state?.dirty}
                labelFor={(d) => {
                  if (!state) return d.id
                  if (d.kind === 'sample') {
                    return state.samples.find((s) => s.id === d.id)?.displayName ?? d.id
                  }
                  return (
                    state.candidates.find((c) => c.objectId === d.id)?.displayName ??
                    d.id
                  )
                }}
                onActivate={(kind, id) => {
                  setActiveDocument(ctx, { kind, id })
                  refresh()
                }}
                onClose={(kind, id) => {
                  closeDocument(ctx, { kind, id })
                  refresh()
                }}
              />

              <div className="studio-viewport-container">
                <ToolRail
                  active={activeTool}
                  onSelect={setActiveTool}
                  onAction={(id) => {
                    if (id === 'restore') {
                      void onRestore()
                    } else if (id === 'save') {
                      void onSave()
                    }
                  }}
                  onApplyTransform={() => void applyTransform()}
                  onCancelTransform={() => {
                    setActiveTool('select')
                    setMessage('Transform cancelled')
                    setSignal(false)
                  }}
                  message={message}
                  signal={signal}
                  isCandidateActive={isCandidateActive}
                />

                <Viewport
                  navigate={activeTool === 'navigate'}
                  mesh={mesh}
                  status={viewportStatus}
                  onCameraChange={(position, target) => {
                    navigateCamera(ctx, { position, target })
                  }}
                />

                <Inspector
                  state={state}
                  activeTool={activeTool}
                  onRestoreRevision={(candidateId, revisionId) => {
                    void (async () => {
                      try {
                        await apiClient.restoreRevision(candidateId, revisionId)
                        if (activeProjectId) await loadProject(activeProjectId)
                        setSignal(false)
                        setMessage('Revision restored')
                        refresh()
                      } catch (e) {
                        setSignal(true)
                        setMessage(e instanceof Error ? e.message : String(e))
                      }
                    })()
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Accessible Radix Modals */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />

      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        onCreate={handleCreateCase}
      />

      <ImportSampleDialog
        open={importSampleOpen}
        onOpenChange={setImportSampleOpen}
        catalog={catalog}
        selectedCaseName={selectedCase?.name}
        onImport={(catalogId) => void handleImportSample(catalogId)}
      />

    </div>
  )
}
