import { Mesh, Raycaster, Vector2, type Camera, type Object3D } from 'three'

type Pointer = {
  pointerId: number; button: number; clientX: number; clientY: number
  ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; isPrimary?: boolean
}
type Bounds = { left: number; top: number; width: number; height: number }

function unmodified(event: Pointer): boolean {
  return event.button === 0 && event.isPrimary !== false && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}
function visible(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false
  return true
}

/** Geometry-only hit test; no source/material mutation and no selection of overlays. */
export function hitTestObject(camera: Camera, root: Object3D, point: { clientX: number; clientY: number }, bounds: Bounds): boolean {
  if (!visible(root) || bounds.width <= 0 || bounds.height <= 0) return false
  const x = (point.clientX - bounds.left) / bounds.width
  const y = (point.clientY - bounds.top) / bounds.height
  if (!Number.isFinite(x + y) || x < 0 || x > 1 || y < 0 || y > 1) return false
  camera.updateMatrixWorld()
  root.updateWorldMatrix(true, true)
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), camera)
  return ray.intersectObject(root, true).some((hit) => hit.object instanceof Mesh && visible(hit.object))
}

/** A drag that returns to its start is still a drag; scene swaps cancel pending clicks. */
export class SelectionGesture {
  private pending: { pointerId: number; x: number; y: number; root: Object3D; id: string; dragged: boolean } | null = null

  begin(event: Pointer, root: Object3D | undefined, id: string | undefined, enabled: boolean): void {
    this.pending = enabled && root && id && visible(root) && unmodified(event)
      ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, root, id, dragged: false } : null
  }
  move(event: Pick<Pointer, 'pointerId' | 'clientX' | 'clientY'>): void {
    if (this.pending?.pointerId === event.pointerId
      && Math.hypot(event.clientX - this.pending.x, event.clientY - this.pending.y) > 4) this.pending.dragged = true
  }
  finish(event: Pointer, root: Object3D | undefined, id: string | undefined, enabled: boolean): boolean {
    this.move(event)
    const pending = this.pending
    this.pending = null
    return Boolean(enabled && pending && !pending.dragged && unmodified(event)
      && pending.pointerId === event.pointerId && pending.root === root && pending.id === id && root && visible(root))
  }
  cancel(): void { this.pending = null }
}
