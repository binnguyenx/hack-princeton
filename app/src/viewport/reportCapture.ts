import * as THREE from 'three'
import type { Annotation, RasPoint } from '../domain/types'
import { annotationColorCss, resolveAnnotationColorKey } from '../domain/annotationPalette'

/**
 * Offscreen captures for case reports (ai-case-report R7–R9). Everything here uses its own camera
 * and render target, so the user's camera, selection and visible canvas never change (R8).
 */

export type CapturePreset = 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior' | 'hero_oblique'

/** RAS view directions; the six presets match the toolbar's view presets. */
const DIRECTIONS: Record<CapturePreset, THREE.Vector3> = {
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  anterior: new THREE.Vector3(0, 1, 0),
  posterior: new THREE.Vector3(0, -1, 0),
  superior: new THREE.Vector3(0, 0, 1),
  inferior: new THREE.Vector3(0, 0, -1),
  // Front-left, slightly above: the three-quarter view used on report covers.
  hero_oblique: new THREE.Vector3(-1, 1, 0.6).normalize(),
}

export const CAPTURE_FOV_DEG = 30

export function isCapturePreset(value: string): value is CapturePreset {
  return value in DIRECTIONS
}

/** A new camera that frames `box` from the preset direction; never the user's camera. */
export function captureCamera(
  preset: CapturePreset,
  box: THREE.Box3,
  width: number,
  height: number,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(CAPTURE_FOV_DEG, width / height, 0.1, 10_000)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 1)
  const halfFov = THREE.MathUtils.degToRad(CAPTURE_FOV_DEG / 2)
  const halfFovX = Math.atan(Math.tan(halfFov) * camera.aspect)
  const distance = (radius / Math.sin(Math.min(halfFov, halfFovX))) * 1.08
  camera.position.copy(sphere.center).addScaledVector(DIRECTIONS[preset], distance)
  camera.up.set(0, preset === 'superior' || preset === 'inferior' ? 1 : 0, preset === 'superior' || preset === 'inferior' ? 0 : 1)
  camera.near = Math.max(distance - radius * 2, 0.1)
  camera.far = distance + radius * 2
  camera.lookAt(sphere.center)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

/** Run `fn` with `objects` hidden, restoring each object's own visibility afterwards (even on error). */
export function withHidden<T>(objects: THREE.Object3D[], fn: () => T): T {
  const previous = objects.map((obj) => obj.visible)
  objects.forEach((obj) => {
    obj.visible = false
  })
  try {
    return fn()
  } finally {
    objects.forEach((obj, index) => {
      obj.visible = previous[index]
    })
  }
}

/** Where a callout's leader line points for an annotation (its first point, ROI centre or curve centroid). */
export function calloutAnchor(ann: Annotation): RasPoint | null {
  if (ann.type === 'roi') {
    const min = (ann.meta.min as RasPoint | undefined) ?? ann.points[0]
    const max = (ann.meta.max as RasPoint | undefined) ?? ann.points[1]
    if (min && max) return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  }
  if ((ann.type === 'closed_curve' || ann.type === 'open_curve') && ann.points.length > 0) {
    const sum = ann.points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0])
    return [sum[0] / ann.points.length, sum[1] / ann.points.length, sum[2] / ann.points.length]
  }
  return ann.points[0] ?? null
}

/** Pixel position of a world point in a capture of size width × height (y down). */
export function projectToCapture(
  point: RasPoint,
  camera: THREE.Camera,
  width: number,
  height: number,
): { x: number; y: number; inFront: boolean } {
  const v = new THREE.Vector3(...point).project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, inFront: v.z >= -1 && v.z <= 1 }
}

export type CaptureCallout = { annotation: Annotation; label: string }

/** Draw labelled leader lines in each annotation's palette colour (R9). */
export function drawCallouts(
  ctx: CanvasRenderingContext2D,
  callouts: CaptureCallout[],
  camera: THREE.Camera,
  width: number,
  height: number,
): void {
  const placed: Array<{ x: number; y: number }> = []
  ctx.font = '600 22px "SF Pro Text", "Segoe UI", system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  callouts.forEach(({ annotation, label }, index) => {
    const anchor = calloutAnchor(annotation)
    if (!anchor) return
    const at = projectToCapture(anchor, camera, width, height)
    if (!at.inFront) return
    const colour = annotationColorCss(resolveAnnotationColorKey(annotation))
    // Labels sit in a column on the nearer side, stacked so they never overlap.
    const right = at.x < width / 2 ? false : true
    const boxW = Math.min(ctx.measureText(label).width + 44, width * 0.4)
    const x = right ? width - boxW - 24 : 24
    let y = Math.max(40, Math.min(height - 40, at.y))
    while (placed.some((p) => p.x === x && Math.abs(p.y - y) < 40)) y += 40
    placed.push({ x, y })
    ctx.strokeStyle = colour
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.lineTo(right ? x : x + boxW, y)
    ctx.stroke()
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(at.x, at.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
    ctx.fillRect(x, y - 18, boxW, 36)
    ctx.strokeRect(x, y - 18, boxW, 36)
    ctx.fillStyle = colour
    ctx.fillRect(x + 10, y - 7, 14, 14)
    ctx.fillStyle = '#1A1D21'
    ctx.fillText(`${index + 1}. ${label}`, x + 32, y, boxW - 40)
  })
}

/** Render `scene` from `camera` into an offscreen target and return a PNG blob. */
export async function renderToPng(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  decorate?: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.SRGBColorSpace })
  const previousTarget = renderer.getRenderTarget()
  const pixels = new Uint8Array(width * height * 4)
  try {
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
  } finally {
    renderer.setRenderTarget(previousTarget)
    target.dispose()
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const image = ctx.createImageData(width, height)
  const row = width * 4
  for (let y = 0; y < height; y += 1) {
    // WebGL rows are bottom-up.
    image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
  }
  ctx.putImageData(image, 0, 0)
  decorate?.(ctx)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
}
