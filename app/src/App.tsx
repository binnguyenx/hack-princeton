import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { voxelClient, type VoxelParameters } from './api/voxelOperations'
import { VoxelControls } from './ui/VoxelControls'
import { landmarkClient } from './api/landmarks'
import { LandmarkControls } from './ui/LandmarkControls'
import { apiClient } from './api/client'
import { packageClient, startPackageDownload } from './api/packages'
import { OpenPackageDialog } from './ui/dialogs/OpenPackageDialog'
import type { Object3D } from 'three'
import { installDebugBridge, registerCanvasCommandDispatcher, updateCanvasRuntime, readCanvasRuntime } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import { loadDisplayMeshAsset } from './geometry/displayMesh'
import { resolveTrustedDisplayMesh } from './geometry/trustedDisplayMesh'
import { applyPoseToObject } from './geometry/pose'
import { buildPlacementPose, isRigidPose, samePose, type PlacementDelta } from './geometry/rigidPlacement'
import { RigidPlacementControls } from './ui/RigidPlacementControls'
import { decodeNrrdVoxels } from './geometry/nrrdVoxels'
import { ijkToRas, type Vec3 } from './geometry/coordinates'
import {
  volumeIntensityRange,
  type IjkPoint,
  type VolumeSizes,
} from './geometry/slices'
import type { Mat4, SpatialMeta } from './domain/types'
import { resolveShortcut } from './commands/shortcuts'
import { buildCanvasCommands, type CommandId } from './commands/registry'
import {
  closeDocument,
  navigateCamera,
  openDocument,
  selectObject,
  setVisibility,
  showAllObjects,
  getActiveObjectId,
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
import type { ToolId } from './ui/ToolRail'
import { Inspector } from './ui/Inspector'
import { MenuBar } from './ui/MenuBar'
import { CommandPalette } from './ui/CommandPalette'
import { CanvasWorkspace, type CanvasMode } from './ui/CanvasWorkspace'
import { CANVAS_HINTS } from './ui/canvasFeatureHints'
import { FeatureHint } from './ui/FeatureHint'
import { ViewController } from './ui/ViewController'
import {
  DEFAULT_LIGHTING_INTENSITY,
  Viewport,
  type CameraMotionMode,
  type ProjectionMode,
  type ViewPreset,
} from './viewport/Viewport'
import { NewProjectDialog } from './ui/dialogs/NewProjectDialog'
import { NewCaseDialog } from './ui/dialogs/NewCaseDialog'
import { ImportSampleDialog } from './ui/dialogs/ImportSampleDialog'

const ctx = { store: editorStore }

export default function App() {
  const [nav, setNav] = useState<NavItem>('projects')
  const [activeTool, setActiveTool] = useState<ToolId>('navigate')
  const [message, setMessage] = useState<string | null>(null)
  const [signal, setSignal] = useState(false)
  const [loadedMesh, setLoadedMesh] = useState<{ object: Object3D; documentId: string } | null>(null)
  const [viewportStatus, setViewportStatus] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SampleCatalogEntry[]>([])
  const [placementDraft, setPlacementDraft] = useState<{ projectId: string; caseId: string; candidateId: string; revisionId: string; base: Mat4; pose: Mat4 | null } | null>(null)
  const placementBusy = useRef(false)
  const [candidateLayer, setCandidateLayer] = useState<{ documentId: string; revisionId: string; voxels: Uint8Array } | null>(null)
  const [candidateLayerReason, setCandidateLayerReason] = useState('Open an identity-pose binary candidate')
  const [landmarksOpen, setLandmarksOpen] = useState(false)
  const [persistentPlace, setPersistentPlace] = useState(false)
  const [landmarkPending, setLandmarkPending] = useState(false)
  const landmarkBusy = useRef(false)
  const voxelBusy = useRef(false)
  const [voxelPending, setVoxelPending] = useState(false)
  const [packageAction, setPackageAction] = useState<'save' | 'open' | null>(null)
  const [packageDialogOpen, setPackageDialogOpen] = useState(false)
  const [packageFeedback, setPackageFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const packageBusy = useRef(false)
  const managementWrites = useRef(0)
  const [managementWriteCount, setManagementWriteCount] = useState(0)
  const [pendingAction, setPendingAction] = useState<null | 'restore' | 'apply'>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [focusNonce, setFocusNonce] = useState(0)
  const [resetNonce, setResetNonce] = useState(0)
  const [viewPreset, setViewPreset] = useState<ViewPreset | null>(null)
  const [viewPresetNonce, setViewPresetNonce] = useState(0)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('view')
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false)
  const [projection, setProjection] = useState<ProjectionMode>('perspective')
  const [crosshairVisible, setCrosshairVisible] = useState(false)
  const [lightingIntensity, setLightingIntensity] = useState(DEFAULT_LIGHTING_INTENSITY)
  const [tiltLock, setTiltLock] = useState(false)
  const [motionMode, setMotionMode] = useState<CameraMotionMode>('none')
  const [rendererNonce, setRendererNonce] = useState(0)
  const [rendererStatus, setRendererStatus] = useState<'ready' | 'lost' | 'restoring'>('ready')
  const [sliceVolume, setSliceVolume] = useState<{
    documentId: string
    voxels: Uint8Array
    sizes: VolumeSizes
  } | null>(null)
  const [sliceStatus, setSliceStatus] = useState<string | null>(null)
  const [crosshairIjk, setCrosshairIjk] = useState<IjkPoint>([0, 0, 0])
  const [windowCenter, setWindowCenter] = useState(127.5)
  const [windowWidth, setWindowWidth] = useState(255)

  // Modal Dialog states (replacing window.prompt)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  const [importSampleOpen, setImportSampleOpen] = useState(false)
  const meshBuildSeqRef = useRef(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const state = useMemo(() => editorStore.getState(), [tick])

  const activeDocument = state?.openDocuments.find((document) => document.id === state.activeDocumentId)
  const activeSample = activeDocument?.kind === 'sample'
    ? state?.samples.find((sample) => sample.id === activeDocument.id)
    : state?.samples.find((sample) =>
        state.candidates.some((candidate) =>
          candidate.objectId === activeDocument?.id && candidate.sampleId === sample.id,
        ),
      )
  const activeCandidate = activeDocument?.kind === 'candidate'
    ? state?.candidates.find((candidate) => candidate.objectId === activeDocument.id)
    : undefined
  const activeObjectId = getActiveObjectId(state)
  const objectVisible = activeObjectId ? state?.view.visibility[activeObjectId] !== false : true
  const mesh = loadedMesh?.documentId === state?.activeDocumentId ? loadedMesh?.object ?? null : null

  const setStoreFromManifest = useCallback((manifest: {
    landmarks?: EditorState['landmarks']
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
      landmarks: manifest.landmarks ?? [],
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
    setPlacementDraft(null)
    setActiveTool('select')
    setActiveProjectId(manifest.project.id)
    setSelectedCaseId((prev) =>
      manifest.cases.some((c) => c.id === prev) ? prev : (manifest.cases[0]?.id ?? null),
    )
    refresh()
  }, [refresh])

  function navigateTo(next: NavItem) {
    if (next !== 'canvas') {
      setPlacementDraft(null)
      setActiveTool('select')
    }
    setNav(next)
  }

  const loadProject = useCallback(async (projectId: string) => {
    const manifest = await apiClient.getProjectManifest(projectId)
    setStoreFromManifest(manifest)
  }, [setStoreFromManifest])

  const refreshProjects = useCallback(async () => {
    const rows = await apiClient.listProjects()
    setProjects(rows)
  }, [])

  useEffect(() => {
    installDebugBridge({ ...ctx, onViewChange: refresh })
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
  }, [refreshProjects, refresh])

  // Auto-select first case if none selected
  useEffect(() => {
    if (state?.cases && state.cases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(state.cases[0].id)
    }
  }, [state?.cases, selectedCaseId])

  useEffect(() => {
    if (nav !== 'canvas') return
    void rebuildMeshForActiveDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when loaded geometry/context changes, never on view selection/visibility
  }, [nav, state?.project.id, activeDocument?.id, activeCandidate?.currentRevisionId,
    activeSample?.sourceAnatomy.volumeId, activeSample?.sourceAnatomy.volumeHash,
    activeSample?.sourceAnatomy.spatial, activeSample?.displayMeshAsset, catalog])

  useEffect(() => {
    if (nav !== 'canvas') return
    const st = editorStore.getState()
    if (!st) return
    if (st.openDocuments.length > 0) return
    if (st.samples.length === 0) return

    const preferred =
      (selectedCaseId
        ? st.samples.find((s) => s.caseId === selectedCaseId)
        : null) ?? st.samples[0]
    if (!preferred) return

    const opened = openDocument(ctx, { kind: 'sample', id: preferred.id })
    if (!opened.ok) {
      setSignal(true)
      setMessage(opened.error)
      return
    }
    setSignal(false)
    setMessage(`Opened sample in 3D: ${preferred.displayName ?? preferred.id}`)
    refresh()
  }, [nav, selectedCaseId, state?.samples.length, state?.openDocuments.length, refresh])

  async function ensureVolumeLoaded(docId: string, expectedVolumeId: string): Promise<void> {
    const st = editorStore.getState()
    if (!st) return
    if (st.volumes.has(expectedVolumeId)) return

    const sample = st.samples.find((s) => s.id === docId)
    if (sample) {
      const bytes = await apiClient.fetchSampleVolume(sample.id)
      editorStore.update((curr) => {
        if (curr.project.id !== st.project.id) return curr
        const nextVolumes = new Map(curr.volumes)
        nextVolumes.set(sample.sourceAnatomy.volumeId, bytes)
        return { ...curr, volumes: nextVolumes }
      })
      return
    }

    const cand = st.candidates.find((c) => c.objectId === docId)
    if (!cand) return
    const source = st.samples.find((s) => s.id === cand.sampleId)
    if (!source) return
    const revision = st.revisions.find((item) => item.id === cand.currentRevisionId && item.volumeId === expectedVolumeId)
    if (!revision) throw new Error('Candidate revision is unavailable')
    const bytes = await apiClient.fetchCandidateRevisionVolume(cand.objectId, revision.id)
    editorStore.update((curr) => {
      if (curr.project.id !== st.project.id) return curr
      const nextVolumes = new Map(curr.volumes)
      nextVolumes.set(expectedVolumeId, bytes)
      return { ...curr, volumes: nextVolumes }
    })
  }

  async function rebuildMeshForActiveDocument() {
    const buildSeq = ++meshBuildSeqRef.current
    const isCurrentBuild = () => meshBuildSeqRef.current === buildSeq
    const st = editorStore.getState()
    if (!st?.activeDocumentId) {
      if (!isCurrentBuild()) return
      setLoadedMesh(null)
      setViewportStatus('Select or open an anatomy asset to view in 3D')
      return
    }
    const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
    if (!doc) {
      if (!isCurrentBuild()) return
      setLoadedMesh(null)
      return
    }

    let volumeId: string | undefined
    let spatial: SpatialMeta | null = null
    let pose: Mat4 | null = null

    if (doc.kind === 'sample') {
      const sample = st.samples.find((s) => s.id === doc.id)
      if (!sample) {
        if (!isCurrentBuild()) return
        setViewportStatus('Sample volume missing')
        return
      }
      volumeId = sample.sourceAnatomy.volumeId
      spatial = sample.sourceAnatomy.spatial
      const displayMeshAsset = await resolveTrustedDisplayMesh(sample, catalog)
      if (!isCurrentBuild()) return
      if (displayMeshAsset) {
        setViewportStatus('Loading realistic mesh…')
        await new Promise((r) => setTimeout(r, 16))
        if (!isCurrentBuild()) return
        try {
          const glb = await loadDisplayMeshAsset(displayMeshAsset)
          if (!isCurrentBuild()) return
          setLoadedMesh({ object: glb, documentId: doc.id })
          setViewportStatus(null)
          return
        } catch {
          // Fall through to reconstructed mesh when asset path does not exist.
          setViewportStatus('Mesh asset missing — reconstructing surface')
        }
      }
    } else {
      const cand = st.candidates.find((c) => c.objectId === doc.id)
      if (!cand) {
        if (!isCurrentBuild()) return
        setViewportStatus('Candidate record missing')
        return
      }
      const rev = st.revisions.find((r) => r.id === cand.currentRevisionId)
      if (!rev) {
        if (!isCurrentBuild()) return
        setViewportStatus('Revision missing')
        return
      }
      volumeId = rev.volumeId
      const sample = st.samples.find((s) => s.id === cand.sampleId)
      spatial = sample?.sourceAnatomy.spatial ?? null
      pose = rev.pose
      const displayMeshAsset = sample && rev.volumeId === sample.sourceAnatomy.volumeId && rev.volumeHash === sample.sourceAnatomy.volumeHash
        ? await resolveTrustedDisplayMesh(sample, catalog) : null
      if (!isCurrentBuild()) return
      if (displayMeshAsset) {
        setViewportStatus('Loading realistic mesh…')
        await new Promise((r) => setTimeout(r, 16))
        if (!isCurrentBuild()) return
        try {
          const glb = await loadDisplayMeshAsset(displayMeshAsset)
          if (!isCurrentBuild()) return
          if (pose) applyPoseToObject(glb, pose)
          setLoadedMesh({ object: glb, documentId: doc.id })
          setViewportStatus(null)
          return
        } catch {
          setViewportStatus('Mesh asset missing — reconstructing surface')
        }
      }
    }

    if (!volumeId || !spatial) {
      if (!isCurrentBuild()) return
      setViewportStatus('No geometry for active document')
      return
    }
    try {
      await ensureVolumeLoaded(doc.id, volumeId)
    } catch (e) {
      if (!isCurrentBuild()) return
      setLoadedMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Failed to load sample volume')
      return
    }
    const bytes = editorStore.getState()?.volumes.get(volumeId)
    if (!bytes) {
      if (!isCurrentBuild()) return
      setLoadedMesh(null)
      setViewportStatus('Volume bytes missing')
      return
    }

    setViewportStatus('Rendering realistic skull surface…')
    await new Promise((r) => setTimeout(r, 16))
    if (!isCurrentBuild()) return
    try {
      const mesh = volumeToDisplayMesh(bytes, spatial, { resolution: 128 })
      if (!isCurrentBuild()) return
      if (pose) applyPoseToObject(mesh, pose)
      setLoadedMesh({ object: mesh, documentId: doc.id })
      setViewportStatus(null)
    } catch (e) {
      if (!isCurrentBuild()) return
      setLoadedMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Realistic surface render failed')
    }
  }

  function handleObjectSelection(objectId: string | null) {
    const current = editorStore.getState()
    if (!current || current.project.id !== state?.project.id || current.activeDocumentId !== activeDocument?.id
      || (objectId !== null && objectId !== getActiveObjectId(current))) return
    const result = selectObject(ctx, objectId)
    setSignal(!result.ok)
    setMessage(result.ok ? (objectId ? 'Object selected' : 'Selection cleared') : result.error)
    refresh()
  }

  function toggleObjectVisibility() {
    const current = editorStore.getState()
    const objectId = getActiveObjectId(current)
    if (!current || !objectId) {
      setSignal(true)
      setMessage('Open a sample or candidate first')
      return
    }
    const visible = current.view.visibility[objectId] === false
    const result = setVisibility(ctx, objectId, visible)
    setSignal(!result.ok)
    setMessage(result.ok ? (visible ? 'Object shown' : 'Object hidden — use Show object to recover') : result.error)
    refresh()
  }

  function showObjects() {
    const result = showAllObjects(ctx)
    setSignal(!result.ok)
    setMessage(result.ok ? 'All objects shown' : result.error)
    refresh()
  }

  function runCommand(id: CommandId) {
    const command = commands.find((item) => item.id === id)
    if (!command || command.disabledReason) {
      setSignal(true)
      setMessage(command?.disabledReason ?? 'Unknown canvas command')
      return
    }
    switch (id) {
      case 'file.saveProject':
        void onSave()
        return
      case 'tool.navigate':
        setActiveTool('navigate')
        return
      case 'tool.select':
        setCanvasMode('view')
        setActiveTool('select')
        return
      case 'tool.transform':
        if (!isCandidateActive) {
          setSignal(true)
          setMessage('Open a candidate tab to transform')
          return
        }
        startPlacement()
        return
      case 'object.applyDraft':
        if (!isDraftActive) return
        void applyTransform()
        return
      case 'object.cancelDraft':
      case 'select.clear':
        if (placementBusy.current) return
        if (canvasMode === 'place') {
          setCanvasMode('view'); setMessage('Placement stopped; saved landmarks retained'); return
        }
        if (isDraftActive) {
          setActiveTool('select')
          setSignal(false)
          setMessage('Transform cancelled')
        }
        selectObject(ctx, null)
        refresh()
        return
      case 'object.restoreRevision':
      case 'edit.undo':
        void onRestore()
        return
      case 'window.commandSearch':
        setCommandPaletteOpen(true)
        return
      case 'view.reset':
        setResetNonce((n) => n + 1)
        return
      case 'view.toggleTiltLock':
        setTiltLock((value) => !value)
        return
      case 'view.toggleProjection':
        setProjection((value) => value === 'perspective' ? 'orthographic' : 'perspective')
        return
      case 'view.focus':
        setFocusNonce((n) => n + 1)
        setSignal(false)
        setMessage('Focused active document')
        return
      case 'view.standardAnterior':
        setViewPreset('anterior')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.standardPosterior':
        setViewPreset('posterior')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.standardLeft':
        setViewPreset('left')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.standardRight':
        setViewPreset('right')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.standardSuperior':
        setViewPreset('superior')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.standardInferior':
        setViewPreset('inferior')
        setViewPresetNonce((n) => n + 1)
        return
      case 'view.toggleVisibility':
        toggleObjectVisibility()
        return
      case 'view.showAll':
        showObjects()
        return
      case 'edit.redo':
        void onRestore(1)
        return
      default:
        return
    }
  }

  // A single resolver keeps visible command labels, UI and keyboard dispatch aligned.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const command = resolveShortcut(event, { canvas: nav === 'canvas',
        editable: Boolean(target?.closest('input,textarea,select,[contenteditable="true"]')),
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        threeD: readCanvasRuntime().activeView === 'three-d' })
      if (!command) return
      event.preventDefault()
      runCommand(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function handleCreateProject(name: string) {
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      const created = await apiClient.createProject(name)
      await refreshProjects()
      await loadProject(created.projectId)
      navigateTo('cases')
      setSignal(false)
      setMessage(`Created project: ${name}`)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function handleOpenProject(id: string) {
    try {
      await loadProject(id)
      navigateTo('cases')
      setSignal(false)
      setMessage(null)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      await apiClient.deleteProject(projectId)
      if (activeProjectId === projectId) {
        editorStore.setState(null)
        setActiveProjectId(null)
        setSelectedCaseId(null)
        navigateTo('projects')
        refresh()
      }
      await refreshProjects()
      setSignal(false)
      setMessage('Project deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function handleCreateCase(name: string) {
    if (!activeProjectId) {
      setSignal(true)
      setMessage('Open a project first')
      return
    }
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      await apiClient.createCase(activeProjectId, name)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage(`Created case: ${name}`)
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function handleDeleteCase(caseId: string) {
    if (!activeProjectId) return
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      await apiClient.deleteCase(activeProjectId, caseId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Case deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
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
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
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
      const isSkullBreak = (meta.source ?? '').toLowerCase().includes('skullbreak')
      const skullBreakNote = isSkullBreak
        ? ' Note: this source is a SkullBreak cranial-segment mask, not a full head volume.'
        : ''
      setMessage(
        imported.spatiallyVerified
          ? `Imported and spatially verified: ${entry.label}.${skullBreakNote}`
          : `Imported ${entry.label} (unverified — candidate creation blocked).${skullBreakNote}`,
      )
      setSignal(false)
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function handleDeleteSample(sampleId: string) {
    if (!activeProjectId) return
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      await apiClient.deleteSample(sampleId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Sample deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function executeVoxels(parameters: VoxelParameters) {
    if (voxelBusy.current || packageBusy.current || pendingAction || managementWrites.current || isDraftActive || !activeCandidate || !activeSample || !state) return
    const projectId = state.project.id, candidateId = activeCandidate.objectId
    voxelBusy.current = true; setVoxelPending(true)
    managementWrites.current++; setManagementWriteCount(managementWrites.current)
    let committed = false
    try {
      const result = await voxelClient.execute(candidateId, { project_id: projectId, case_id: activeSample.caseId,
        expected_revision_id: activeCandidate.currentRevisionId }, parameters)
      committed = true
      if (editorStore.getState()?.project.id === projectId) {
        await loadProject(projectId)
        openDocument(ctx, { kind: 'candidate', id: candidateId })
      }
      setSignal(false); setMessage(`Candidate volume revision saved · ${result.changedVoxels} voxels changed`); refresh()
    } catch (error) {
      setSignal(true); setMessage(committed ? 'Voxel revision committed, but opening failed. Reload the project; do not repeat the operation.'
        : `${error instanceof Error ? error.message : String(error)}. Reload before retrying an uncertain request.`)
    } finally {
      voxelBusy.current = false; setVoxelPending(false)
      managementWrites.current--; setManagementWriteCount(managementWrites.current)
    }
  }

  async function changeLandmark(point: IjkPoint | string) {
    if (landmarkBusy.current || packageBusy.current || pendingAction || isDraftActive || !activeSample || !state) return
    if (!activeSample.spatiallyVerified || activeSample.sourceAnatomy.spatial.units !== 'mm' || !activeSliceVolume) {
      setSignal(true); setMessage('Source landmarks require decoded verified millimetre data'); return
    }
    const sample = activeSample, projectId = state.project.id, documentId = state.activeDocumentId
    const context = { projectId, caseId: sample.caseId, volumeHash: sample.sourceAnatomy.volumeHash }
    landmarkBusy.current = true; setLandmarkPending(true)
    managementWrites.current++; setManagementWriteCount(managementWrites.current)
    try {
      if (typeof point === 'string') {
        await landmarkClient.delete(sample.id, point, context)
        if (editorStore.getState()?.project.id === projectId) editorStore.update((current) => ({ ...current,
          landmarks: (current.landmarks ?? []).filter((item) => item.id !== point) }))
      } else {
        const used = new Set((state.landmarks ?? []).filter((item) => item.sampleId === sample.id).map((item) => item.label))
        let index = 1
        while (used.has(`P${index}`)) index++
        const saved = await landmarkClient.create(sample.id, context, point, `P${index}`)
        if (editorStore.getState()?.project.id === projectId) editorStore.update((current) => ({ ...current,
          landmarks: [...(current.landmarks ?? []), saved] }))
        if (!persistentPlace && editorStore.getState()?.activeDocumentId === documentId) setCanvasMode('view')
      }
      setSignal(false); setMessage(typeof point === 'string' ? 'Source landmark deleted' : 'Source landmark saved · RAS millimetres')
      setLandmarksOpen(true); refresh()
    } catch (error) {
      setSignal(true); setMessage(`${error instanceof Error ? error.message : String(error)}. Check saved landmarks before retrying.`)
    } finally {
      landmarkBusy.current = false; setLandmarkPending(false)
      managementWrites.current--; setManagementWriteCount(managementWrites.current)
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
    if (packageBusy.current) return
    if (isDraftActive || pendingAction || managementWrites.current || placementBusy.current || packageDialogOpen) {
      setPackageFeedback({ error: true, text: 'Apply or cancel the draft and finish pending actions before saving a package.' })
      return
    }
    const current = editorStore.getState()
    if (!current || !activeProjectId || current.project.id !== activeProjectId) {
      setPackageFeedback({ error: true, text: 'Open a stored project before saving a package.' })
      return
    }
    const presentation = { viewState: structuredClone(current.view), openDocuments: current.openDocuments,
      activeDocumentId: current.activeDocumentId }
    const canvas = readCanvasRuntime()
    if (nav === 'canvas' && activeObjectId && canvas.objectWorldMatrices[activeObjectId]) {
      presentation.viewState.camera = { position: canvas.camera.position, target: canvas.camera.target }
    }
    packageBusy.current = true
    setPackageAction('save')
    setPackageFeedback({ error: false, text: 'Preparing project package…' })
    try {
      const blob = await packageClient.export(current.project.id, presentation)
      startPackageDownload(blob, current.project.id)
      setPackageFeedback({ error: false, text: `Package download started for ${current.project.name}.` })
    } catch (error) {
      setPackageFeedback({ error: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      packageBusy.current = false
      setPackageAction(null)
    }
  }

  function openPackageDialog() {
    if (packageBusy.current || packageDialogOpen) return
    if (isDraftActive || pendingAction || managementWrites.current || placementBusy.current) {
      setPackageFeedback({ error: true, text: 'Apply or cancel the draft and finish pending actions before opening a package.' })
      return
    }
    setPackageFeedback(null)
    setPackageDialogOpen(true)
  }

  async function importPackage(file: File) {
    if (packageBusy.current || isDraftActive || pendingAction || managementWrites.current || placementBusy.current) throw new Error('Finish pending actions before importing.')
    packageBusy.current = true
    setPackageAction('open')
    try {
      const imported = await packageClient.importCopy(file)
      setPackageDialogOpen(false)
      try {
        // The archive never directly replaces the app's authoritative records in memory.
        const manifest = await apiClient.getProjectManifest(imported.projectId)
        setStoreFromManifest(manifest)
        editorStore.update((current) => ({ ...current, view: imported.presentation.viewState,
          openDocuments: imported.presentation.openDocuments, activeDocumentId: imported.presentation.activeDocumentId }))
        const document = imported.presentation.openDocuments.find((item) => item.id === imported.presentation.activeDocumentId)
        const sampleId = document?.kind === 'sample' ? document.id
          : manifest.candidates.find((item) => item.objectId === document?.id)?.sampleId
        const sample = manifest.samples.find((item) => item.id === sampleId)
        if (sample) setSelectedCaseId(sample.caseId)
        navigateTo(document ? 'canvas' : 'cases')
        refresh()
        const listed = await refreshProjects().then(() => true, () => false)
        setPackageFeedback({ error: !listed, text: listed ? 'Package imported and opened as a new project copy.'
          : 'Package imported and opened. Project list refresh failed; reload to update the list.' })
      } catch {
        // Import committed already. Never retry it or report a rollback because a GET failed.
        setPackageFeedback({ error: true, text: 'Package was imported, but opening the new copy failed. Reload Projects to open it; do not import again.' })
        await refreshProjects().catch(() => undefined)
        navigateTo('projects')
      }
    } finally {
      packageBusy.current = false
      setPackageAction(null)
    }
  }

  async function onRestore(direction = -1) {
    if (pendingAction) return
    if (isDraftActive) {
      setSignal(true)
      setMessage('Cancel or apply transform before restore')
      return
    }
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
    const currentIdx = revs.findIndex((r) => r.id === cand.currentRevisionId)
    if (currentIdx < 0) {
      setSignal(true)
      setMessage('Current revision pointer is invalid')
      return
    }
    if (currentIdx + direction < 0 || currentIdx + direction >= revs.length) {
      setSignal(false)
      setMessage(direction < 0 ? 'Already at earliest revision' : 'Already at latest revision')
      return
    }
    const prev = revs[currentIdx + direction]
    try {
      setPendingAction('restore')
      await apiClient.restoreRevision(cand.objectId, prev.id)
      if (activeProjectId) {
        await loadProject(activeProjectId)
        openDocument(ctx, { kind: 'candidate', id: cand.objectId })
      }
      setSignal(false)
      setMessage(`Restored revision R${prev.order}`)
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPendingAction(null)
    }
  }

  async function restoreCandidateRevision(candidateId: string, revisionId: string) {
    if (pendingAction) return
    if (isDraftActive) {
      setSignal(true)
      setMessage('Cancel or apply transform before restore')
      return
    }
    const st = editorStore.getState()
    const cand = st?.candidates.find((c) => c.objectId === candidateId)
    if (!cand) {
      setSignal(true)
      setMessage('Candidate record missing')
      return
    }
    if (cand.currentRevisionId === revisionId) {
      setSignal(false)
      setMessage('Revision already active')
      return
    }
    try {
      setPendingAction('restore')
      await apiClient.restoreRevision(candidateId, revisionId)
      if (activeProjectId) {
        await loadProject(activeProjectId)
        openDocument(ctx, { kind: 'candidate', id: candidateId })
      }
      setSignal(false)
      setMessage('Revision restored')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPendingAction(null)
    }
  }

  function startPlacement() {
    if (pendingAction || placementBusy.current || isDraftActive) return
    const st = editorStore.getState()
    const candidateId = activeCandidateId()
    const candidate = st?.candidates.find((item) => item.objectId === candidateId)
    const revision = st?.revisions.find((item) => item.id === candidate?.currentRevisionId)
    const sample = st?.samples.find((item) => item.id === candidate?.sampleId)
    if (!st || !candidate || !revision || !sample || !sample.spatiallyVerified
      || sample.sourceAnatomy.spatial.units !== 'mm' || !isRigidPose(revision.pose)) {
      setSignal(true)
      setMessage('Manual placement requires a candidate with verified millimetre metadata and a valid rigid pose')
      return
    }
    setPlacementDraft({ projectId: st.project.id, caseId: sample.caseId, candidateId: candidate.objectId,
      revisionId: revision.id, base: revision.pose, pose: revision.pose })
    setActiveTool('transform')
    setSignal(false)
    setMessage('Enter placement deltas; Apply saves a new revision')
  }

  function previewPlacement(delta: PlacementDelta) {
    setPlacementDraft((draft) => {
      if (!draft) return draft
      try { return { ...draft, pose: buildPlacementPose(draft.base, delta) } }
      catch { return { ...draft, pose: null } }
    })
  }

  async function applyTransform() {
    if (pendingAction || placementBusy.current || !canApplyPlacement || !placementDraft?.pose) return
    const draft = placementDraft
    const st = editorStore.getState()
    const current = st?.candidates.find((candidate) => candidate.objectId === draft.candidateId)
    if (st?.project.id !== draft.projectId || st.activeDocumentId !== draft.candidateId
      || current?.currentRevisionId !== draft.revisionId) {
      setSignal(true)
      setMessage('Placement context changed; restart Transform')
      return
    }
    placementBusy.current = true
    try {
      setPendingAction('apply')
      await apiClient.placeCandidate(draft.candidateId, { project_id: draft.projectId,
        case_id: draft.caseId, expected_revision_id: draft.revisionId, pose: draft.pose! })
      await loadProject(draft.projectId)
      openDocument(ctx, { kind: 'candidate', id: draft.candidateId })
      setSignal(false)
      setMessage('Manual placement committed (new revision)')
      setPlacementDraft(null)
      setActiveTool('select')
      refresh()
    } catch (error) {
      setSignal(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      placementBusy.current = false
      setPendingAction(null)
    }
  }

  async function handleCreateCandidate(sampleId: string) {
    if (!activeProjectId) {
      setSignal(true)
      setMessage('Open a project first')
      return
    }
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      const created = await apiClient.createCandidate(sampleId)
      await loadProject(activeProjectId)
      openDocument(ctx, { kind: 'candidate', id: created.candidateId })
      setSignal(false)
      setMessage('Implant candidate created (Revision 0 initialized)')
      navigateTo('canvas')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  async function handleDeleteCandidate(candidateId: string) {
    if (!activeProjectId) return
    if (packageBusy.current) return
    managementWrites.current++
    setManagementWriteCount(managementWrites.current)
    try {
      await apiClient.deleteCandidate(candidateId)
      await loadProject(activeProjectId)
      setSignal(false)
      setMessage('Candidate deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      managementWrites.current--
      setManagementWriteCount(managementWrites.current)
    }
  }

  function handleOpenSampleIn3D(sampleId: string) {
    setPlacementDraft(null)
    setActiveTool('select')
    openDocument(ctx, { kind: 'sample', id: sampleId })
    navigateTo('canvas')
    refresh()
  }

  function handleOpenCandidateIn3D(candidateId: string) {
    setPlacementDraft(null)
    setActiveTool('select')
    openDocument(ctx, { kind: 'candidate', id: candidateId })
    navigateTo('canvas')
    refresh()
  }

  const selectedCase = state?.cases.find((c) => c.id === selectedCaseId)
  const isCandidateActive = activeCandidateId() !== null
  const selectionObjectId = state?.view.selectionObjectId ?? null
  const activeDocumentName =
    activeCandidate?.displayName ?? activeSample?.displayName ?? 'No active anatomy'
  const volumeAvailable = Boolean(sliceVolume && sliceVolume.documentId === activeDocument?.id)
  const activeSliceVolume =
    sliceVolume?.documentId === activeDocument?.id ? sliceVolume : null
  const crosshairRas: Vec3 = activeSample
    ? ijkToRas(activeSample.sourceAnatomy.spatial, crosshairIjk)
    : [0, 0, 0]
  const currentPlacement = placementDraft && placementDraft.projectId === state?.project.id
    && placementDraft.candidateId === activeCandidate?.objectId
    && placementDraft.revisionId === activeCandidate?.currentRevisionId ? placementDraft : null
  const isDraftActive = activeTool === 'transform' && nav === 'canvas' && currentPlacement !== null
  const canApplyPlacement = Boolean(isDraftActive && currentPlacement?.pose && !samePose(currentPlacement.base, currentPlacement.pose))
  const renderMesh = useMemo(() => {
    if (!mesh || !isDraftActive || !currentPlacement?.pose) return mesh
    const preview = mesh.clone(true)
    applyPoseToObject(preview, currentPlacement.pose)
    return preview
  }, [mesh, isDraftActive, currentPlacement])
  const canRestore = (() => {
    const candidateId = activeCandidateId()
    if (!candidateId || !state) return false
    const candidate = state.candidates.find((c) => c.objectId === candidateId)
    if (!candidate) return false
    const revs = state.revisions.filter((r) => r.candidateId === candidate.objectId)
    return revs.length > 1
  })()
  const packageDisabledReason = packageAction ? 'Package operation is pending'
    : isDraftActive || pendingAction || managementWriteCount ? 'Apply/cancel the draft and finish pending actions first'
      : packageDialogOpen ? 'Finish the package dialog first' : undefined
  const commands = buildCanvasCommands({
    packageDisabledReason,
    hasProject: !!state?.project,
    hasActiveDocument: !!state?.activeDocumentId,
    isCandidateActive,
    isDraftActive,
    isPlaceMode: canvasMode === 'place',
    canRestore,
    canRedo: Boolean(activeCandidate && state?.revisions.some((r) => r.candidateId === activeCandidate.objectId && r.order > (state.revisions.find((item) => item.id === activeCandidate.currentRevisionId)?.order ?? Infinity))),
    busy: Boolean(pendingAction || packageAction || managementWriteCount),
    hasSelection: !!selectionObjectId,
  })

  useEffect(() => {
    registerCanvasCommandDispatcher((id) => {
      const command = commands.find((item) => item.id === id)
      if (nav !== 'canvas' || !command || command.disabledReason || isDraftActive || packageAction) {
        return { ok: false, error: command?.disabledReason ?? 'Open an idle canvas first' }
      }
      runCommand(id)
      return { ok: true, value: undefined }
    })
    return () => registerCanvasCommandDispatcher(undefined)
  })

  useEffect(() => {
    if (activeTool !== 'transform') return
    if (isCandidateActive) return
    setActiveTool('select')
  }, [activeTool, isCandidateActive])

  useEffect(() => {
    const documentId = activeDocument?.id
    const volumeId = activeSample?.sourceAnatomy.volumeId
    if (!documentId || !volumeId) {
      setSliceVolume(null)
      setSliceStatus(null)
      return
    }
    let cancelled = false
    setSliceStatus('Loading synchronized slices…')
    void (async () => {
      try {
        await ensureVolumeLoaded(activeSample!.id, volumeId)
        if (cancelled) return
        const bytes = editorStore.getState()?.volumes.get(volumeId)
        if (!bytes) throw new Error('Volume bytes are unavailable')
        const decoded = decodeNrrdVoxels(bytes)
        if (decoded.sizes.length < 3 || decoded.sizes.some((size) => !Number.isFinite(size) || size < 1)) {
          throw new Error('Volume dimensions are invalid')
        }
        const sizes: VolumeSizes = [
          decoded.sizes[0],
          decoded.sizes[1],
          decoded.sizes[2],
        ]
        if (sizes.some((value, index) => value !== activeSample?.sourceAnatomy.spatial.sizes[index])) throw new Error('Decoded volume dimensions differ from spatial metadata')
        const requiredVoxels = sizes[0] * sizes[1] * sizes[2]
        if (decoded.voxels.length < requiredVoxels) {
          throw new Error('Volume payload is shorter than its dimensions')
        }
        if (cancelled) return
        const [minimum, maximum] = volumeIntensityRange(
          decoded.voxels.subarray(0, requiredVoxels),
        )
        setWindowCenter((minimum + maximum) / 2)
        setWindowWidth(Math.max(maximum - minimum, 1))
        setSliceVolume({ documentId, voxels: decoded.voxels, sizes })
        setCrosshairIjk([
          Math.floor(sizes[0] / 2),
          Math.floor(sizes[1] / 2),
          Math.floor(sizes[2] / 2),
        ])
        setSliceStatus(null)
      } catch (error) {
        if (cancelled) return
        setSliceVolume(null)
        setSliceStatus(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDocument?.id, activeSample?.sourceAnatomy.volumeId])

  useEffect(() => {
    let cancelled = false
    setCandidateLayer(null)
    const revision = state?.revisions.find((r) => r.id === activeCandidate?.currentRevisionId)
    if (!activeCandidate || !activeSample || !activeSliceVolume || !revision) {
      setCandidateLayerReason('Requires a decoded source and active candidate'); return
    }
    if (!revision.pose.every((n, i) => Math.abs(n - (i % 5 === 0 ? 1 : 0)) < 1e-9)) {
      setCandidateLayerReason('Candidate mask blending requires identity pose'); return
    }
    setCandidateLayerReason('Loading current candidate mask')
    const candidate = activeCandidate, source = activeSample, slice = activeSliceVolume
    void (async () => {
      try {
        let voxels = slice.voxels
        if (revision.volumeId !== source.sourceAnatomy.volumeId || revision.volumeHash !== source.sourceAnatomy.volumeHash) {
          await ensureVolumeLoaded(candidate.objectId, revision.volumeId)
          if (cancelled) return
          const bytes = editorStore.getState()?.volumes.get(revision.volumeId)
          if (!bytes) throw new Error('Candidate volume bytes unavailable')
          const decoded = decodeNrrdVoxels(bytes)
          if (decoded.sizes.some((n, i) => n !== slice.sizes[i]) || decoded.voxels.length !== slice.voxels.length) throw new Error('Candidate mask grid differs from source')
          voxels = decoded.voxels
        }
        if (volumeIntensityRange(voxels)[1] > 1) throw new Error('Foreground requires a binary0/1 candidate mask')
        if (!cancelled) { setCandidateLayer({ documentId: candidate.objectId, revisionId: revision.id, voxels }); setCandidateLayerReason('') }
      } catch (error) { if (!cancelled) setCandidateLayerReason(error instanceof Error ? error.message : String(error)) }
    })()
    return () => { cancelled = true }
  }, [activeCandidate?.objectId, activeCandidate?.currentRevisionId, activeSliceVolume?.voxels])

  useEffect(() => {
    updateCanvasRuntime({
      pendingOperationCount: managementWriteCount + (pendingAction ? 1 : 0) + (packageAction ? 1 : 0),
      mode: canvasMode,
      crosshairRas,
      sliceOffsets: {
        axial: crosshairRas[2],
        sagittal: crosshairRas[0],
        coronal: crosshairRas[1],
      },
    })
  }, [managementWriteCount, pendingAction, packageAction, canvasMode, crosshairRas[0], crosshairRas[1], crosshairRas[2]])

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={nav}
        onSelectNav={navigateTo}
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
          packageDisabledReason={packageDisabledReason}
          onNewCase={() => setNewCaseOpen(true)}
          onImportSample={() => setImportSampleOpen(true)}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenPackage={openPackageDialog}
          onNavigateHome={() => navigateTo('projects')}
        />

        {packageFeedback ? <div className="package-feedback" role={packageFeedback.error ? 'alert' : 'status'}>{packageFeedback.text}</div> : null}
        <div className="app-content">
          {nav === 'projects' ? (
            <ProjectsHome
              projects={projects}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onDeleteProject={(id) => void handleDeleteProject(id)}
              onOpenPackage={openPackageDialog}
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
              onSwitchToCanvas={() => navigateTo('canvas')}
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
                  if (id !== state?.activeDocumentId) { setPlacementDraft(null); setActiveTool('select') }
                  const res = setActiveDocument(ctx, { kind, id })
                  if (!res.ok) {
                    setSignal(true)
                    setMessage(res.error)
                    return
                  }
                  refresh()
                }}
                onClose={(kind, id) => {
                  setPlacementDraft(null)
                  setActiveTool('select')
                  const res = closeDocument(ctx, { kind, id })
                  if (!res.ok) {
                    setSignal(true)
                    setMessage(res.error)
                    return
                  }
                  refresh()
                }}
              />

              <div className="studio-viewport-container">
                <MenuBar commands={commands} onRun={runCommand} />
                <CanvasWorkspace
                  documentName={activeDocumentName}
                  activeMode={canvasMode}
                  volumeAvailable={volumeAvailable}
                  selectedObjectId={selectionObjectId ?? activeCandidate?.objectId ?? null}
                  inspectorVisible={landmarksOpen || canvasMode === 'place'}
                  placeDisabledReason={!volumeAvailable || !activeSample?.spatiallyVerified || activeSample.sourceAnatomy.spatial.units !== 'mm'
                    ? 'Requires decoded verified millimetre source data' : landmarkPending ? 'Landmark request is pending' : undefined}
                  foreground={candidateLayer?.documentId === activeCandidate?.objectId && candidateLayer?.revisionId === activeCandidate?.currentRevisionId ? candidateLayer?.voxels : undefined}
                  foregroundReason={candidateLayerReason}
                  landmarks={(state?.landmarks ?? []).filter((point) => point.sampleId === activeSample?.id)}
                  projection={projection}
                  voxels={activeSliceVolume?.voxels}
                  volumeSizes={activeSliceVolume?.sizes}
                  spacings={activeSample?.sourceAnatomy.spatial.spacings?.slice(0, 3).map((value) => Number.isFinite(value) && value !== 0 ? Math.abs(value) : 1) as [number, number, number] | undefined}
                  crosshair={crosshairIjk}
                  crosshairRas={crosshairRas}
                  windowCenter={windowCenter}
                  windowWidth={windowWidth}
                  onCrosshairChange={setCrosshairIjk}
                  onWindowChange={(center, width) => {
                    setWindowCenter(center)
                    setWindowWidth(width)
                  }}
                  onPlace={(point) => { setCrosshairIjk(point); void changeLandmark(point) }}
                  onModeChange={(mode) => {
                    setCanvasMode(mode)
                    if (mode === 'place') setLandmarksOpen(true)
                    setActiveTool(mode === 'view' ? 'navigate' : 'select')
                  }}
                  operationLabel={isDraftActive ? (currentPlacement?.pose ? 'Manual placement preview' : 'Invalid placement — enter finite values') : activeTool === 'select' ? 'Select object · Click mesh to select · Drag to navigate' : undefined}
                  operationControls={isDraftActive ? (
                    <>
                      <FeatureHint {...CANVAS_HINTS.applyDraft} side="bottom">
                        <button
                          type="button"
                          className="btn btn--primary btn--xs"
                          disabled={pendingAction !== null || !canApplyPlacement}
                          onClick={() => void applyTransform()}
                        >
                          Apply
                        </button>
                      </FeatureHint>
                      <FeatureHint {...CANVAS_HINTS.cancelDraft} side="bottom">
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          disabled={pendingAction !== null}
                          onClick={() => {
                            setActiveTool('select')
                            setMessage('Transform cancelled')
                            setSignal(false)
                          }}
                        >
                          Cancel
                        </button>
                      </FeatureHint>
                    </>
                  ) : (
                    <>
                      <button type="button" className="canvas-context-action" aria-pressed={landmarksOpen}
                        onClick={() => setLandmarksOpen((open) => !open)}>Landmarks</button>
                      {rendererStatus !== 'ready' ? (
                        <FeatureHint {...CANVAS_HINTS.rebuild} side="bottom">
                          <button
                            type="button"
                            className="btn btn--primary btn--xs"
                            onClick={() => {
                              setRendererStatus('restoring')
                              setRendererNonce((nonce) => nonce + 1)
                            }}
                          >
                            Rebuild view
                          </button>
                        </FeatureHint>
                      ) : null}
                      <FeatureHint {...CANVAS_HINTS.tiltLock} side="bottom">
                        <button
                          type="button"
                          className={`canvas-context-action ${tiltLock ? 'is-active' : ''}`}
                          aria-pressed={tiltLock}
                          onClick={() => setTiltLock((locked) => !locked)}
                        >
                          Tilt lock
                        </button>
                      </FeatureHint>
                      <FeatureHint {...CANVAS_HINTS.spin} side="bottom">
                        <button
                          type="button"
                          className={`canvas-context-action ${motionMode === 'spin' ? 'is-active' : ''}`}
                          aria-pressed={motionMode === 'spin'}
                          onClick={() =>
                            setMotionMode((mode) => (mode === 'spin' ? 'none' : 'spin'))
                          }
                        >
                          Spin
                        </button>
                      </FeatureHint>
                      <FeatureHint {...CANVAS_HINTS.rock} side="bottom">
                        <button
                          type="button"
                          className={`canvas-context-action ${motionMode === 'rock' ? 'is-active' : ''}`}
                          aria-pressed={motionMode === 'rock'}
                          onClick={() =>
                            setMotionMode((mode) => (mode === 'rock' ? 'none' : 'rock'))
                          }
                        >
                          Rock
                        </button>
                      </FeatureHint>
                    </>
                  )}
                  viewControls={(
                    <ViewController
                      diagnosticsEnabled={diagnosticsEnabled} onDiagnosticsChange={setDiagnosticsEnabled}
                      objectVisible={objectVisible}
                      canToggleVisibility={Boolean(activeObjectId)}
                      onToggleVisibility={toggleObjectVisibility}
                      onShowAll={state ? showObjects : undefined}
                      projection={projection}
                      crosshairEnabled={crosshairVisible}
                      lightingIntensity={lightingIntensity}
                      onCenter={() => setFocusNonce((nonce) => nonce + 1)}
                      onReset={() => setResetNonce((nonce) => nonce + 1)}
                      onPreset={(preset) => {
                        setViewPreset(preset)
                        setViewPresetNonce((nonce) => nonce + 1)
                      }}
                      onProjectionChange={setProjection}
                      onCrosshairChange={setCrosshairVisible}
                      onLightingChange={setLightingIntensity}
                    />
                  )}
                  inspector={(
                    <Inspector
                      state={state}
                      activeCaseId={selectedCaseId}
                      constructionControls={isDraftActive && currentPlacement ? (
                        <RigidPlacementControls key={`${currentPlacement.candidateId}:${currentPlacement.revisionId}`}
                          onChange={previewPlacement} disabled={pendingAction !== null} />
                      ) : undefined}
                      voxelControls={activeCandidate && activeSample ? <VoxelControls key={`${activeCandidate.objectId}:${activeCandidate.currentRevisionId}`}
                        sizes={activeSample.sourceAnatomy.spatial.sizes} pending={voxelPending}
                        disabledReason={isDraftActive || pendingAction || packageAction ? 'Finish the pending operation or placement draft first'
                          : !activeSample.spatiallyVerified || activeSample.sourceAnatomy.spatial.units !== 'mm' ? 'Requires verified millimetre source data'
                            : !state?.revisions.find((r) => r.id === activeCandidate.currentRevisionId)?.pose.every((n, i) => Math.abs(n - (i % 5 === 0 ? 1 : 0)) < 1e-9) ? 'Restore an identity-pose revision before voxel editing' : undefined}
                        onExecute={(parameters) => void executeVoxels(parameters)} /> : undefined}
                      annotationControls={activeSample ? <LandmarkControls key={activeSample.id}
                        points={(state?.landmarks ?? []).filter((point) => point.sampleId === activeSample.id)}
                        pending={landmarkPending} persistent={persistentPlace} onPersistentChange={setPersistentPlace}
                        onDelete={(id) => void changeLandmark(id)} onLocate={(point) => setCrosshairIjk(point.ijk)} /> : undefined}
                      activeTool={activeTool}
                      restoreDisabled={pendingAction !== null}
                      onRestoreRevision={(candidateId, revisionId) => {
                        void restoreCandidateRevision(candidateId, revisionId)
                      }}
                    />
                  )}
                  status={(
                    <>
                      <span>
                        <strong>RAS</strong>{' '}
                        R {crosshairRas[0].toFixed(2)} · A {crosshairRas[1].toFixed(2)} · S {crosshairRas[2].toFixed(2)} mm
                      </span>
                      <span className={signal ? 'has-signal' : ''}>
                        {pendingAction ? 'Working…' : sliceStatus ?? message ?? `${canvasMode} mode · Ready`}
                      </span>
                    </>
                  )}
                >
                  <Viewport
                    diagnosticsEnabled={diagnosticsEnabled}
                    calibratedMm={Boolean(activeSample?.spatiallyVerified && activeSample.sourceAnatomy.spatial.units === 'mm')}
                    objectId={activeObjectId ?? undefined}
                    visible={objectVisible}
                    selectedObjectId={selectionObjectId}
                    selectionEnabled={Boolean(mesh) && activeTool === 'select' && canvasMode === 'view' && pendingAction === null}
                    onSelectObject={handleObjectSelection}
                    onShowObject={toggleObjectVisibility}
                    focusNonce={focusNonce}
                    resetNonce={resetNonce}
                    viewPreset={viewPreset}
                    viewPresetNonce={viewPresetNonce}
                    projection={projection}
                    crosshairVisible={crosshairVisible}
                    lightingIntensity={lightingIntensity}
                    tiltLock={tiltLock}
                    motionMode={motionMode}
                    rendererNonce={rendererNonce}
                    onContextStatusChange={setRendererStatus}
                    mesh={renderMesh}
                    status={viewportStatus}
                    onCameraChange={(position, target) => {
                      navigateCamera(ctx, { position, target })
                    }}
                  />
                </CanvasWorkspace>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Accessible Radix Modals */}
      {packageDialogOpen ? <OpenPackageDialog onClose={() => setPackageDialogOpen(false)}
        onImport={importPackage} busy={packageAction === 'open'} /> : null}
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
      <CommandPalette
        open={commandPaletteOpen}
        commands={commands}
        onClose={() => setCommandPaletteOpen(false)}
        onRun={runCommand}
      />

    </div>
  )
}
