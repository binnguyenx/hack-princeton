import {
  Box,
  Eye,
  EyeOff,
  Crosshair,
  Focus,
  RotateCcw,
  Sun,
} from 'lucide-react'
import type { ViewPreset } from '../viewport/Viewport'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint } from './FeatureHint'

export type ProjectionMode = 'perspective' | 'orthographic'

type Props = {
  diagnosticsEnabled?: boolean
  onDiagnosticsChange?: (enabled: boolean) => void
  objectVisible?: boolean
  canToggleVisibility?: boolean
  onToggleVisibility?: () => void
  onShowAll?: () => void
  projection: ProjectionMode
  crosshairEnabled: boolean
  lightingIntensity: number
  onCenter: () => void
  onReset: () => void
  onPreset: (preset: ViewPreset) => void
  onProjectionChange: (projection: ProjectionMode) => void
  onCrosshairChange: (enabled: boolean) => void
  onLightingChange: (intensity: number) => void
}

const DIRECTIONS: {
  label: string
  short: string
  preset: ViewPreset
  hint: { label: string; description: string; shortcut?: string }
}[] = [
  { label: 'Anterior', short: 'A', preset: 'anterior', hint: CANVAS_HINTS.viewAnterior },
  { label: 'Posterior', short: 'P', preset: 'posterior', hint: CANVAS_HINTS.viewPosterior },
  { label: 'Left', short: 'L', preset: 'left', hint: CANVAS_HINTS.viewLeft },
  { label: 'Right', short: 'R', preset: 'right', hint: CANVAS_HINTS.viewRight },
  { label: 'Superior', short: 'S', preset: 'superior', hint: CANVAS_HINTS.viewSuperior },
  { label: 'Inferior', short: 'I', preset: 'inferior', hint: CANVAS_HINTS.viewInferior },
]

export function ViewController({
  diagnosticsEnabled = false,
  onDiagnosticsChange,
  objectVisible = true,
  canToggleVisibility = false,
  onToggleVisibility,
  onShowAll,
  projection,
  crosshairEnabled,
  lightingIntensity,
  onCenter,
  onReset,
  onPreset,
  onProjectionChange,
  onCrosshairChange,
  onLightingChange,
}: Props) {
  return (
    <div className="view-controller" role="toolbar" aria-label="3D view controls">
      {onDiagnosticsChange ? <button type="button" className="canvas-icon-button" aria-label="Rendering diagnostics" aria-pressed={diagnosticsEnabled}
        title="Measured render-loop FPS and renderer draw counts" onClick={() => onDiagnosticsChange(!diagnosticsEnabled)}>FPS</button> : null}
      <FeatureHint {...CANVAS_HINTS.centerView} side="bottom">
        <button type="button" className="canvas-icon-button" aria-label="Center 3D view" onClick={onCenter}>
          <Focus size={14} />
        </button>
      </FeatureHint>
      <FeatureHint {...CANVAS_HINTS.resetView} side="bottom">
        <button type="button" className="canvas-icon-button" aria-label="Reset 3D view" onClick={onReset}>
          <RotateCcw size={14} />
        </button>
      </FeatureHint>
      <div className="view-controller__directions" aria-label="Patient views">
        {DIRECTIONS.map((direction) => (
          <FeatureHint key={direction.preset} {...direction.hint} side="bottom">
            <button
              type="button"
              className="view-controller__direction"
              aria-label={`${direction.label} view`}
              onClick={() => onPreset(direction.preset)}
            >
              {direction.short}
            </button>
          </FeatureHint>
        ))}
      </div>
      <FeatureHint {...CANVAS_HINTS.projection} side="bottom">
        <button
          type="button"
          className={`canvas-icon-button ${projection === 'orthographic' ? 'is-active' : ''}`}
          aria-label={projection === 'perspective' ? 'Orthographic projection' : 'Perspective projection'}
          aria-pressed={projection === 'orthographic'}
          onClick={() =>
            onProjectionChange(
              projection === 'perspective' ? 'orthographic' : 'perspective',
            )
          }
        >
          <Box size={14} />
        </button>
      </FeatureHint>
      <FeatureHint {...CANVAS_HINTS.crosshairOverlay} side="bottom">
        <button
          type="button"
          className={`canvas-icon-button ${crosshairEnabled ? 'is-active' : ''}`}
          aria-label={crosshairEnabled ? 'Hide crosshair' : 'Show crosshair'}
          aria-pressed={crosshairEnabled}
          onClick={() => onCrosshairChange(!crosshairEnabled)}
        >
          <Crosshair size={14} />
        </button>
      </FeatureHint>
      <FeatureHint {...CANVAS_HINTS.objectVisibility} side="bottom">
        <button type="button" className="canvas-icon-button"
          aria-label={objectVisible ? 'Hide active object' : 'Show active object'}
          aria-pressed={!objectVisible} disabled={!canToggleVisibility} onClick={onToggleVisibility}>
          {objectVisible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </FeatureHint>
      <FeatureHint {...CANVAS_HINTS.showAllObjects} side="bottom">
        <button type="button" className="canvas-icon-button" aria-label="Show all objects"
          disabled={!onShowAll} onClick={onShowAll}><Eye size={14} /><span>All</span></button>
      </FeatureHint>
      <FeatureHint {...CANVAS_HINTS.lighting} side="bottom">
        <label className="view-controller__lighting">
          <Sun size={14} aria-hidden="true" />
          <input
            type="range"
            min={0.4}
            max={1.8}
            step={0.05}
            value={lightingIntensity}
            aria-label="Scene lighting"
            onChange={(event) => onLightingChange(Number(event.target.value))}
          />
        </label>
      </FeatureHint>
    </div>
  )
}
