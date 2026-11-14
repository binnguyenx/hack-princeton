import { ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import type { Vec3 } from '../geometry/coordinates'
import type { IjkPoint, SlicePlaneId, VolumeSizes } from '../geometry/slices'
import type { CanvasMode } from './CanvasWorkspace'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint } from './FeatureHint'
import { SliceViewport } from './SliceViewport'
import { ViewFrame } from './ViewFrame'

type Props = {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  voxels?: Uint8Array
  sizes?: VolumeSizes
  crosshair: IjkPoint
  crosshairRas: Vec3
  mode: CanvasMode
  windowCenter: number
  windowWidth: number
  onCrosshairChange: (point: IjkPoint) => void
  onWindowChange: (center: number, width: number) => void
  onPlace: (point: IjkPoint) => void
  maximizedPlane: SlicePlaneId | null
  onMaximizedPlaneChange: (plane: SlicePlaneId | null) => void
}

const PLANES: { id: SlicePlaneId; label: string; coordinate: 0 | 1 | 2; prefix: string }[] = [
  { id: 'axial', label: 'Axial', coordinate: 2, prefix: 'S' },
  { id: 'sagittal', label: 'Sagittal', coordinate: 0, prefix: 'R' },
  { id: 'coronal', label: 'Coronal', coordinate: 1, prefix: 'A' },
]

export function SliceDock({
  collapsed,
  onCollapsedChange,
  voxels,
  sizes,
  crosshair,
  crosshairRas,
  mode,
  windowCenter,
  windowWidth,
  onCrosshairChange,
  onWindowChange,
  onPlace,
  maximizedPlane,
  onMaximizedPlaneChange,
}: Props) {
  if (collapsed) {
    return (
      <section className="slice-dock slice-dock--collapsed" aria-label="Synchronized slice dock">
        <div className="slice-dock__summary">
          <Link2 size={14} />
          <span>Slices: Axial · Sagittal · Coronal</span>
          <span className="slice-dock__link-state">Linked</span>
        </div>
        <FeatureHint {...CANVAS_HINTS.expandDock} side="top">
          <button
            type="button"
            className="canvas-icon-button"
            aria-label="Expand slice dock"
            onClick={() => onCollapsedChange(false)}
          >
            <ChevronUp size={15} />
          </button>
        </FeatureHint>
      </section>
    )
  }

  return (
    <section className="slice-dock" aria-label="Synchronized slice dock">
      <div className="slice-dock__bar">
        <span>Cross-reference slices</span>
        <span className="slice-dock__link-state">
          <Link2 size={12} /> Linked
        </span>
        <FeatureHint {...CANVAS_HINTS.collapseDock} side="top">
          <button
            type="button"
            className="canvas-icon-button"
            aria-label="Collapse slice dock"
            onClick={() => onCollapsedChange(true)}
          >
            <ChevronDown size={15} />
          </button>
        </FeatureHint>
      </div>
      <div className="slice-dock__views">
        {PLANES.filter((plane) => !maximizedPlane || plane.id === maximizedPlane).map((plane) => (
          <ViewFrame
            key={plane.id}
            label={`${plane.label} slice view`}
            title={plane.label}
            meta={`${plane.prefix} ${crosshairRas[plane.coordinate].toFixed(2)} mm`}
            maximized={maximizedPlane === plane.id}
            onMaximizeChange={(maximized) =>
              onMaximizedPlaneChange(maximized ? plane.id : null)
            }
          >
            {voxels && sizes ? (
              <SliceViewport
                plane={plane.id}
                label={plane.label}
                voxels={voxels}
                sizes={sizes}
                crosshair={crosshair}
                mode={mode}
                windowCenter={windowCenter}
                windowWidth={windowWidth}
                onCrosshairChange={onCrosshairChange}
                onWindowChange={onWindowChange}
                onPlace={onPlace}
              />
            ) : (
              <div className="slice-preview slice-preview--unavailable" role="status">
                Volume loading
              </div>
            )}
          </ViewFrame>
        ))}
      </div>
    </section>
  )
}
