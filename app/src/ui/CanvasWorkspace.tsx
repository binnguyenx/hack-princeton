import { useState, type ReactNode } from 'react'
import {
  Contrast,
  MapPin,
  MousePointer2,
  Sparkles,
} from 'lucide-react'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint, FeatureHintProvider } from './FeatureHint'
import { SliceDock } from './SliceDock'
import { ViewFrame } from './ViewFrame'
import { AiChatPanel } from './AiChatPanel'
import type { Vec3 } from '../geometry/coordinates'
import type { IjkPoint, SlicePlaneId, VolumeSizes } from '../geometry/slices'

export type CanvasMode = 'view' | 'window-level' | 'place'

type Props = {
  documentName: string
  activeMode: CanvasMode
  volumeAvailable: boolean
  selectedObjectId: string | null
  onModeChange: (mode: CanvasMode) => void
  inspector?: ReactNode
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
}

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

export function CanvasWorkspace({
  documentName,
  activeMode,
  volumeAvailable,
  selectedObjectId,
  onModeChange,
  inspector,
  status,
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
}: Props) {
  const [sliceDockCollapsed, setSliceDockCollapsed] = useState(false)
  const [maximizedView, setMaximizedView] = useState<'three-d' | SlicePlaneId | null>(
    null,
  )
  const [internalChatOpen, setInternalChatOpen] = useState(true)
  const isChatOpen = aiChatOpen !== undefined ? aiChatOpen : internalChatOpen
  const setChatOpen = onAiChatOpenChange ?? setInternalChatOpen

  return (
    <FeatureHintProvider>
      <div
        className={`cross-reference-workbench ${
          selectedObjectId ? 'has-inspector' : ''
        } ${isChatOpen ? 'has-chat' : ''}`}
      >
        <div className="canvas-context-strip" aria-label="Active mode options">
          <strong>{activeMode === 'window-level' ? 'Window / Level' : activeMode === 'place' ? 'Place' : 'View'}</strong>
          {activeMode === 'view' ? (
            <span className="canvas-context-hint">
              {operationLabel ?? 'LMB rotate · MMB pan · RMB drag zoom · Ctrl+LMB roll'}
            </span>
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
          {activeMode === 'place' ? (
            <span className="canvas-context-hint">
              Place point · One shot · anatomy remains unchanged
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
          {!maximizedView || maximizedView === 'three-d' ? (
            <ViewFrame
              label="3D view"
              title="3D"
              meta={`${documentName} · ${projection === 'perspective' ? 'Perspective' : 'Orthographic'}`}
              active={true}
              controls={viewControls}
              maximized={maximizedView === 'three-d'}
              onMaximizeChange={(maximized) =>
                setMaximizedView(maximized ? 'three-d' : null)
              }
            >
              {children}
            </ViewFrame>
          ) : null}
          {volumeAvailable && maximizedView !== 'three-d' ? (
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
              maximizedPlane={maximizedView}
              onMaximizedPlaneChange={(plane) => setMaximizedView(plane)}
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

        <footer className="canvas-workbench-status">
          {status ?? (
            <>
              <span><strong>RAS</strong> R 0.00 · A 0.00 · S 0.00 mm</span>
              <span>View mode · Ready</span>
            </>
          )}
        </footer>
      </div>
    </FeatureHintProvider>
  )
}
