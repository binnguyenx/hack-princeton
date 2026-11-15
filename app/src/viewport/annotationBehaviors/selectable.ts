import * as THREE from 'three'
import type { EmphasisLevel } from './types'

const EMPHASIS_SCALE = { none: 1, hover: 1.12, selected: 1.2 } as const
const HOVER_COLOR = 0x5b8cff
const SELECTED_COLOR = 0x93b4ff

/**
 * Apply group emphasis to every object belonging to an annotation.
 * Glyphs scale; line/mesh materials brighten. Idempotent per level.
 */
export function emphasizeObjects(
  objs: THREE.Object3D[],
  level: EmphasisLevel,
): void {
  const scale = EMPHASIS_SCALE[level]
  const color =
    level === 'selected' ? SELECTED_COLOR : level === 'hover' ? HOVER_COLOR : null

  for (const obj of objs) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.userData._baseScale) {
          child.userData._baseScale = child.scale.clone()
        }
        const base = child.userData._baseScale as THREE.Vector3
        child.scale.set(base.x * scale, base.y * scale, base.z * scale)
        const mat = child.material
        if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
          if (!child.userData._baseColor) {
            child.userData._baseColor = mat.color.getHex()
          }
          mat.color.setHex(
            color ?? (child.userData._baseColor as number),
          )
        }
      }
      if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        const mat = child.material
        if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
          if (!child.userData._baseColor) {
            child.userData._baseColor = mat.color.getHex()
          }
          mat.color.setHex(
            color ?? (child.userData._baseColor as number),
          )
          if ('linewidth' in mat === false && child.scale) {
            // slight scale on line group for visibility
            if (!child.userData._baseScale) {
              child.userData._baseScale = child.scale.clone()
            }
          }
        }
      }
      if (child instanceof THREE.Sprite) {
        if (!child.userData._baseScale) {
          child.userData._baseScale = child.scale.clone()
        }
        const base = child.userData._baseScale as THREE.Vector3
        const bump = level === 'none' ? 1 : level === 'hover' ? 1.08 : 1.15
        child.scale.set(base.x * bump, base.y * bump, base.z)
      }
    })
    obj.userData.emphasisLevel = level
  }
}

/** Pick annotationId from a raycast hit by walking parents. */
export function annotationIdFromIntersection(
  hit: THREE.Intersection | undefined,
): string | null {
  if (!hit) return null
  let cur: THREE.Object3D | null = hit.object
  while (cur) {
    const id = cur.userData?.annotationId as string | undefined
    if (id && id !== '__preview__' && !String(id).startsWith('gizmo-')) {
      return id
    }
    cur = cur.parent
  }
  return null
}

export function collectPickables(
  byId: Map<string, THREE.Object3D[]>,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  for (const objs of byId.values()) {
    for (const obj of objs) out.push(obj)
  }
  return out
}

/**
 * Sync emphasis across the annotation object map from hover + selection ids.
 * Selection wins over hover when both set for different ids.
 */
export function syncGroupEmphasis(
  byId: Map<string, THREE.Object3D[]>,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  for (const [id, objs] of byId) {
    if (id === '__preview__' || id.startsWith('gizmo-')) continue
    let level: EmphasisLevel = 'none'
    if (id === selectedId) level = 'selected'
    else if (id === hoveredId) level = 'hover'
    emphasizeObjects(objs, level)
  }
}
