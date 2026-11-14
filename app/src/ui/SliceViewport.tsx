import { useEffect, useRef } from 'react'
import {
  extractSlice,
  slicePointToIjk,
  type IjkPoint,
  type SlicePlaneId,
  type VolumeSizes,
} from '../geometry/slices'
import type { CanvasMode } from './CanvasWorkspace'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint } from './FeatureHint'

type Props = {
  plane: SlicePlaneId
  label: string
  voxels: Uint8Array
  sizes: VolumeSizes
  crosshair: IjkPoint
  mode: CanvasMode
  windowCenter: number
  windowWidth: number
  onCrosshairChange: (point: IjkPoint) => void
  onWindowChange: (center: number, width: number) => void
  onPlace: (point: IjkPoint) => void
}

export function SliceViewport({
  plane,
  label,
  voxels,
  sizes,
  crosshair,
  mode,
  windowCenter,
  windowWidth,
  onCrosshairChange,
  onWindowChange,
  onPlace,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    x: number
    y: number
    center: number
    width: number
  } | null>(null)
  const offset =
    plane === 'axial' ? crosshair[2] : plane === 'sagittal' ? crosshair[0] : crosshair[1]
  const maxOffset =
    (plane === 'axial' ? sizes[2] : plane === 'sagittal' ? sizes[0] : sizes[1]) - 1

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const slice = extractSlice(voxels, sizes, plane, offset)
    canvas.width = slice.width
    canvas.height = slice.height
    const image = context.createImageData(slice.width, slice.height)
    const low = windowCenter - windowWidth / 2
    const safeWidth = Math.max(windowWidth, 1)
    for (let index = 0; index < slice.values.length; index += 1) {
      const intensity = Math.round(
        Math.max(0, Math.min(255, ((slice.values[index] - low) / safeWidth) * 255)),
      )
      const pixel = index * 4
      image.data[pixel] = intensity
      image.data[pixel + 1] = intensity
      image.data[pixel + 2] = intensity
      image.data[pixel + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [offset, plane, sizes, voxels, windowCenter, windowWidth])

  const horizontal =
    plane === 'sagittal'
      ? crosshair[1] / Math.max(sizes[1] - 1, 1)
      : crosshair[0] / Math.max(sizes[0] - 1, 1)
  const vertical =
    plane === 'axial'
      ? crosshair[1] / Math.max(sizes[1] - 1, 1)
      : crosshair[2] / Math.max(sizes[2] - 1, 1)

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): IjkPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return slicePointToIjk(
      plane,
      (event.clientX - bounds.left) / Math.max(bounds.width, 1),
      (event.clientY - bounds.top) / Math.max(bounds.height, 1),
      sizes,
      crosshair,
    )
  }

  const planeHint =
    plane === 'axial'
      ? CANVAS_HINTS.axialSlice
      : plane === 'sagittal'
        ? CANVAS_HINTS.sagittalSlice
        : CANVAS_HINTS.coronalSlice

  return (
    <div className={`slice-viewport is-${mode}`}>
      <FeatureHint {...planeHint} side="top">
        <canvas
          ref={canvasRef}
          aria-label={`${label} anatomy slice`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            if (mode === 'window-level') {
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                center: windowCenter,
                width: windowWidth,
              }
              return
            }
            const point = pointFromEvent(event)
            onCrosshairChange(point)
            if (mode === 'place') onPlace(point)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || mode !== 'window-level') return
            onWindowChange(
              drag.center + (event.clientX - drag.x),
              Math.max(1, drag.width + (event.clientY - drag.y)),
            )
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
        />
      </FeatureHint>
      <div
        className="slice-viewport__crosshair slice-viewport__crosshair--x"
        style={{ top: `${vertical * 100}%` }}
      />
      <div
        className="slice-viewport__crosshair slice-viewport__crosshair--y"
        style={{ left: `${horizontal * 100}%` }}
      />
      <FeatureHint
        {...CANVAS_HINTS.sliceOffset}
        label={`${label} slice offset`}
        side="top"
      >
        <input
          type="range"
          className="slice-preview__offset"
          aria-label={`${label} slice offset`}
          min={0}
          max={Math.max(maxOffset, 0)}
          value={offset}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (plane === 'axial') onCrosshairChange([crosshair[0], crosshair[1], next])
            else if (plane === 'sagittal') onCrosshairChange([next, crosshair[1], crosshair[2]])
            else onCrosshairChange([crosshair[0], next, crosshair[2]])
          }}
        />
      </FeatureHint>
    </div>
  )
}
