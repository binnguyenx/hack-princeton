import { blendSlice, type CandidateBlend } from '../geometry/candidateBlend'
import type { SourceLandmark } from '../domain/types'
import { useEffect, useRef, useState } from 'react'
import { extractSlice, slicePointToIjk, volumeIntensityRange, type IjkPoint, type SlicePlaneId, type VolumeSizes } from '../geometry/slices'
import { fitSlice, regionWindow } from '../geometry/slicePresentation'
import { updateCanvasRuntime } from '../debug/bridge'
import type { CanvasMode } from './CanvasWorkspace'

type Props = {
  foreground?: Uint8Array
  foregroundReason?: string
  landmarks?: SourceLandmark[]
  plane: SlicePlaneId; label: string; voxels: Uint8Array; sizes: VolumeSizes; crosshair: IjkPoint
  spacings?: [number, number, number]; mode: CanvasMode; windowCenter: number; windowWidth: number
  onCrosshairChange: (point: IjkPoint) => void; onWindowChange: (center: number, width: number) => void
  onPlace: (point: IjkPoint) => void
}
type Drag = { kind: 'window' | 'region' | 'pan' | 'zoom'; x: number; y: number; center: number; width: number; start: IjkPoint; pan: [number, number]; zoom: number }
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export function SliceViewport({ foreground, foregroundReason, landmarks = [], plane, label, voxels, sizes, spacings = [1, 1, 1], crosshair, mode,
  windowCenter, windowWidth, onCrosshairChange, onWindowChange, onPlace }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<[number, number]>([0, 0])
  const [showForeground, setShowForeground] = useState(false)
  const [opacity, setOpacity] = useState(.5)
  const [blend, setBlend] = useState<CandidateBlend>('normal')
  const [smooth, setSmooth] = useState(false)
  const [box, setBox] = useState({ width: 1, height: 1 })
  const [error, setError] = useState<string | null>(null)
  const axis = plane === 'axial' ? 2 : plane === 'sagittal' ? 0 : 1
  const u = plane === 'sagittal' ? 1 : 0
  const v = plane === 'axial' ? 1 : 2
  const offset = crosshair[axis], maxOffset = sizes[axis] - 1
  const frame = fitSlice(Math.max(box.width, 1), Math.max(box.height, 1), sizes[u], sizes[v], Math.abs(spacings[u]), Math.abs(spacings[v]))
  const reset = () => { setZoom(1); setPan([0, 0]); setError(null) }
  const activate = () => updateCanvasRuntime({ activeView: plane })
  const step = (delta: number) => {
    const next = [...crosshair] as IjkPoint
    next[axis] = clamp(next[axis] + delta, 0, maxOffset)
    onCrosshairChange(next)
  }
  const automaticWindow = () => {
    const [low, high] = volumeIntensityRange(voxels)
    onWindowChange((low + high) / 2, Math.max(high - low, 1))
  }
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => setBox({ width: stage.clientWidth, height: stage.clientHeight }))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setZoom(1); setPan([0, 0]); drag.current = null }, [voxels])
  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const slice = extractSlice(voxels, sizes, plane, offset)
    canvas.width = slice.width; canvas.height = slice.height
    const image = context.createImageData(slice.width, slice.height)
    const candidate = foreground && showForeground ? extractSlice(foreground, sizes, plane, offset).values : undefined
    image.data.set(blendSlice(slice.values, candidate, windowCenter, windowWidth, opacity, blend))
    context.putImageData(image, 0, 0)
  }, [voxels, sizes, plane, offset, windowCenter, windowWidth, foreground, showForeground, opacity, blend])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); activate()
      if (event.ctrlKey || event.metaKey) setZoom((value) => clamp(value * Math.exp(-event.deltaY * .002), .5, 8))
      else step(event.deltaY > 0 ? 1 : -1)
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  })
  function point(event: React.PointerEvent<HTMLCanvasElement>): IjkPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return slicePointToIjk(plane, (event.clientX - bounds.left) / Math.max(bounds.width, 1),
      (event.clientY - bounds.top) / Math.max(bounds.height, 1), sizes, crosshair)
  }
  return <div className={`slice-viewport is-${mode}`} onFocusCapture={activate} onPointerDownCapture={activate}>
    <div className="slice-tools" role="toolbar" aria-label={`${label} slice controls`}>
      <button type="button" aria-label={`Zoom in ${label}`} onClick={() => setZoom((n) => clamp(n * 1.25, .5, 8))}>+</button>
      <button type="button" aria-label={`Zoom out ${label}`} onClick={() => setZoom((n) => clamp(n / 1.25, .5, 8))}>−</button>
      <button type="button" aria-label={`Reset ${label} slice view`} onClick={reset}>Reset</button>
      <button type="button" aria-label={`Automatic window ${label}`} onClick={automaticWindow}>Auto W/L</button>
      <button type="button" aria-label={`Smooth interpolation ${label}`} aria-pressed={smooth} onClick={() => setSmooth((n) => !n)}>Smooth</button>
      <button type="button" aria-label={`Candidate mask ${label}`} aria-pressed={showForeground && Boolean(foreground)} disabled={!foreground}
        title={foreground ? 'Blend current identity-pose candidate mask' : foregroundReason ?? 'Open an identity-pose binary candidate'}
        onClick={() => setShowForeground((value) => !value)}>Mask</button>
      {showForeground && foreground ? <><input type="range" aria-label={`Candidate opacity ${label}`} min="0" max="100" value={opacity * 100}
        onChange={(event) => setOpacity(Number(event.target.value) / 100)} />
        <select aria-label={`Candidate blend ${label}`} value={blend} onChange={(event) => setBlend(event.target.value as CandidateBlend)}>
          <option value="normal">Overlay</option><option value="maximum">Maximum</option><option value="difference">Difference</option>
        </select></> : null}
    </div>
    <div className="slice-stage" ref={stageRef}>
      <div className="slice-image" style={{ ...frame, transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})` }}>
        <canvas ref={canvasRef} aria-label={`${label} anatomy slice`} tabIndex={0}
          style={{ imageRendering: smooth ? 'auto' : 'pixelated' }} data-zoom={zoom} data-pan={pan.join(',')}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
            const key = event.key.toLowerCase()
            if (['arrowleft', 'arrowdown', 'b'].includes(key)) step(-1)
            else if (['arrowright', 'arrowup', 'f'].includes(key)) step(1)
            else if (key === 't' && foreground) setShowForeground((value) => !value)
            else if (key === 'r') reset()
            else if (key === '+') setZoom((n) => clamp(n * 1.25, .5, 8))
            else if (key === '-') setZoom((n) => clamp(n / 1.25, .5, 8))
            else return
            event.preventDefault(); event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
            const kind = event.button === 1 || event.shiftKey ? 'pan' : event.button === 2 ? 'zoom'
              : mode === 'window-level' ? (event.ctrlKey || event.metaKey ? 'region' : 'window') : null
            if (kind) { drag.current = { kind, x: event.clientX, y: event.clientY, center: windowCenter,
              width: windowWidth, start: point(event), pan, zoom }; return }
            if (event.button !== 0) return
            const picked = point(event); onCrosshairChange(picked)
            if (mode === 'place') onPlace(picked)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start) return
            const dx = event.clientX - start.x, dy = event.clientY - start.y
            if (start.kind === 'window') onWindowChange(start.center + dx, Math.max(1, start.width + dy))
            if (start.kind === 'pan') setPan([clamp(start.pan[0] + dx, -box.width, box.width), clamp(start.pan[1] + dy, -box.height, box.height)])
            if (start.kind === 'zoom') setZoom(clamp(start.zoom * Math.exp(-dy * .01), .5, 8))
          }}
          onPointerUp={(event) => {
            const start = drag.current; drag.current = null
            if (start?.kind === 'region') {
              try { const range = regionWindow(voxels, sizes, plane, start.start, point(event)); onWindowChange(range.center, range.width); setError(null) }
              catch (reason) { setError(String(reason)) }
            }
          }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} />
        {landmarks.filter((point) => Math.abs(point.ijk[axis] - offset) < .5).map((point) =>
          <span key={point.id} className="slice-landmark" title={point.label} aria-label={`Landmark ${point.label} in ${label}`}
            style={{ left: `${point.ijk[u] / Math.max(sizes[u] - 1, 1) * 100}%`, top: `${point.ijk[v] / Math.max(sizes[v] - 1, 1) * 100}%` }}>+ {point.label}</span>)}
        <div className="slice-viewport__crosshair slice-viewport__crosshair--x" style={{ top: `${crosshair[v] / Math.max(sizes[v] - 1, 1) * 100}%` }} />
        <div className="slice-viewport__crosshair slice-viewport__crosshair--y" style={{ left: `${crosshair[u] / Math.max(sizes[u] - 1, 1) * 100}%` }} />
      </div>
    </div>
    <input type="range" className="slice-preview__offset" aria-label={`${label} slice offset`} min={0} max={Math.max(maxOffset, 0)} value={offset}
      onChange={(event) => { const next = [...crosshair] as IjkPoint; next[axis] = Number(event.target.value); onCrosshairChange(next) }} />
    {error ? <div role="alert">{error}</div> : null}
  </div>
}
