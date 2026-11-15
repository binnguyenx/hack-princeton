import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from './api/client'
import type { Object3D } from 'three'
import { installDebugBridge, updateCanvasRuntime } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import { loadDisplayMeshAsset } from './geometry/displayMesh'
import { applyPoseToObject } from './geometry/pose'
import { decodeNrrdVoxels } from './geometry/nrrdVoxels'
import { ijkToRas, rasToIjk, type Vec3 } from './geometry/coordinates'
import {
  volumeIntensityRange,
  type IjkPoint,
  type VolumeSizes,
} from './geometry/slices'
import type {
  Annotation,
  AnnotationType,
  EditorState,
  Mat4,
  ProjectSummary,
  RasPoint,
  Sample,
  SpatialMeta,
} from './domain/types'
import { buildCanvasCommands, type CommandId } from './commands/registry'
import {
  addAnnotation,
  closeDocument,
  deleteAnnotation,
  navigateCamera,
  openDocument,
  renameAnnotation,
  selectObject,
  setAnnotationLocked,
  setAnnotationVisible,
  setInspectionPlane,
  setVisibility,
  setActiveDocument,
  updateAnnotationMeta,
  updateAnnotationPoints,
} from './ops'
import {
  createAnnotationStack,
  stackToPreviewAnnotations,
} from './ops/annotationStack'
import type { AnnotationAction } from './ui/annotationActions'
import { planeNormal } from './geometry/annotationMeasure'
import {
  applyPlacementPoint,
  defaultAnnotationName,
} from './geometry/annotationPlacement'
import type { PlacementApi } from './ui/CanvasWorkspace'
import {
  fetchPreparedSample,
  loadSampleCatalog,
  type SampleCatalogEntry,
} from './ops/importPrepared'
import { editorStore } from './state/store'
import { Sidebar, type NavItem } from './ui/Sidebar'
import { AppHeader } from './ui/AppHeader'
import { ProjectsHome } from './ui/ProjectsHome'
import { CaseTableView } from './ui/CaseTableView'
import { DocumentTaskbar } from './ui/DocumentTaskbar'
import type { ToolId } from './ui/ToolRail'
import { Inspector } from './ui/Inspector'
import { MenuBar } from './ui/MenuBar'
import { CommandPalette } from './ui/CommandPalette'
import {
  CanvasWorkspace,
  type CanvasMode,
  type PlanePlacementMethod,
} from './ui/CanvasWorkspace'
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
  const [activeAnnotationType, setActiveAnnotationType] =
    useState<AnnotationType>('text_note')
  const [planeMethod, setPlaneMethod] =
    useState<PlanePlacementMethod>('point-normal')
  const [brushRadiusMm, setBrushRadiusMm] = useState(10)
  const [highlightColor, setHighlightColor] = useState<
    'accent' | 'amber' | 'rose' | 'emerald'
  >('accent')
  const [staleHighlightIds, setStaleHighlightIds] = useState<Set<string>>(
    () => new Set(),
  )
  const placementApiRef = useRef<PlacementApi | null>(null)
  const annotationStackRef = useRef(createAnnotationStack())
  const activeLineStackIdRef = useRef<string | null>(null)
  const highlightStackIdRef = useRef<string | null>(null)
  const [stackEpoch, setStackEpoch] = useState(0)
  const [draftPreviewPoints, setDraftPreviewPoints] = useState<RasPoint[]>([])
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(
    null,
  )
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null)

  const bumpStack = () => setStackEpoch((n) => n + 1)

  function isStackAnnotationId(id: string): boolean {
    return id.startsWith('stack-')
  }

  function mutateStackEntry(
    id: string,
    patch: Partial<{
      name: string
      points: RasPoint[]
      meta: Record<string, unknown>
      visible: boolean
      locked: boolean
    }>,
  ): boolean {
    const stack = annotationStackRef.current
    const entry = stack.entries().find((e) => e.id === id)
    if (!entry) return false
    stack.upsertCreate(id, {
      type: entry.type,
      name: patch.name ?? entry.name,
      points: patch.points ?? entry.points,
      meta: {
        ...entry.meta,
        ...(patch.meta ?? {}),
        ...(patch.visible !== undefined ? { _visible: patch.visible } : {}),
        ...(patch.locked !== undefined ? { _locked: patch.locked } : {}),
      },
      revisionId: entry.revisionId,
    })
    bumpStack()
    return true
  }
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

  const setStoreFromManifest = useCallback((manifest: {
    user: EditorState['user']
    project: EditorState['project']
    cases: EditorState['cases']
    samples: EditorState['samples']
    candidates: EditorState['candidates']
    revisions: EditorState['revisions']
    annotations?: EditorState['annotations']
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
      annotations: manifest.annotations ?? [],
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
        void onRestore()
        return
      case 'edit.undo':
        undoAnnotationOrDraft()
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

  // Stable shortcut handlers — capture phase so Cmd+Z is not eaten by the canvas.
  const shortcutRef = useRef({
    onSave: () => {},
    onUndo: () => {},
    onEnter: () => {},
    onEscape: () => {},
    runCommand: (_id: CommandId) => {},
    nav: 'projects' as 'projects' | 'cases' | 'canvas',
  })
  shortcutRef.current = {
    onSave: () => {
      void onSave()
    },
    onUndo: () => {
      undoAnnotationOrDraft()
    },
    onEnter: () => {
      if (
        canvasMode === 'place' &&
        (activeAnnotationType === 'closed_curve' ||
          activeAnnotationType === 'open_curve')
      ) {
        handleFinishDraft()
        return
      }
      runCommand('object.applyDraft')
    },
    onEscape: () => {
      if (canvasMode === 'place') {
        const draft = placementApiRef.current?.getDraft() ?? {
          points: [] as RasPoint[],
          meta: {} as Record<string, unknown>,
        }
        const hasDraftContent =
          draft.points.length > 0 ||
          (Array.isArray(draft.meta.triangleIndices) &&
            (draft.meta.triangleIndices as number[]).length > 0)
        if (hasDraftContent) {
          handleCancelDraft()
          return
        }
        setCanvasMode('view')
        return
      }
      runCommand('object.cancelDraft')
    },
    runCommand,
    nav,
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const mod = e.metaKey || e.ctrlKey
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Allow Mod+S / Mod+Z from fields; ignore bare keys while typing.
        if (!mod && e.key !== 'Escape') return
      }
      if (mod && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
        e.preventDefault()
        e.stopPropagation()
        shortcutRef.current.onSave()
        return
      }
      if (mod && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        shortcutRef.current.onUndo()
        return
      }
      if (shortcutRef.current.nav !== 'canvas') return
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((open) => !open)
        return
      }
      const run = shortcutRef.current.runCommand
      if (e.key === 'v' || e.key === 'V') run('tool.select')
      if (e.key === 't' || e.key === 'T') run('tool.transform')
      if (e.key === 'n' || e.key === 'N') run('tool.navigate')
      if (e.key === 'f' || e.key === 'F') run('view.focus')
      if (e.key === 'h' || e.key === 'H') run('view.toggleVisibility')
      if (!e.ctrlKey && e.key === '1') run('view.standardAnterior')
      if (e.ctrlKey && e.key === '1') run('view.standardPosterior')
      if (!e.ctrlKey && e.key === '3') run('view.standardLeft')
      if (e.ctrlKey && e.key === '3') run('view.standardRight')
      if (!e.ctrlKey && e.key === '7') run('view.standardSuperior')
      if (e.ctrlKey && e.key === '7') run('view.standardInferior')
      if (e.key === 'Enter') {
        e.preventDefault()
        shortcutRef.current.onEnter()
        return
      }
      if (e.key === 'Escape') shortcutRef.current.onEscape()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
    const stack = annotationStackRef.current
    if (stack.isEmpty()) {
      setSignal(false)
      setMessage('All management changes are already persisted')
      return
    }
    try {
      await stack.flush(async (entry) => {
        const meta = { ...entry.meta }
        const locked = Boolean(meta._locked)
        const visible = meta._visible === false ? false : true
        delete meta._locked
        delete meta._visible
        const result = addAnnotation(ctx, {
          type: entry.type,
          name: entry.name,
          points: entry.points,
          meta,
          revisionId: entry.revisionId,
        })
        if (!result.ok) throw new Error(result.error)
        if (locked) {
          setAnnotationLocked(ctx, { id: result.value.id, locked: true })
        }
        if (!visible) {
          setAnnotationVisible(ctx, { id: result.value.id, visible: false })
        }
        await apiClient.createAnnotation(entry.revisionId, {
          type: entry.type,
          name: entry.name,
          points: entry.points,
          meta,
          locked,
          visible,
          createdAt: result.value.createdAt,
        })
      })
      activeLineStackIdRef.current = null
      highlightStackIdRef.current = null
      bumpStack()
      await reloadActiveProjectKeepingCandidate()
      setSignal(false)
      setMessage('Annotations saved')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function undoAnnotationStack() {
    const undone = annotationStackRef.current.undoLast()
    if (!undone) {
      setSignal(false)
      setMessage('Nothing to undo')
      return
    }
    if (activeLineStackIdRef.current === undone.id) {
      activeLineStackIdRef.current = null
    }
    if (highlightStackIdRef.current === undone.id) {
      highlightStackIdRef.current = null
    }
    if (selectedAnnotationId === undone.id) setSelectedAnnotationId(null)
    if (focusAnnotationId === undone.id) setFocusAnnotationId(null)
    bumpStack()
    setSignal(false)
    setMessage(`Undid ${undone.name}`)
  }

  /** Mod+Z: stack first, then in-progress Place draft — never silent no-op. */
  function undoAnnotationOrDraft() {
    if (!annotationStackRef.current.isEmpty()) {
      undoAnnotationStack()
      return
    }
    const draft = placementApiRef.current?.getDraft() ?? {
      points: [] as RasPoint[],
      meta: {} as Record<string, unknown>,
    }
    const hasHighlightDraft =
      Array.isArray(draft.meta.triangleIndices) &&
      (draft.meta.triangleIndices as number[]).length > 0
    if (draft.points.length > 0 || hasHighlightDraft) {
      if (draft.points.length > 1) {
        handleStripLastDraftPoint()
        setSignal(false)
        setMessage('Removed last draft point')
        return
      }
      placementApiRef.current?.clearDraft()
      setDraftPreviewPoints([])
      setSignal(false)
      setMessage('Cleared draft')
      return
    }
    setSignal(false)
    setMessage('Nothing to undo')
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

  async function reloadActiveProjectKeepingCandidate() {
    if (!activeProjectId) return
    const candidateId = activeCandidateId()
    await loadProject(activeProjectId)
    if (candidateId) {
      openDocument(ctx, { kind: 'candidate', id: candidateId })
    }
    refresh()
  }

  function resolveActiveCandidate() {
    const st = editorStore.getState()
    if (!st?.activeDocumentId) return null
    const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
    if (!doc || doc.kind !== 'candidate') return null
    return st.candidates.find((c) => c.objectId === doc.id) ?? null
  }

  function cameraViewNormal(): RasPoint {
    const cam = editorStore.getState()?.view.camera
    if (!cam) return [0, 0, 1]
    const dx = cam.position[0] - cam.target[0]
    const dy = cam.position[1] - cam.target[1]
    const dz = cam.position[2] - cam.target[2]
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-12) return [0, 0, 1]
    return [dx / len, dy / len, dz / len]
  }

  function queueReadyPlacement(args: {
    type: AnnotationType
    points: RasPoint[]
    meta: Record<string, unknown>
    revisionId: string
  }) {
    const stack = annotationStackRef.current
    const payload = {
      type: args.type,
      name: defaultAnnotationName(args.type),
      points: args.points,
      meta: args.meta,
      revisionId: args.revisionId,
    }
    if (args.type === 'line' && activeLineStackIdRef.current) {
      stack.upsertCreate(activeLineStackIdRef.current, payload)
    } else {
      const id = stack.pushCreate(payload)
      if (args.type === 'line') activeLineStackIdRef.current = id
      else activeLineStackIdRef.current = null
    }
    const stackedId =
      args.type === 'line' && activeLineStackIdRef.current
        ? activeLineStackIdRef.current
        : annotationStackRef.current.peekLast()?.id ?? null
    bumpStack()
    placementApiRef.current?.clearDraft()
    setDraftPreviewPoints([])
    if (stackedId) {
      setSelectedAnnotationId(stackedId)
      if (args.type === 'text_note' || args.type === 'plane') {
        setFocusAnnotationId(stackedId)
      }
    }
    setSignal(false)
    setMessage(
      args.type === 'plane'
        ? 'Plane queued — open its row: Size / Rotate / Align to view · Mod+S to save'
        : args.type === 'open_curve' || args.type === 'closed_curve'
          ? `${defaultAnnotationName(args.type)} queued — Mod+S to save · Mod+Z to undo`
          : 'Queued — Mod+S to save · Mod+Z to undo',
    )
  }

  function handlePlaceRas(ras: RasPoint) {
    if (canvasMode !== 'place') return
    if (activeAnnotationType === 'highlight') return
    const candidate = resolveActiveCandidate()
    if (!candidate) return

    const draft = placementApiRef.current?.getDraft() ?? { points: [], meta: {} }

    // R25: after a stacked distance line, next place resets that line to a new A.
    if (
      activeAnnotationType === 'line' &&
      draft.points.length === 0 &&
      activeLineStackIdRef.current
    ) {
      annotationStackRef.current.removeById(activeLineStackIdRef.current)
      activeLineStackIdRef.current = null
      bumpStack()
      placementApiRef.current?.setDraft({ points: [ras], meta: {} })
      setDraftPreviewPoints([ras])
      setSignal(false)
      setMessage(null)
      return
    }

    const decision = applyPlacementPoint({
      type: activeAnnotationType,
      existing: draft.points,
      next: ras,
      planeMethod,
      viewNormal: cameraViewNormal(),
    })

    if (decision.kind === 'ignore') return

    if (decision.kind === 'accumulate') {
      if (
        activeAnnotationType === 'line' &&
        decision.points.length === 1 &&
        activeLineStackIdRef.current
      ) {
        annotationStackRef.current.removeById(activeLineStackIdRef.current)
        activeLineStackIdRef.current = null
        bumpStack()
      }
      placementApiRef.current?.setDraft({
        points: decision.points,
        meta: { ...draft.meta, ...(decision.meta ?? {}) },
      })
      setDraftPreviewPoints(decision.points)
      setSignal(false)
      setMessage(null)
      return
    }

    // ready — queue on uncommitted stack (R78); Mod+S flushes
    queueReadyPlacement({
      type: activeAnnotationType,
      points: decision.points,
      meta: { ...draft.meta, ...decision.meta },
      revisionId: candidate.currentRevisionId,
    })
  }

  function handleCancelDraft() {
    placementApiRef.current?.clearDraft()
    setDraftPreviewPoints([])
    setSignal(false)
    setMessage(null)
  }

  function handleStripLastDraftPoint() {
    const draft = placementApiRef.current?.getDraft() ?? { points: [], meta: {} }
    if (draft.points.length === 0) return
    const next = draft.points.slice(0, -1)
    placementApiRef.current?.setDraft({ points: next, meta: draft.meta })
    setDraftPreviewPoints(next)
  }

  function handleFinishDraft() {
    if (canvasMode !== 'place') return
    const candidate = resolveActiveCandidate()
    if (!candidate) {
      setSignal(true)
      setMessage('Open a candidate to finish the curve')
      return
    }
    if (
      activeAnnotationType !== 'closed_curve' &&
      activeAnnotationType !== 'open_curve'
    ) {
      return
    }
    const draft = placementApiRef.current?.getDraft() ?? { points: [], meta: {} }
    const minPts = activeAnnotationType === 'closed_curve' ? 3 : 2
    if (draft.points.length < minPts) {
      setSignal(true)
      setMessage(
        activeAnnotationType === 'closed_curve'
          ? 'Need at least 3 points to close the curve'
          : 'Need at least 2 points to finish the open curve',
      )
      return
    }
    const decision = applyPlacementPoint({
      type: activeAnnotationType,
      existing: draft.points,
      forceReady: true,
      planeMethod,
    })
    if (decision.kind !== 'ready') {
      setSignal(true)
      setMessage(
        activeAnnotationType === 'closed_curve'
          ? 'Need at least 3 points to close the curve'
          : 'Need at least 2 points to finish the open curve',
      )
      return
    }
    queueReadyPlacement({
      type: activeAnnotationType,
      points: decision.points,
      meta: { ...draft.meta, ...decision.meta },
      revisionId: candidate.currentRevisionId,
    })
  }

  async function handleUpdateAnnotation(args: {
    id: string
    name?: string
    points?: RasPoint[]
    meta?: Record<string, unknown>
    locked?: boolean
    visible?: boolean
  }) {
    if (args.name !== undefined) {
      const r = renameAnnotation(ctx, { id: args.id, name: args.name })
      if (!r.ok) {
        setSignal(true)
        setMessage(r.error)
        return
      }
    }
    if (args.points !== undefined) {
      const r = updateAnnotationPoints(ctx, { id: args.id, points: args.points })
      if (!r.ok) {
        setSignal(true)
        setMessage(r.error)
        return
      }
    }
    if (args.meta !== undefined) {
      const r = updateAnnotationMeta(ctx, { id: args.id, meta: args.meta })
      if (!r.ok) {
        setSignal(true)
        setMessage(r.error)
        return
      }
    }
    if (args.locked !== undefined) {
      const r = setAnnotationLocked(ctx, { id: args.id, locked: args.locked })
      if (!r.ok) {
        setSignal(true)
        setMessage(r.error)
        return
      }
    }
    if (args.visible !== undefined) {
      const r = setAnnotationVisible(ctx, { id: args.id, visible: args.visible })
      if (!r.ok) {
        setSignal(true)
        setMessage(r.error)
        return
      }
    }
    try {
      await apiClient.updateAnnotation(args.id, {
        name: args.name,
        points: args.points,
        meta: args.meta,
        locked: args.locked,
        visible: args.visible,
      })
      await reloadActiveProjectKeepingCandidate()
      setSignal(false)
      setMessage('Annotation updated')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteAnnotation(id: string) {
    const result = deleteAnnotation(ctx, { id })
    if (!result.ok) {
      setSignal(true)
      setMessage(result.error)
      return
    }
    if (selectedAnnotationId === id) setSelectedAnnotationId(null)
    if (focusAnnotationId === id) setFocusAnnotationId(null)
    try {
      await apiClient.deleteAnnotation(id)
      await reloadActiveProjectKeepingCandidate()
      setSignal(false)
      setMessage('Annotation deleted')
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function handleAnnotationAction(action: AnnotationAction) {
    switch (action.type) {
      case 'place':
        setCanvasMode('place')
        setActiveTool('select')
        setSignal(false)
        setMessage('Place mode — select annotation type in the context strip')
        break
      case 'delete':
        if (isStackAnnotationId(action.id)) {
          annotationStackRef.current.removeById(action.id)
          if (activeLineStackIdRef.current === action.id) {
            activeLineStackIdRef.current = null
          }
          if (highlightStackIdRef.current === action.id) {
            highlightStackIdRef.current = null
          }
          if (focusAnnotationId === action.id) setFocusAnnotationId(null)
          if (selectedAnnotationId === action.id) setSelectedAnnotationId(null)
          bumpStack()
          break
        }
        void handleDeleteAnnotation(action.id)
        break
      case 'rename':
        if (isStackAnnotationId(action.id)) {
          mutateStackEntry(action.id, { name: action.name })
          break
        }
        void handleUpdateAnnotation({ id: action.id, name: action.name })
        break
      case 'setVisible':
        if (isStackAnnotationId(action.id)) {
          mutateStackEntry(action.id, { visible: action.visible })
          break
        }
        void handleUpdateAnnotation({ id: action.id, visible: action.visible })
        break
      case 'setLocked':
        if (isStackAnnotationId(action.id)) {
          mutateStackEntry(action.id, { locked: action.locked })
          break
        }
        void handleUpdateAnnotation({ id: action.id, locked: action.locked })
        break
      case 'updateMeta':
        if (isStackAnnotationId(action.id)) {
          mutateStackEntry(action.id, { meta: action.meta })
          break
        }
        void handleUpdateAnnotation({ id: action.id, meta: action.meta })
        break
      case 'jumpTo': {
        const sample = (() => {
          const st = editorStore.getState()
          if (!st?.activeDocumentId) return null
          const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
          if (!doc) return null
          if (doc.kind === 'sample') {
            return st.samples.find((s) => s.id === doc.id) ?? null
          }
          const cand = st.candidates.find((c) => c.objectId === doc.id)
          return cand
            ? (st.samples.find((s) => s.id === cand.sampleId) ?? null)
            : null
        })()
        if (!sample) {
          setSignal(true)
          setMessage('Cannot jump — no active sample spatial')
          return
        }
        const ijk = rasToIjk(sample.sourceAnatomy.spatial, action.point)
        setCrosshairIjk([
          Math.round(ijk[0]),
          Math.round(ijk[1]),
          Math.round(ijk[2]),
        ])
        setSignal(false)
        setMessage(`Jumped to ${action.point.map((n) => n.toFixed(2)).join(', ')} mm RAS`)
        break
      }
      case 'alignPlaneToView': {
        const stackAnn = stackToPreviewAnnotations(
          annotationStackRef.current,
        ).find((a) => a.id === action.annotationId)
        const st = editorStore.getState()
        const ann =
          stackAnn ??
          st?.annotations.find((a) => a.id === action.annotationId)
        if (!ann || ann.type !== 'plane') {
          setSignal(true)
          setMessage('Plane annotation not found')
          return
        }
        const meta = { ...ann.meta, normal: cameraViewNormal() }
        if (isStackAnnotationId(ann.id)) {
          mutateStackEntry(ann.id, { meta })
        } else {
          void handleUpdateAnnotation({ id: ann.id, meta })
        }
        setSignal(false)
        setMessage('Plane aligned to current view')
        break
      }
      case 'showPlaneInDock': {
        const st = editorStore.getState()
        const ann = st?.annotations.find((a) => a.id === action.annotationId)
        if (!ann || ann.type !== 'plane' || !ann.points[0]) {
          setSignal(true)
          setMessage('Plane annotation not found')
          return
        }
        const sample = (() => {
          if (!st?.activeDocumentId) return null
          const doc = st.openDocuments.find((d) => d.id === st.activeDocumentId)
          if (!doc) return null
          if (doc.kind === 'sample') {
            return st.samples.find((s) => s.id === doc.id) ?? null
          }
          const cand = st.candidates.find((c) => c.objectId === doc.id)
          return cand
            ? (st.samples.find((s) => s.id === cand.sampleId) ?? null)
            : null
        })()
        if (!sample) {
          setSignal(true)
          setMessage('Cannot show plane — no active sample spatial')
          return
        }
        const origin = ann.points[0]
        const n =
          Array.isArray(ann.meta.normal) && ann.meta.normal.length >= 3
            ? (ann.meta.normal as RasPoint)
            : planeNormal(ann.points)
        const absX = Math.abs(n[0])
        const absY = Math.abs(n[1])
        const absZ = Math.abs(n[2])
        const axis: 'x' | 'y' | 'z' =
          absX >= absY && absX >= absZ ? 'x' : absY >= absZ ? 'y' : 'z'
        const offset = axis === 'x' ? origin[0] : axis === 'y' ? origin[1] : origin[2]
        setInspectionPlane(ctx, { enabled: true, axis, offset })
        const ijk = rasToIjk(sample.sourceAnatomy.spatial, origin)
        setCrosshairIjk([
          Math.round(ijk[0]),
          Math.round(ijk[1]),
          Math.round(ijk[2]),
        ])
        void handleUpdateAnnotation({
          id: ann.id,
          meta: { ...ann.meta, sliceDockActive: true },
        })
        setSignal(false)
        setMessage(
          `Plane shown in slice dock (${axis.toUpperCase()} · offset ${offset.toFixed(2)} mm)`,
        )
        break
      }
      default:
        break
    }
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
  const activeRevisionAnnotations: Annotation[] = (() => {
    if (!activeCandidate) return []
    const revId = activeCandidate.currentRevisionId
    const saved = (state?.annotations ?? []).filter(
      (a) => a.revisionId === revId,
    )
    // stackEpoch keeps pending previews in sync with undo/flush
    void stackEpoch
    const pending = stackToPreviewAnnotations(
      annotationStackRef.current,
    ).filter((a) => a.revisionId === revId)
    return [...saved, ...pending]
  })()
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
          onNewProject={() => setNewProjectOpen(true)}
          onNavigateHome={() => setNav('projects')}
        />

        <div className="app-content">
          {nav === 'projects' ? (
            <ProjectsHome
              projects={projects}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onDeleteProject={(id) => void handleDeleteProject(id)}
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
                isDirty={
                  Boolean(state?.dirty) ||
                  (stackEpoch >= 0 && !annotationStackRef.current.isEmpty())
                }
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
                  isCandidateActive={isCandidateActive}
                  activeAnnotationType={activeAnnotationType}
                  onAnnotationTypeChange={(type) => {
                    setActiveAnnotationType(type)
                  }}
                  planeMethod={planeMethod}
                  onPlaneMethodChange={setPlaneMethod}
                  placementApiRef={placementApiRef}
                  onCancelDraft={handleCancelDraft}
                  onFinishDraft={handleFinishDraft}
                  placeRequireDblClick={activeAnnotationType === 'line'}
                  stackDirty={!annotationStackRef.current.isEmpty()}
                  hasDisplayMesh={Boolean(mesh)}
                  brushRadiusMm={brushRadiusMm}
                  onBrushRadiusChange={setBrushRadiusMm}
                  highlightColor={highlightColor}
                  onHighlightColorChange={setHighlightColor}
                  onCrosshairChange={setCrosshairIjk}
                  onWindowChange={(center, width) => {
                    setWindowCenter(center)
                    setWindowWidth(width)
                  }}
                  onPlace={(point) => {
                    setCrosshairIjk(point)
                    if (canvasMode !== 'place') {
                      setMessage(`Point placed at IJK ${point.join(', ')}`)
                      setSignal(false)
                      setCanvasMode('view')
                      return
                    }
                    if (!activeSample || !activeCandidate) {
                      setSignal(true)
                      setMessage('Place requires an active candidate')
                      return
                    }
                    const ras = ijkToRas(
                      activeSample.sourceAnatomy.spatial,
                      point,
                    ) as RasPoint
                    handlePlaceRas(ras)
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
                      annotations={activeRevisionAnnotations}
                      isCandidateActive={isCandidateActive}
                      onAnnotationAction={handleAnnotationAction}
                      staleHighlightIds={staleHighlightIds}
                      focusAnnotationId={focusAnnotationId}
                      onFocusAnnotationConsumed={() => setFocusAnnotationId(null)}
                      selectedAnnotationId={selectedAnnotationId}
                      onSelectAnnotation={setSelectedAnnotationId}
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
                    selectedAnnotationId={selectedAnnotationId}
                    onSelectAnnotation={setSelectedAnnotationId}
                    onAnnotationAction={handleAnnotationAction}
                    onExtentEdit={(id, edit, commit) => {
                      if (isStackAnnotationId(id)) {
                        mutateStackEntry(id, {
                          points: edit.points,
                          meta: edit.meta,
                        })
                        return
                      }
                      const pts = updateAnnotationPoints(ctx, {
                        id,
                        points: edit.points,
                      })
                      if (!pts.ok) {
                        setSignal(true)
                        setMessage(pts.error)
                        return
                      }
                      const meta = updateAnnotationMeta(ctx, {
                        id,
                        meta: edit.meta,
                      })
                      if (!meta.ok) {
                        setSignal(true)
                        setMessage(meta.error)
                        return
                      }
                      refresh()
                      if (!commit) return
                      void handleUpdateAnnotation({
                        id,
                        points: edit.points,
                        meta: edit.meta,
                      })
                    }}
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
                    displayMesh={mesh}
                    annotations={activeRevisionAnnotations}
                    boundingBoxMm={
                      activeSample?.sourceAnatomy.spatial.bboxMm ?? undefined
                    }
                    draftPreview={
                      draftPreviewPoints.length > 0
                        ? {
                            type: activeAnnotationType,
                            points: draftPreviewPoints,
                          }
                        : null
                    }
                    status={viewportStatus}
                    placePointMode={
                      canvasMode === 'place' &&
                      isCandidateActive &&
                      activeAnnotationType !== 'highlight'
                    }
                    placeRequireDblClick={activeAnnotationType === 'line'}
                    onPlaceWorldPoint={(point) => {
                      handlePlaceRas(point as RasPoint)
                    }}
                    onPlaceFinish={
                      activeAnnotationType === 'closed_curve' ||
                      activeAnnotationType === 'open_curve'
                        ? handleFinishDraft
                        : undefined
                    }
                    paintHighlight={
                      canvasMode === 'place' &&
                      activeAnnotationType === 'highlight' &&
                      Boolean(mesh)
                    }
                    brushRadiusMm={brushRadiusMm}
                    onPaintTriangles={(triangleIndices) => {
                      const candidate = resolveActiveCandidate()
                      if (!candidate) return
                      const draft =
                        placementApiRef.current?.getDraft() ?? {
                          points: [[0, 0, 0]] as RasPoint[],
                          meta: {},
                        }
                      const prev =
                        (draft.meta.triangleIndices as number[] | undefined) ??
                        []
                      const merged = [
                        ...new Set([...prev, ...triangleIndices]),
                      ]
                      const points =
                        draft.points.length > 0
                          ? draft.points
                          : ([[0, 0, 0]] as RasPoint[])
                      const meta = {
                        ...draft.meta,
                        color: highlightColor,
                        brushRadiusMm,
                        triangleIndices: merged,
                      }
                      placementApiRef.current?.setDraft({ points, meta })
                      const stack = annotationStackRef.current
                      const payload = {
                        type: 'highlight' as const,
                        name: defaultAnnotationName('highlight'),
                        points,
                        meta,
                        revisionId: candidate.currentRevisionId,
                      }
                      if (highlightStackIdRef.current) {
                        stack.upsertCreate(highlightStackIdRef.current, payload)
                      } else {
                        highlightStackIdRef.current = stack.pushCreate(payload)
                      }
                      bumpStack()
                      setSignal(false)
                      setMessage(null)
                    }}
                    onStaleHighlight={(id) => {
                      setStaleHighlightIds((prev) => {
                        if (prev.has(id)) return prev
                        const next = new Set(prev)
                        next.add(id)
                        return next
                      })
                    }}
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
      <CommandPalette
        open={commandPaletteOpen}
        commands={commands}
        onClose={() => setCommandPaletteOpen(false)}
        onRun={runCommand}
      />

    </div>
  )
}
