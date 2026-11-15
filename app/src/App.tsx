import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from './api/client'
import type { Object3D } from 'three'
import { installDebugBridge, updateCanvasRuntime } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import { loadDisplayMeshAsset } from './geometry/displayMesh'
import { applyPoseToObject } from './geometry/pose'
import { decodeNrrdVoxels, type VoxelBuffer } from './geometry/nrrdVoxels'
import { ijkToRas, type Vec3 } from './geometry/coordinates'
import {
  volumeIntensityRange,
  type IjkPoint,
  type VolumeSizes,
} from './geometry/slices'

/** Cranial CT bone Window/Level defaults (HU) — plan P3. */
const HU_BONE_WINDOW_CENTER = 400
const HU_BONE_WINDOW_WIDTH = 1500
import type { Mat4, Sample, SpatialMeta } from './domain/types'
import { buildCanvasCommands, type CommandId } from './commands/registry'
import {
  closeDocument,
  navigateCamera,
  openDocument,
  selectObject,
  setVisibility,
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
import { ImportDicomDialog } from './ui/dialogs/ImportDicomDialog'

const ctx = { store: editorStore }
const nudgePose: Mat4 = [
  1, 0, 0, 8,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export default function App() {
  function normalizeCatalogKey(raw?: string): string | null {
    if (!raw) return null
    const cleaned = raw.trim().replace(/\\/g, '/')
    if (!cleaned) return null
    const base = cleaned.split('/').filter(Boolean).at(-1) ?? cleaned
    return base.toLowerCase().replace(/\.nrrd$/i, '')
  }

  function resolveDisplayMeshAsset(sample: Sample): string | null {
    if (sample.displayMeshAsset) {
      return sample.displayMeshAsset.startsWith('/')
        ? sample.displayMeshAsset
        : `/${sample.displayMeshAsset}`
    }
    const fromDir = normalizeCatalogKey(sample.sourceSampleDir)
    if (fromDir) return `/samples/${fromDir}/display_mesh.glb`
    const fromName = normalizeCatalogKey(sample.displayName)
    if (fromName) return `/samples/${fromName}/display_mesh.glb`
    return null
  }

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
  const [pendingAction, setPendingAction] = useState<null | 'restore' | 'apply'>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [focusNonce, setFocusNonce] = useState(0)
  const [resetNonce, setResetNonce] = useState(0)
  const [viewPreset, setViewPreset] = useState<ViewPreset | null>(null)
  const [viewPresetNonce, setViewPresetNonce] = useState(0)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('view')
  const [projection, setProjection] = useState<ProjectionMode>('perspective')
  const [crosshairVisible, setCrosshairVisible] = useState(false)
  const [lightingIntensity, setLightingIntensity] = useState(DEFAULT_LIGHTING_INTENSITY)
  const [tiltLock, setTiltLock] = useState(false)
  const [motionMode, setMotionMode] = useState<CameraMotionMode>('none')
  const [rendererNonce, setRendererNonce] = useState(0)
  const [rendererStatus, setRendererStatus] = useState<'ready' | 'lost' | 'restoring'>('ready')
  const [sliceVolume, setSliceVolume] = useState<{
    documentId: string
    voxels: VoxelBuffer
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
  const [importDicomOpen, setImportDicomOpen] = useState(false)
  const meshBuildSeqRef = useRef(0)

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
    if (source.sourceAnatomy.volumeId !== expectedVolumeId) {
      throw new Error('Candidate volume differs from source volume and cannot be fetched yet')
    }
    const bytes = await apiClient.fetchSampleVolume(source.id)
    editorStore.update((curr) => {
      const nextVolumes = new Map(curr.volumes)
      nextVolumes.set(source.sourceAnatomy.volumeId, bytes)
      return { ...curr, volumes: nextVolumes }
    })
  }

  async function rebuildMeshForActiveDocument() {
    const buildSeq = ++meshBuildSeqRef.current
    const isCurrentBuild = () => meshBuildSeqRef.current === buildSeq
    const st = editorStore.getState()
    if (!st?.activeDocumentId) {
      if (!isCurrentBuild()) return
      setMesh(null)
      setViewportStatus('Select or open an anatomy asset to view in 3D')
      return
    }
    const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
    if (!doc) {
      if (!isCurrentBuild()) return
      setMesh(null)
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
      const displayMeshAsset = resolveDisplayMeshAsset(sample)
      if (displayMeshAsset) {
        setViewportStatus('Loading realistic mesh…')
        await new Promise((r) => setTimeout(r, 16))
        if (!isCurrentBuild()) return
        try {
          const glb = await loadDisplayMeshAsset(displayMeshAsset)
          if (!isCurrentBuild()) return
          setMesh(glb)
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
      const displayMeshAsset = sample ? resolveDisplayMeshAsset(sample) : null
      if (displayMeshAsset) {
        setViewportStatus('Loading realistic mesh…')
        await new Promise((r) => setTimeout(r, 16))
        if (!isCurrentBuild()) return
        try {
          const glb = await loadDisplayMeshAsset(displayMeshAsset)
          if (!isCurrentBuild()) return
          if (pose) applyPoseToObject(glb, pose)
          setMesh(glb)
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
      setMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Failed to load sample volume')
      return
    }
    const bytes = editorStore.getState()?.volumes.get(volumeId)
    if (!bytes) {
      if (!isCurrentBuild()) return
      setMesh(null)
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
      setMesh(mesh)
      setViewportStatus(null)
    } catch (e) {
      if (!isCurrentBuild()) return
      setMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Realistic surface render failed')
    }
  }

  function runCommand(id: CommandId) {
    switch (id) {
      case 'file.saveProject':
        void onSave()
        return
      case 'tool.navigate':
        setActiveTool('navigate')
        return
      case 'tool.select':
        setActiveTool('select')
        return
      case 'tool.transform':
        if (!isCandidateActive) {
          setSignal(true)
          setMessage('Open a candidate tab to transform')
          return
        }
        setActiveTool('transform')
        return
      case 'object.applyDraft':
        if (!isDraftActive) return
        void applyTransform()
        return
      case 'object.cancelDraft':
      case 'select.clear':
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
      case 'view.toggleVisibility': {
        const st = editorStore.getState()
        const targetObjectId = st?.view.selectionObjectId ?? st?.activeDocumentId ?? null
        if (!targetObjectId) {
          setSignal(true)
          setMessage('Open a sample or candidate first')
          return
        }
        // Guard against accidental full-scene disappearance from keyboard taps.
        if (!st?.view.selectionObjectId && st?.view.visibility[targetObjectId] !== false) {
          setSignal(true)
          setMessage('Select an object first before hiding it')
          return
        }
        const visible = st?.view.visibility?.[targetObjectId]
        setVisibility(ctx, targetObjectId, visible === false)
        setSignal(false)
        setMessage(visible === false ? 'Object shown' : 'Object hidden')
        refresh()
        return
      }
      case 'edit.redo':
        setSignal(false)
        setMessage('Redo is reserved for next slice')
        return
      default:
        return
    }
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (!(e.metaKey || e.ctrlKey) && e.key !== 'Escape') return
      }
      if (nav === 'canvas') {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          setCommandPaletteOpen((open) => !open)
          return
        }
        if (e.key === 'v' || e.key === 'V') runCommand('tool.select')
        if (e.key === 't' || e.key === 'T') {
          runCommand('tool.transform')
        }
        if (e.key === 'n' || e.key === 'N') runCommand('tool.navigate')
        if (e.key === 'f' || e.key === 'F') runCommand('view.focus')
        if (e.key === 'h' || e.key === 'H') runCommand('view.toggleVisibility')
        if (!e.ctrlKey && e.key === '1') runCommand('view.standardAnterior')
        if (e.ctrlKey && e.key === '1') runCommand('view.standardPosterior')
        if (!e.ctrlKey && e.key === '3') runCommand('view.standardLeft')
        if (e.ctrlKey && e.key === '3') runCommand('view.standardRight')
        if (!e.ctrlKey && e.key === '7') runCommand('view.standardSuperior')
        if (e.ctrlKey && e.key === '7') runCommand('view.standardInferior')
        if (e.key === 'Enter') runCommand('object.applyDraft')
        if (e.key === 'Escape') {
          runCommand('object.cancelDraft')
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        runCommand('file.saveProject')
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        runCommand('edit.undo')
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
    }
  }

  async function handleImportDicom(files: File[], displayName: string) {
    if (!selectedCaseId || !activeProjectId) {
      setSignal(true)
      setMessage('Open a project and select a case first')
      return
    }
    try {
      setViewportStatus('Converting CT DICOM series…')
      const imported = await apiClient.importDicomSample(activeProjectId, selectedCaseId, {
        files,
        displayName,
      })
      await loadProject(activeProjectId)
      openDocument(ctx, { kind: 'sample', id: imported.sampleId })
      setNav('canvas')
      setMessage(
        imported.spatiallyVerified
          ? `Imported CT intensity Sample: ${displayName}`
          : `Imported CT Sample ${displayName} (spatial tags incomplete — candidate creation blocked)`,
      )
      setSignal(false)
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setViewportStatus(null)
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
    if (pendingAction) return
    if (activeTool === 'transform') {
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
    if (currentIdx === 0) {
      setSignal(false)
      setMessage('Already at earliest revision')
      return
    }
    const prev = revs[currentIdx - 1]
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
    if (activeTool === 'transform') {
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

  async function applyTransform() {
    if (pendingAction) return
    const candidateId = activeCandidateId()
    if (!candidateId) {
      setSignal(true)
      setMessage('Open a candidate tab, then Transform')
      return
    }
    try {
      setPendingAction('apply')
      await apiClient.transformCandidate(candidateId, [...nudgePose])
      if (activeProjectId) {
        await loadProject(activeProjectId)
        openDocument(ctx, { kind: 'candidate', id: candidateId })
      }
      setSignal(false)
      setMessage('Transform committed (new revision)')
      setActiveTool('select')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPendingAction(null)
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
  const selectionObjectId = state?.view.selectionObjectId ?? null
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
  const activeDocumentName =
    activeCandidate?.displayName ?? activeSample?.displayName ?? 'No active anatomy'
  const volumeAvailable = Boolean(activeSample?.sourceAnatomy.volumeId)
  const activeSliceVolume =
    sliceVolume?.documentId === activeDocument?.id ? sliceVolume : null
  const crosshairRas: Vec3 = activeSample
    ? ijkToRas(activeSample.sourceAnatomy.spatial, crosshairIjk)
    : [0, 0, 0]
  const isDraftActive = activeTool === 'transform'
  const canRestore = (() => {
    const candidateId = activeCandidateId()
    if (!candidateId || !state) return false
    const candidate = state.candidates.find((c) => c.objectId === candidateId)
    if (!candidate) return false
    const revs = state.revisions.filter((r) => r.candidateId === candidate.objectId)
    return revs.length > 1
  })()
  const commands = buildCanvasCommands({
    hasProject: !!state?.project,
    hasActiveDocument: !!state?.activeDocumentId,
    isCandidateActive,
    isDraftActive,
    canRestore,
    hasSelection: !!selectionObjectId,
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
        await ensureVolumeLoaded(documentId, volumeId)
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
        const requiredVoxels = sizes[0] * sizes[1] * sizes[2]
        if (decoded.voxels.length < requiredVoxels) {
          throw new Error('Volume payload is shorter than its dimensions')
        }
        if (cancelled) return
        if (decoded.type === 'int16') {
          setWindowCenter(HU_BONE_WINDOW_CENTER)
          setWindowWidth(HU_BONE_WINDOW_WIDTH)
        } else {
          const [minimum, maximum] = volumeIntensityRange(
            decoded.voxels.subarray(0, requiredVoxels),
          )
          setWindowCenter((minimum + maximum) / 2)
          setWindowWidth(Math.max(maximum - minimum, 1))
        }
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
    updateCanvasRuntime({
      mode: canvasMode,
      crosshairRas,
      sliceOffsets: {
        axial: crosshairRas[2],
        sagittal: crosshairRas[0],
        coronal: crosshairRas[1],
      },
    })
  }, [canvasMode, crosshairRas[0], crosshairRas[1], crosshairRas[2]])

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
          onImportDicom={() => setImportDicomOpen(true)}
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
              onImportDicom={(caseId) => {
                setSelectedCaseId(caseId)
                setImportDicomOpen(true)
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
                  const res = setActiveDocument(ctx, { kind, id })
                  if (!res.ok) {
                    setSignal(true)
                    setMessage(res.error)
                    return
                  }
                  refresh()
                }}
                onClose={(kind, id) => {
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
                  projection={projection}
                  voxels={activeSliceVolume?.voxels}
                  volumeSizes={activeSliceVolume?.sizes}
                  crosshair={crosshairIjk}
                  crosshairRas={crosshairRas}
                  windowCenter={windowCenter}
                  windowWidth={windowWidth}
                  onCrosshairChange={setCrosshairIjk}
                  onWindowChange={(center, width) => {
                    setWindowCenter(center)
                    setWindowWidth(width)
                  }}
                  onPlace={(point) => {
                    setCrosshairIjk(point)
                    setMessage(`Point placed at IJK ${point.join(', ')}`)
                    setSignal(false)
                    setCanvasMode('view')
                  }}
                  onModeChange={(mode) => {
                    setCanvasMode(mode)
                    setActiveTool(mode === 'view' ? 'navigate' : 'select')
                  }}
                  operationLabel={isDraftActive ? 'Candidate transform preview' : undefined}
                  operationControls={isDraftActive ? (
                    <>
                      <FeatureHint {...CANVAS_HINTS.applyDraft} side="bottom">
                        <button
                          type="button"
                          className="btn btn--primary btn--xs"
                          disabled={pendingAction !== null}
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
                    objectId={activeDocument?.id}
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
                    mesh={mesh}
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
      <ImportDicomDialog
        open={importDicomOpen}
        onOpenChange={setImportDicomOpen}
        selectedCaseName={selectedCase?.name}
        onImport={(files, displayName) => void handleImportDicom(files, displayName)}
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
