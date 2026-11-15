import type { Annotation, AnnotationType, RasPoint } from '../domain/types'

export type StackCreatePayload = {
  type: AnnotationType
  name: string
  points: RasPoint[]
  meta: Record<string, unknown>
  revisionId: string
}

export type StackCreateEntry = StackCreatePayload & {
  id: string
  kind: 'create'
}

export type AnnotationStack = {
  isEmpty: () => boolean
  pushCreate: (payload: StackCreatePayload) => string
  upsertCreate: (id: string, payload: StackCreatePayload) => void
  removeById: (id: string) => boolean
  undoLast: () => StackCreateEntry | null
  peekLast: () => StackCreateEntry | null
  entries: () => readonly StackCreateEntry[]
  flush: (
    writer: (entry: StackCreateEntry) => Promise<void>,
  ) => Promise<void>
}

let stackSeq = 0

function nextId(): string {
  stackSeq += 1
  return `stack-${stackSeq}`
}

export function createAnnotationStack(): AnnotationStack {
  const items: StackCreateEntry[] = []

  return {
    isEmpty: () => items.length === 0,
    entries: () => items.slice(),
    peekLast: () => items[items.length - 1] ?? null,
    pushCreate: (payload) => {
      const id = nextId()
      items.push({ id, kind: 'create', ...clonePayload(payload) })
      return id
    },
    upsertCreate: (id, payload) => {
      const idx = items.findIndex((e) => e.id === id)
      const next: StackCreateEntry = {
        id,
        kind: 'create',
        ...clonePayload(payload),
      }
      if (idx < 0) {
        items.push(next)
        return
      }
      items[idx] = next
    },
    removeById: (id) => {
      const idx = items.findIndex((e) => e.id === id)
      if (idx < 0) return false
      items.splice(idx, 1)
      return true
    },
    undoLast: () => {
      if (items.length === 0) return null
      return items.pop() ?? null
    },
    flush: async (writer) => {
      if (items.length === 0) return
      const snapshot = items.slice()
      for (const entry of snapshot) {
        await writer(entry)
      }
      items.length = 0
    },
  }
}

function clonePayload(payload: StackCreatePayload): StackCreatePayload {
  return {
    type: payload.type,
    name: payload.name,
    points: payload.points.map((pt) => [pt[0], pt[1], pt[2]] as RasPoint),
    meta: { ...payload.meta },
    revisionId: payload.revisionId,
  }
}

/** Preview annotations for overlay/panel merge (not yet API-persisted). */
export function stackToPreviewAnnotations(
  stack: AnnotationStack,
): Annotation[] {
  return stack.entries().map((e) => {
    const meta = { ...e.meta }
    const locked = Boolean(meta._locked)
    const visible = meta._visible === false ? false : true
    delete meta._locked
    delete meta._visible
    return {
      id: e.id,
      revisionId: e.revisionId,
      type: e.type,
      name: e.name,
      points: e.points.map((pt) => [pt[0], pt[1], pt[2]] as RasPoint),
      meta,
      locked,
      visible,
      createdAt: new Date(0).toISOString(),
    }
  })
}
