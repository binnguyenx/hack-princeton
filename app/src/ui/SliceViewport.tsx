import { useEffect, useRef, useState } from 'react'
import {
  computeSliceContentFit,
  extractSlice,
  ijkToSliceUv,
  mapFittedViewToSliceUv,
  mapSliceUvToFittedView,
  sliceUvToIjk,
  type IjkPoint,
  type SliceContentFit,
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

/** Soft monochrome slice studio — air is Base gray; bone darkens toward Ink. */
const SLICE_BG_RGB = [232, 234, 238] as const
const SLICE_INK_RGB = [42, 46, 53] as const

function fullFit(width: number, height: number): SliceContentFit {
  return { width, height, u0: 0, v0: 0, u1: width, v1: height }
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
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fitRef = useRef<SliceContentFit>(fullFit(1, 1))
  const viewSizeRef = useRef({ width: 1, height: 1 })
  const dragRef = useRef<{
    x: number
    y: number
    center: number
    width: number
  } | null>(null)
  const [crosshairView, setCrosshairView] = useState({ x: 0.5, y: 0.5 })

  const offset =
    plane === 'axial' ? crosshair[2] : plane === 'sagittal' ? crosshair[0] : crosshair[1]
  const maxOffset =
    (plane === 'axial' ? sizes[2] : plane === 'sagittal' ? sizes[0] : sizes[1]) - 1

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const paint = () => {
      const rect = host.getBoundingClientRect()
      const cssWidth = Math.max(1, Math.floor(rect.width))
      const cssHeight = Math.max(1, Math.floor(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(cssWidth * dpr)
      canvas.height = Math.floor(cssHeight * dpr)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      viewSizeRef.current = { width: cssWidth, height: cssHeight }

      const slice = extractSlice(voxels, sizes, plane, offset)
      const low = windowCenter - windowWidth / 2
      const safeWidth = Math.max(windowWidth, 1)
      const windowed = new Uint8Array(slice.values.length)
      for (let index = 0; index < slice.values.length; index += 1) {
        windowed[index] = Math.round(
          Math.max(0, Math.min(255, ((slice.values[index]! - low) / safeWidth) * 255)),
        )
      }

      const fit = computeSliceContentFit(windowed, slice.width, slice.height)
      fitRef.current = fit

      const source = document.createElement('canvas')
      source.width = slice.width
      source.height = slice.height
      const sourceContext = source.getContext('2d')
      if (!sourceContext) return
      const image = sourceContext.createImageData(slice.width, slice.height)
      for (let index = 0; index < windowed.length; index += 1) {
        const t = windowed[index]! / 255
        const pixel = index * 4
        image.data[pixel] = Math.round(
          SLICE_BG_RGB[0] + (SLICE_INK_RGB[0] - SLICE_BG_RGB[0]) * t,
        )
        image.data[pixel + 1] = Math.round(
          SLICE_BG_RGB[1] + (SLICE_INK_RGB[1] - SLICE_BG_RGB[1]) * t,
        )
        image.data[pixel + 2] = Math.round(
          SLICE_BG_RGB[2] + (SLICE_INK_RGB[2] - SLICE_BG_RGB[2]) * t,
        )
        image.data[pixel + 3] = 255
      }
      sourceContext.putImageData(image, 0, 0)

      context.fillStyle = `rgb(${SLICE_BG_RGB.join(',')})`
      context.fillRect(0, 0, cssWidth, cssHeight)
      const contentW = Math.max(fit.u1 - fit.u0, 1)
      const contentH = Math.max(fit.v1 - fit.v0, 1)
      // Zoom to anatomy AABB, but draw the *full* plane — never crop source pixels
      // or the vault gets a hard straight cut through bone.
      const scale = Math.min(cssWidth / contentW, cssHeight / contentH) * 0.98
      const centerU = (fit.u0 + fit.u1) / 2
      const centerV = (fit.v0 + fit.v1) / 2
      const offsetX = cssWidth / 2 - centerU * scale
      const offsetY = cssHeight / 2 - centerV * scale
      context.imageSmoothingEnabled = false
      context.drawImage(
        source,
        0,
        0,
        slice.width,
        slice.height,
        offsetX,
        offsetY,
        slice.width * scale,
        slice.height * scale,
      )

      const uv = ijkToSliceUv(plane, crosshair, sizes)
      setCrosshairView(
        mapSliceUvToFittedView(uv.u, uv.v, fit, cssWidth, cssHeight),
      )
    }

    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(host)
    return () => observer.disconnect()
  }, [
    crosshair,
    offset,
    plane,
    sizes,
    voxels,
    windowCenter,
    windowWidth,
  ])

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): IjkPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    const view = viewSizeRef.current
    const uv = mapFittedViewToSliceUv(
      (event.clientX - bounds.left) / Math.max(bounds.width, 1),
      (event.clientY - bounds.top) / Math.max(bounds.height, 1),
      fitRef.current,
      view.width,
      view.height,
    )
    return sliceUvToIjk(plane, uv.u, uv.v, sizes, crosshair)
  }

  const planeHint =
    plane === 'axial'
      ? CANVAS_HINTS.axialSlice
      : plane === 'sagittal'
        ? CANVAS_HINTS.sagittalSlice
        : CANVAS_HINTS.coronalSlice

  return (
    <div ref={hostRef} className={`slice-viewport is-${mode}`}>
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
        style={{ top: `${crosshairView.y * 100}%` }}
      />
      <div
        className="slice-viewport__crosshair slice-viewport__crosshair--y"
        style={{ left: `${crosshairView.x * 100}%` }}
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
