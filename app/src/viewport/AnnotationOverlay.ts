import * as THREE from 'three'
import type { Annotation } from '../domain/types'
import {
  angleDegrees,
  closedCurveLength,
  landmarkCoord,
  lineDistance,
  openCurveLength,
} from '../geometry/annotationMeasure'
import { anglePreviewSegments } from './annotationBehaviors'

const ACCENT = 0x2f6bff
const HIGHLIGHT_COLORS: Record<string, number> = {
  accent: 0x2f6bff,
  amber: 0xf59e0b,
  rose: 0xf43f5e,
  emerald: 0x10b981,
}

/** Visible on ~200mm skulls; 1.5mm spheres read as noise at typical camera distance. */
const GLYPH_RADIUS_MM = 4.5
const CONTROL_RADIUS_MM = 3.5
const centroidCache = new WeakMap<THREE.BufferGeometry, Float32Array>()

function accentMaterial(opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
  })
}

function lineMaterial(dashed = false): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: ACCENT,
    transparent: dashed,
    opacity: dashed ? 0.55 : 1,
    depthTest: false,
    depthWrite: false,
  })
}

export function buildGlyph(
  ann: Annotation,
  pointIndex = 0,
  opts?: { preview?: boolean },
): THREE.Mesh {
  const primary = ann.type === 'landmark' || ann.type === 'text_note'
  const radius = primary ? GLYPH_RADIUS_MM : CONTROL_RADIUS_MM
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 16),
    accentMaterial(opts?.preview ? 0.5 : 1),
  )
  const p = ann.points[pointIndex] ?? ann.points[0] ?? [0, 0, 0]
  mesh.position.set(p[0], p[1], p[2])
  mesh.userData.annotationId = ann.id
  mesh.userData.pointIndex = pointIndex
  mesh.renderOrder = 10
  mesh.name = `ann-glyph-${ann.id}-${pointIndex}`
  return mesh
}

function polylineFromPoints(
  pts: Array<[number, number, number]>,
  dashed = false,
): THREE.Line {
  const positions = new Float32Array(pts.length * 3)
  pts.forEach((p, i) => {
    positions[i * 3] = p[0]
    positions[i * 3 + 1] = p[1]
    positions[i * 3 + 2] = p[2]
  })
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const line = new THREE.Line(geom, lineMaterial(dashed))
  line.renderOrder = 9
  return line
}

export function buildLine(ann: Annotation): THREE.Line | null {
  if (ann.points.length < 2) return null
  const line = polylineFromPoints(ann.points)
  line.userData.annotationId = ann.id
  line.name = `ann-line-${ann.id}`
  return line
}

export function buildCurvePolyline(
  ann: Annotation,
  closed: boolean,
): THREE.Line | null {
  if (ann.points.length < 2) return null
  const pts = closed ? [...ann.points, ann.points[0]] : ann.points
  const line = polylineFromPoints(pts)
  line.userData.annotationId = ann.id
  line.name = `ann-curve-${ann.id}`
  return line
}

export function buildPreviewPolyline(
  points: Array<[number, number, number]>,
  closedGhost = false,
): THREE.Line | null {
  if (points.length < 1) return null
  const pts =
    closedGhost && points.length >= 2
      ? [...points, points[0]]
      : points
  if (pts.length < 2) return null
  const line = polylineFromPoints(pts, true)
  line.name = 'ann-preview-line'
  line.userData.preview = true
  return line
}

export function buildLabel(ann: Annotation, text: string): THREE.Sprite {
  let map: THREE.Texture | undefined
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 96
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, 512, 96)
      ctx.fillStyle = 'rgba(26, 29, 33, 0.9)'
      ctx.fillRect(8, 12, 496, 72)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '600 36px "SF Pro Text", "Segoe UI", system-ui, sans-serif'
      ctx.fillText(text.slice(0, 40), 28, 60)
    }
    map = new THREE.CanvasTexture(canvas)
    map.needsUpdate = true
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: map ?? null,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  )
  const p = ann.points[0] ?? [0, 0, 0]
  // Compact callout above the glyph — large scales stack and obscure anatomy.
  sprite.position.set(p[0], p[1] + GLYPH_RADIUS_MM + 2.5, p[2])
  sprite.scale.set(18, 4.5, 1)
  sprite.renderOrder = 11
  sprite.userData.annotationId = ann.id
  sprite.name = `ann-label-${ann.id}`
  return sprite
}

export function buildAngleArc(ann: Annotation): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  if (ann.points.length < 3) return objs
  const line = buildCurvePolyline(
    { ...ann, points: [ann.points[0], ann.points[1], ann.points[2]] },
    false,
  )
  if (line) objs.push(line)
  objs.push(buildGlyph({ ...ann, points: [ann.points[1]] }))
  const deg = angleDegrees(ann.points[0], ann.points[1], ann.points[2])
  objs.push(buildLabel(ann, `${deg.toFixed(1)}°`))
  return objs
}

export function buildROIBox(ann: Annotation): THREE.Object3D[] {
  const meta = ann.meta as { min?: number[]; max?: number[] }
  const min = (meta.min ?? ann.points[0]) as [number, number, number] | undefined
  const max = (meta.max ?? ann.points[1]) as [number, number, number] | undefined
  if (!min || !max) return []
  const sx = Math.max(Math.abs(max[0] - min[0]), 0.5)
  const sy = Math.max(Math.abs(max[1] - min[1]), 0.5)
  const sz = Math.max(Math.abs(max[2] - min[2]), 0.5)
  const box = new THREE.BoxGeometry(sx, sy, sz)
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const cz = (min[2] + max[2]) / 2
  // Amber fill/edges — distinct from blue plane pads so ROI never reads as a plane.
  const ROI_COLOR = 0xf59e0b
  const fill = new THREE.Mesh(
    box,
    new THREE.MeshBasicMaterial({
      color: ROI_COLOR,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  fill.position.set(cx, cy, cz)
  fill.userData.annotationId = ann.id
  fill.name = `ann-roi-fill-${ann.id}`
  fill.renderOrder = 8
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({
      color: ROI_COLOR,
      depthTest: false,
      depthWrite: false,
    }),
  )
  edges.position.copy(fill.position)
  edges.userData.annotationId = ann.id
  edges.name = `ann-roi-${ann.id}`
  edges.renderOrder = 9
  return [fill, edges]
}

/** R47: rectangle covers anatomy AABB extents padded by 10 mm per side. */
export function planeRectSize(boundingBoxMm?: number[]): {
  width: number
  height: number
} {
  if (!boundingBoxMm || boundingBoxMm.length < 3) {
    return { width: 100, height: 100 }
  }
  const extents = boundingBoxMm.map((v) => Math.abs(v)).sort((a, b) => b - a)
  return {
    width: Math.max(extents[0] + 20, 20),
    height: Math.max(extents[1] + 20, 20),
  }
}

function planeNormalVector(ann: Annotation): THREE.Vector3 {
  const metaN = ann.meta.normal
  if (
    Array.isArray(metaN) &&
    metaN.length >= 3 &&
    metaN.every((v) => typeof v === 'number' && Number.isFinite(v))
  ) {
    const v = new THREE.Vector3(metaN[0], metaN[1], metaN[2])
    if (v.lengthSq() > 1e-12) return v.normalize()
  }
  if (ann.points.length >= 3) {
    const [a, b, c] = ann.points
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])
    const n = new THREE.Vector3().crossVectors(ab, ac)
    if (n.lengthSq() > 1e-12) return n.normalize()
  }
  return new THREE.Vector3(0, 0, 1)
}

export function buildPlane(
  ann: Annotation,
  boundingBoxMm?: number[],
): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  const origin = ann.points[0] ?? [0, 0, 0]
  const padExtra = Number(ann.meta.padMm ?? 0)
  const base = planeRectSize(boundingBoxMm)
  const width = base.width + padExtra * 2
  const height = base.height + padExtra * 2
  const geom = new THREE.PlaneGeometry(width, height)
  const plane = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.position.set(origin[0], origin[1], origin[2])
  plane.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    planeNormalVector(ann),
  )
  plane.userData.annotationId = ann.id
  plane.name = `ann-plane-${ann.id}`
  plane.renderOrder = 8
  objs.push(plane)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({
      color: ACCENT,
      depthTest: false,
      depthWrite: false,
    }),
  )
  edges.position.copy(plane.position)
  edges.quaternion.copy(plane.quaternion)
  edges.userData.annotationId = ann.id
  edges.renderOrder = 9
  objs.push(edges)
  // Origin glyph so the plane has a clear control point (R50 entry).
  objs.push(buildGlyph(ann, 0))
  return objs
}

/** Collect triangle indices whose centroids fall within a brush sphere (R61). */
export function accumulateBrushTriangles(
  mesh: THREE.Object3D,
  center: THREE.Vector3,
  radiusMm: number,
): number[] {
  let meshObj: THREE.Mesh | null = (mesh as THREE.Mesh).isMesh
    ? (mesh as THREE.Mesh)
    : null
  if (!meshObj) {
    mesh.traverse((child) => {
      if (!meshObj && (child as THREE.Mesh).isMesh) meshObj = child as THREE.Mesh
    })
  }
  if (!meshObj?.geometry) return []
  const geom = meshObj.geometry
  const pos = geom.getAttribute('position')
  if (!pos) return []
  const index = geom.getIndex()
  const triCount = index ? index.count / 3 : Math.floor(pos.count / 3)
  let centroids = centroidCache.get(geom)
  if (!centroids || centroids.length !== triCount * 3) {
    centroids = new Float32Array(triCount * 3)
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      const at = t * 3
      centroids[at] = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3
      centroids[at + 1] = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3
      centroids[at + 2] = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3
    }
    centroidCache.set(geom, centroids)
  }
  meshObj.updateWorldMatrix(true, false)
  const localCenter = meshObj.worldToLocal(center.clone())
  const worldScale = meshObj.getWorldScale(new THREE.Vector3())
  const radiusSq = (radiusMm / Math.max(worldScale.x, worldScale.y, worldScale.z, 1)) ** 2
  const hit: number[] = []
  for (let t = 0; t < triCount; t++) {
    const at = t * 3
    const dx = centroids[at] - localCenter.x
    const dy = centroids[at + 1] - localCenter.y
    const dz = centroids[at + 2] - localCenter.z
    if (dx * dx + dy * dy + dz * dz <= radiusSq) hit.push(t)
  }
  return hit
}

export function buildHighlightOverlay(
  ann: Annotation,
  mesh: THREE.Object3D | null,
  onStale?: () => void,
): THREE.Mesh | null {
  const indices = (ann.meta.triangleIndices as number[] | undefined) ?? []
  if (!mesh || indices.length === 0) return null
  const meshObj =
    (mesh as THREE.Mesh).isMesh
      ? (mesh as THREE.Mesh)
      : (() => {
          let found: THREE.Mesh | null = null
          mesh.traverse((child) => {
            if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh
          })
          return found
        })()
  if (!meshObj?.geometry) return null
  const sourceGeom = meshObj.geometry
  const index = sourceGeom.getIndex()
  const position = sourceGeom.getAttribute('position')
  const triCount = index ? index.count / 3 : Math.floor(position.count / 3)
  if (indices.some((i) => i < 0 || i >= triCount)) {
    onStale?.()
    return null
  }
  const filtered: number[] = []
  for (const tri of indices) {
    if (index) {
      filtered.push(index.getX(tri * 3), index.getX(tri * 3 + 1), index.getX(tri * 3 + 2))
    } else {
      filtered.push(tri * 3, tri * 3 + 1, tri * 3 + 2)
    }
  }
  const geom = sourceGeom.clone()
  geom.setIndex(filtered)
  const colorKey = String(ann.meta.color ?? 'accent')
  const color = HIGHLIGHT_COLORS[colorKey] ?? ACCENT
  const overlay = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    }),
  )
  // The overlay is added to the scene root, while the source mesh may be a
  // positioned child of a GLB or candidate pose group. Keep the same world
  // transform or the correctly-selected triangles render somewhere else.
  meshObj.updateWorldMatrix(true, false)
  overlay.matrix.copy(meshObj.matrixWorld)
  overlay.matrixAutoUpdate = false
  overlay.userData.annotationId = ann.id
  overlay.name = `ann-highlight-${ann.id}`
  return overlay
}

function labelFor(ann: Annotation): string {
  switch (ann.type) {
    case 'landmark':
      return ann.points[0] ? landmarkCoord(ann.points[0]) : ann.name
    case 'line':
      return ann.points.length >= 2
        ? `${lineDistance(ann.points[0], ann.points[1]).toFixed(2)} mm`
        : '—'
    case 'closed_curve':
      return ann.points.length >= 3
        ? `${closedCurveLength(ann.points).toFixed(2)} mm`
        : '—'
    case 'open_curve':
      return ann.points.length >= 2
        ? `${openCurveLength(ann.points).toFixed(2)} mm`
        : '—'
    case 'text_note': {
      const body = String(ann.meta.body ?? '')
      return body.length > 40 ? `${body.slice(0, 40)}…` : body || ann.name
    }
    case 'angle':
      return ann.points.length >= 3
        ? `${angleDegrees(ann.points[0], ann.points[1], ann.points[2]).toFixed(1)}°`
        : '—'
    default:
      return ann.name
  }
}

export function syncAnnotationObjects(
  scene: THREE.Scene,
  annotations: Annotation[],
  prevRef: { current: Map<string, THREE.Object3D[]> },
  displayMesh?: THREE.Object3D | null,
  onStaleHighlight?: (id: string) => void,
  inProgress?: {
    type: Annotation['type']
    points: Array<[number, number, number]>
    hoverCursor?: [number, number, number] | null
  } | null,
  boundingBoxMm?: number[],
  /** When set, line/closed_curve measure labels show only for these ids (hover/select). */
  measureLabelIds?: ReadonlySet<string> | null,
): void {
  const nextIds = new Set(annotations.filter((a) => a.visible).map((a) => a.id))
  const previewPoints =
    inProgress == null
      ? []
      : inProgress.hoverCursor
        ? [...inProgress.points, inProgress.hoverCursor]
        : [...inProgress.points]
  if (inProgress && previewPoints.length > 0) nextIds.add('__preview__')
  for (const [id, objs] of prevRef.current) {
    if (!nextIds.has(id)) {
      for (const obj of objs) scene.remove(obj)
      prevRef.current.delete(id)
    }
  }
  for (const ann of annotations) {
    if (!ann.visible) continue
    const existing = prevRef.current.get(ann.id)
    if (existing) {
      for (const obj of existing) scene.remove(obj)
    }
    const objs: THREE.Object3D[] = []
    switch (ann.type) {
      case 'landmark':
      case 'text_note':
        objs.push(buildGlyph(ann, 0))
        objs.push(buildLabel(ann, ann.name))
        break
      case 'line': {
        const line = buildLine(ann)
        if (line) objs.push(line)
        ann.points.forEach((_, i) => objs.push(buildGlyph(ann, i)))
        if (!measureLabelIds || measureLabelIds.has(ann.id)) {
          objs.push(buildLabel(ann, labelFor(ann)))
        }
        break
      }
      case 'closed_curve': {
        const curve = buildCurvePolyline(ann, true)
        if (curve) objs.push(curve)
        ann.points.forEach((_, i) => objs.push(buildGlyph(ann, i)))
        if (!measureLabelIds || measureLabelIds.has(ann.id)) {
          objs.push(buildLabel(ann, labelFor(ann)))
        }
        break
      }
      case 'open_curve': {
        const curve = buildCurvePolyline(ann, false)
        if (curve) objs.push(curve)
        ann.points.forEach((_, i) => objs.push(buildGlyph(ann, i)))
        objs.push(buildLabel(ann, labelFor(ann)))
        break
      }
      case 'angle':
        objs.push(...buildAngleArc(ann))
        break
      case 'roi': {
        objs.push(...buildROIBox(ann))
        break
      }
      case 'plane':
        objs.push(...buildPlane(ann, boundingBoxMm))
        break
      case 'highlight': {
        const hl = buildHighlightOverlay(ann, displayMesh ?? null, () =>
          onStaleHighlight?.(ann.id),
        )
        if (hl) objs.push(hl)
        break
      }
      default:
        objs.push(buildGlyph(ann, 0))
    }
    for (const obj of objs) scene.add(obj)
    prevRef.current.set(ann.id, objs)
  }

  const prevPreview = prevRef.current.get('__preview__')
  if (prevPreview) {
    for (const obj of prevPreview) scene.remove(obj)
    prevRef.current.delete('__preview__')
  }
  if (inProgress && previewPoints.length > 0) {
    const previewAnn: Annotation = {
      id: '__preview__',
      revisionId: '',
      type: inProgress.type,
      name: 'preview',
      points: previewPoints,
      meta: {},
      locked: false,
      visible: true,
      createdAt: '',
    }
    const objs: THREE.Object3D[] = []
    // Placed points stay solid-preview; cursor tip is always translucent.
    inProgress.points.forEach((_, i) =>
      objs.push(buildGlyph(previewAnn, i, { preview: true })),
    )
    if (inProgress.hoverCursor) {
      objs.push(
        buildGlyph(
          { ...previewAnn, points: [inProgress.hoverCursor] },
          0,
          { preview: true },
        ),
      )
    }
    if (inProgress.type === 'angle') {
      const segs = anglePreviewSegments(
        inProgress.points,
        inProgress.hoverCursor ?? null,
      )
      for (const seg of segs) {
        if (seg.length >= 2) {
          const line = buildPreviewPolyline(seg, false)
          if (line) objs.push(line)
        }
      }
    } else {
      const closedGhost = inProgress.type === 'closed_curve'
      const previewLine = buildPreviewPolyline(previewPoints, closedGhost)
      if (previewLine) objs.push(previewLine)
    }
    for (const obj of objs) scene.add(obj)
    prevRef.current.set('__preview__', objs)
  }
}
