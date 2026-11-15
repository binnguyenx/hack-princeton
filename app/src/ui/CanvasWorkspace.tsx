import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import {
  Contrast,
  MapPin,
  MousePointer2,
  Sparkles,
} from 'lucide-react'
import type { AnnotationType, RasPoint } from '../domain/types'
import { pointSetPlaceHint } from '../viewport/annotationBehaviors'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint, FeatureHintProvider } from './FeatureHint'
import { SliceDock } from './SliceDock'
import { ViewFrame } from './ViewFrame'
import { AiChatPanel } from './AiChatPanel'
import type { ChatContext } from './AiChatPanel'
import type { Vec3 } from '../geometry/coordinates'
import type { IjkPoint, SlicePlaneId, VolumeSizes } from '../geometry/slices'

export type CanvasMode = 'view' | 'window-level' | 'place'

export type PlacementDraft = {
  points: RasPoint[]
  meta: Record<string, unknown>
}

export type PlacementApi = {
  setDraft: (draft: PlacementDraft) => void
  getDraft: () => PlacementDraft
  clearDraft: () => void
  /** @deprecated use setDraft */
  setInProgressPoints: (pts: Array<[number, number, number]>) => void
  clearInProgress: () => void
  getInProgressPoints: () => Array<[number, number, number]>
}

type Props = {
  documentName: string
  activeMode: CanvasMode
  volumeAvailable: boolean
  selectedObjectId: string | null
  onModeChange: (mode: CanvasMode) => void
  inspector?: ReactNode
  /** @deprecated Workbench status bar removed; draft uses dirty-dot on Place strip. */
  status?: ReactNode
  viewControls?: ReactNode
  projection?: 'perspective' | 'orthographic'
  operationLabel?: string
  operationControls?: ReactNode
  voxels?: Uint8Array
  volumeSizes?: VolumeSizes
  crosshair?: IjkPoint
  crosshairRas?: Vec3
  windowCenter?: number
  windowWidth?: number
  onCrosshairChange?: (point: IjkPoint) => void
  onWindowChange?: (center: number, width: number) => void
  onPlace?: (point: IjkPoint) => void
  children: ReactNode
  aiChatOpen?: boolean
  onAiChatOpenChange?: (open: boolean) => void
  chatContext?: ChatContext
  isCandidateActive?: boolean
  activeAnnotationType?: AnnotationType
  onAnnotationTypeChange?: (type: AnnotationType) => void
  planeMethod?: PlanePlacementMethod
  onPlaneMethodChange?: (method: PlanePlacementMethod) => void
  placementApiRef?: MutableRefObject<PlacementApi | null>
  /** Discard the ephemeral draft points (stack unchanged). */
  onCancelDraft?: () => void
  /** Finish multi-point draft (closed/open curve) via Enter / double-click. */
  onFinishDraft?: () => void
  /** @deprecated unused — ready drafts queue on the uncommitted stack */
  onCommitDraft?: () => void
  /** @deprecated */
  onCommitInProgress?: () => void
  /** When true, slice place uses double-click (distance line). */
  placeRequireDblClick?: boolean
  /** Uncommitted annotation stack — keeps Place dirty-dot in sync after finish. */
  stackDirty?: boolean
  /** When false, Surface Highlight is disabled (R67 / S19). */
  hasDisplayMesh?: boolean
  brushRadiusMm?: number
  onBrushRadiusChange?: (radiusMm: number) => void
  highlightColor?: 'accent' | 'amber' | 'rose' | 'emerald'
  onHighlightColorChange?: (
    color: 'accent' | 'amber' | 'rose' | 'emerald',
  ) => void
}

export type PlanePlacementMethod = 'point-normal' | 'three-point'

const HIGHLIGHT_COLORS: Array<{
  id: 'accent' | 'amber' | 'rose' | 'emerald'
  hex: string
}> = [
  { id: 'accent', hex: '#2F6BFF' },
  { id: 'amber', hex: '#F59E0B' },
  { id: 'rose', hex: '#F43F5E' },
  { id: 'emerald', hex: '#10B981' },
]

const MODES = [
  { id: 'view' as const, label: 'View', icon: MousePointer2, hint: CANVAS_HINTS.modeView },
  {
    id: 'window-level' as const,
    label: 'Window / Level',
    icon: Contrast,
    hint: CANVAS_HINTS.modeWindowLevel,
  },
  { id: 'place' as const, label: 'Place', icon: MapPin, hint: CANVAS_HINTS.modePlace },
]

const PHASE1_TYPES: Array<{ id: AnnotationType; label: string }> = [
  { id: 'text_note', label: 'Text Note' },
  { id: 'line', label: 'Distance Line' },
  { id: 'closed_curve', label: 'Closed Curve' },
]

const PHASE2_TYPES: Array<{ id: AnnotationType; label: string }> = [
  { id: 'plane', label: 'Plane' },
  { id: 'open_curve', label: 'Open Curve' },
  { id: 'roi', label: 'ROI' },
  { id: 'highlight', label: 'Highlight' },
]

export function CanvasWorkspace({
  documentName,
  activeMode,
  volumeAvailable,
  selectedObjectId,
  onModeChange,
  inspector,
  viewControls,
  projection = 'perspective',
  operationLabel,
  operationControls,
  voxels,
  volumeSizes,
  crosshair = [0, 0, 0],
  crosshairRas = [0, 0, 0],
  windowCenter = 127.5,
  windowWidth = 255,
  onCrosshairChange = () => {},
  onWindowChange = () => {},
  onPlace = () => {},
  children,
  aiChatOpen,
  onAiChatOpenChange,
  chatContext,
  isCandidateActive = false,
  activeAnnotationType = 'text_note',
  onAnnotationTypeChange,
  planeMethod = 'point-normal',
  onPlaneMethodChange,
  placementApiRef,
  onCancelDraft,
  onFinishDraft,
  hasDisplayMesh = false,
  brushRadiusMm = 10,
  onBrushRadiusChange,
  highlightColor = 'accent',
  onHighlightColorChange,
  placeRequireDblClick = false,
  stackDirty = false,
}: Props) {
  const [sliceDockCollapsed, setSliceDockCollapsed] = useState(false)
  const [maximizedView, setMaximizedView] = useState<'three-d' | SlicePlaneId | null>(
    null,
  )
  const [internalChatOpen, setInternalChatOpen] = useState(true)
  const isChatOpen = aiChatOpen !== undefined ? aiChatOpen : internalChatOpen
  const setChatOpen = onAiChatOpenChange ?? setInternalChatOpen
  const [inProgressPoints, setInProgressPoints] = useState<RasPoint[]>([])
  const [draftMeta, setDraftMeta] = useState<Record<string, unknown>>({})
  const inProgressRef = useRef(inProgressPoints)
  inProgressRef.current = inProgressPoints
  const draftMetaRef = useRef(draftMeta)
  draftMetaRef.current = draftMeta
  const onCancelRef = useRef(onCancelDraft)
  onCancelRef.current = onCancelDraft
  const onFinishRef = useRef(onFinishDraft)
  onFinishRef.current = onFinishDraft

  const clearDraftLocal = () => {
    inProgressRef.current = []
    draftMetaRef.current = {}
    setInProgressPoints([])
    setDraftMeta({})
  }

  const discardDraft = () => {
    clearDraftLocal()
    onCancelRef.current?.()
  }

  const hasDraftContent = () =>
    inProgressRef.current.length > 0 ||
    (Array.isArray(draftMetaRef.current.triangleIndices) &&
      (draftMetaRef.current.triangleIndices as number[]).length > 0)

  useEffect(() => {
    if (!placementApiRef) return
    const api: PlacementApi = {
      setDraft: (draft) => {
        // Keep refs hot so finish/dblclick in the same tick sees fresh points.
        const pts = draft.points.map((p) => [...p] as RasPoint)
        inProgressRef.current = pts
        draftMetaRef.current = { ...draft.meta }
        setInProgressPoints(pts)
        setDraftMeta({ ...draft.meta })
      },
      getDraft: () => ({
        points: [...inProgressRef.current],
        meta: { ...draftMetaRef.current },
      }),
      clearDraft: clearDraftLocal,
      setInProgressPoints: (pts) => {
        const next = pts.map((p) => [...p] as RasPoint)
        inProgressRef.current = next
        setInProgressPoints(next)
      },
      clearInProgress: clearDraftLocal,
      getInProgressPoints: () => [...inProgressRef.current],
    }
    placementApiRef.current = api
    return () => {
      placementApiRef.current = null
    }
  }, [placementApiRef])

  useEffect(() => {
    if (activeMode !== 'place') {
      clearDraftLocal()
    }
  }, [activeMode])

  const draftDirty =
    activeMode === 'place' &&
    (stackDirty ||
      inProgressPoints.length > 0 ||
      (Array.isArray(draftMeta.triangleIndices) &&
        (draftMeta.triangleIndices as number[]).length > 0))

  const requestTypeChange = (next: AnnotationType) => {
    if (!onAnnotationTypeChange) return
    if (next === activeAnnotationType) return
    if (hasDraftContent()) discardDraft()
    onAnnotationTypeChange(next)
  }

  const showAnnotationTypes =
    activeMode === 'place' && isCandidateActive && onAnnotationTypeChange != null

  // R81: never unmount slice dock while Place is active.
  const showSliceDock =
    volumeAvailable &&
    (activeMode === 'place' || maximizedView !== 'three-d')

  return (
    <FeatureHintProvider>
      <div
        className={`cross-reference-workbench ${
          selectedObjectId ? 'has-inspector' : ''
        } ${isChatOpen ? 'has-chat' : ''}`}
      >
        <div className="canvas-context-strip" aria-label="Active mode options" role="region">
          <strong className="canvas-context-strip__mode">
            {activeMode === 'window-level'
              ? 'Window / Level'
              : activeMode === 'place'
                ? 'Place'
                : 'View'}
            {draftDirty ? (
              <span className="tab-dirty-indicator" title="Unsaved draft" />
            ) : null}
          </strong>
          {activeMode === 'view' ? (
            <span className="canvas-context-hint">
              {operationLabel ?? 'LMB rotate · MMB pan · RMB drag zoom · Ctrl+LMB roll'}
            </span>
          ) : null}
          {showAnnotationTypes ? (
            <div className="canvas-place-tools">
              <div
                className="canvas-annotation-types"
                role="toolbar"
                aria-label="Annotation types"
              >
                {PHASE1_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`canvas-context-action ${
                      activeAnnotationType === t.id ? 'is-active' : ''
                    }`}
                    aria-label={t.label}
                    aria-pressed={activeAnnotationType === t.id}
                    onClick={() => requestTypeChange(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
                <span
                  className="canvas-annotation-types__sep"
                  role="separator"
                  aria-label="Phase 2 annotation types"
                />
                {PHASE2_TYPES.map((t) => {
                  const meshBlocked = t.id === 'highlight' && !hasDisplayMesh
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`canvas-context-action ${
                        activeAnnotationType === t.id ? 'is-active' : ''
                      }`}
                      aria-label={
                        t.id === 'highlight' ? 'Surface Highlight' : t.label
                      }
                      aria-pressed={activeAnnotationType === t.id}
                      disabled={meshBlocked}
                      title={
                        meshBlocked ? 'Requires candidate mesh' : undefined
                      }
                      onClick={() => requestTypeChange(t.id)}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {activeAnnotationType === 'highlight' ? (
                <div
                  className="canvas-highlight-controls"
                  aria-label="Highlight brush controls"
                >
                  <label>
                    Brush
                    <input
                      type="range"
                      min={2}
                      max={30}
                      step={1}
                      aria-label="Brush radius"
                      value={brushRadiusMm}
                      onChange={(e) =>
                        onBrushRadiusChange?.(Number(e.target.value))
                      }
                    />
                    <span>{brushRadiusMm} mm</span>
                  </label>
                  <div
                    className="canvas-highlight-swatches"
                    role="group"
                    aria-label="Highlight color"
                  >
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`annotation-color-swatch ${
                          highlightColor === c.id ? 'is-active' : ''
                        }`}
                        aria-label={`Color ${c.id}`}
                        aria-pressed={highlightColor === c.id}
                        style={{ background: c.hex }}
                        onClick={() => onHighlightColorChange?.(c.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {activeAnnotationType === 'plane' ? (
                <div
                  className="canvas-plane-method"
                  role="group"
                  aria-label="Plane placement method"
                >
                  <button
                    type="button"
                    className={`canvas-context-action ${
                      planeMethod === 'point-normal' ? 'is-active' : ''
                    }`}
                    aria-label="Point-normal"
                    aria-pressed={planeMethod === 'point-normal'}
                    onClick={() => onPlaneMethodChange?.('point-normal')}
                  >
                    Point-normal
                  </button>
                  <button
                    type="button"
                    className={`canvas-context-action ${
                      planeMethod === 'three-point' ? 'is-active' : ''
                    }`}
                    aria-label="Three-point"
                    aria-pressed={planeMethod === 'three-point'}
                    onClick={() => onPlaneMethodChange?.('three-point')}
                  >
                    Three-point
                  </button>
                </div>
              ) : null}
              {pointSetPlaceHint(activeAnnotationType) ? (
                <span className="canvas-context-hint" data-testid="place-type-hint">
                  {pointSetPlaceHint(activeAnnotationType)}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="canvas-context-strip__actions">
            {operationControls}
            <button
              type="button"
              className={`canvas-context-action ${isChatOpen ? 'is-active' : ''}`}
              aria-label={isChatOpen ? 'Collapse AI assistant' : 'Expand AI assistant'}
              aria-pressed={isChatOpen}
              onClick={() => setChatOpen(!isChatOpen)}
            >
              <Sparkles size={14} />
              <span>AI Assistant</span>
            </button>
          </div>
          {activeMode === 'window-level' ? (
            <span className="canvas-context-hint">
              Drag to adjust brightness and contrast · Ctrl-drag samples a region
            </span>
          ) : null}
          {activeMode === 'place' && !showAnnotationTypes ? (
            <span className="canvas-context-hint">
              Place point · anatomy remains unchanged
            </span>
          ) : null}
        </div>

        <aside className="canvas-mode-rail" role="toolbar" aria-label="Interaction modes">
          {MODES.map((mode) => {
            const Icon = mode.icon
            const disabled = mode.id === 'window-level' && !volumeAvailable
            const button = (
              <button
                type="button"
                className={`canvas-mode-button ${activeMode === mode.id ? 'is-active' : ''}`}
                aria-label={disabled ? 'Requires volume intensity data' : `${mode.label} mode`}
                aria-pressed={activeMode === mode.id}
                disabled={disabled}
                onClick={() => onModeChange(mode.id)}
              >
                <Icon size={18} />
                <span>{mode.label}</span>
              </button>
            )
            return (
              <FeatureHint
                key={mode.id}
                {...mode.hint}
                side="right"
                disabledReason={disabled ? 'Requires volume intensity data' : undefined}
              >
                {/* Disabled buttons do not emit pointer events; span keeps the hint reachable. */}
                {disabled ? <span className="feature-hint-target">{button}</span> : button}
              </FeatureHint>
            )
          })}
        </aside>

        <main className="canvas-work-area">
          {!maximizedView || maximizedView === 'three-d' || activeMode === 'place' ? (
            <ViewFrame
              label="3D view"
              title="3D"
              meta={`${documentName} · ${projection === 'perspective' ? 'Perspective' : 'Orthographic'}`}
              active={true}
              controls={viewControls}
              maximized={maximizedView === 'three-d' && activeMode !== 'place'}
              onMaximizeChange={(maximized) => {
                if (activeMode === 'place') return
                setMaximizedView(maximized ? 'three-d' : null)
              }}
            >
              {children}
            </ViewFrame>
          ) : null}
          {showSliceDock ? (
            <SliceDock
              collapsed={sliceDockCollapsed}
              onCollapsedChange={setSliceDockCollapsed}
              voxels={voxels}
              sizes={volumeSizes}
              crosshair={crosshair}
              crosshairRas={crosshairRas}
              mode={activeMode}
              windowCenter={windowCenter}
              windowWidth={windowWidth}
              onCrosshairChange={onCrosshairChange}
              onWindowChange={onWindowChange}
              onPlace={onPlace}
              placeRequireDblClick={placeRequireDblClick}
              onPlaceFinish={
                activeAnnotationType === 'closed_curve' ||
                activeAnnotationType === 'open_curve'
                  ? onFinishDraft
                  : undefined
              }
              maximizedPlane={
                activeMode === 'place' || maximizedView === 'three-d'
                  ? null
                  : maximizedView
              }
              onMaximizedPlaneChange={(plane) => {
                if (activeMode === 'place') return
                setMaximizedView(plane)
              }}
            />
          ) : null}
        </main>

        {selectedObjectId && inspector ? (
          <aside className="canvas-inspector-drawer" aria-label="Inspector">
            {inspector}
          </aside>
        ) : null}

        {isChatOpen ? (
          <aside className="canvas-chat-column" aria-label="AI workspace assistant">
            <AiChatPanel
              open={isChatOpen}
              onOpenChange={setChatOpen}
              contextLabel={documentName}
              chatContext={chatContext}
            />
          </aside>
        ) : (
          <button
            type="button"
            className="canvas-chat-edge-tab"
            aria-label="Expand AI assistant"
            onClick={() => setChatOpen(true)}
            title="Expand AI workspace assistant"
          >
            <Sparkles size={14} />
            <span>AI Assistant</span>
          </button>
        )}

      </div>
    </FeatureHintProvider>
  )
}
