/** Pure rules for surface-highlight stroke → uncommitted stack updates. */

export type HighlightColorId = 'accent' | 'amber' | 'rose' | 'emerald'

export type HighlightStackEntryLike = {
  id: string
  meta: Record<string, unknown>
}

export type ResolveHighlightStrokeInput = {
  activeEntry: HighlightStackEntryLike | null
  strokeIndices: number[]
  color: HighlightColorId | string
  /** Ignored for merge source — stack entry is authoritative when upserting. */
  draftTriangleIndices?: number[]
}

export type ResolveHighlightStrokeResult = {
  mode: 'create' | 'upsert'
  id?: string
  triangleIndices: number[]
  color: string
}

function uniqueSorted(indices: number[]): number[] {
  return [...new Set(indices)].sort((a, b) => a - b)
}

/**
 * Same Place color → accumulate onto the active highlight.
 * Color change (or no active entry) → new brush; previous stack entry is left intact.
 */
export function resolveHighlightStroke(
  input: ResolveHighlightStrokeInput,
): ResolveHighlightStrokeResult {
  const color = String(input.color)
  const active = input.activeEntry
  const activeColor =
    active && typeof active.meta.color === 'string' ? active.meta.color : null
  const activeIndices = Array.isArray(active?.meta.triangleIndices)
    ? (active!.meta.triangleIndices as number[])
    : []

  if (active && activeColor === color) {
    return {
      mode: 'upsert',
      id: active.id,
      triangleIndices: uniqueSorted([...activeIndices, ...input.strokeIndices]),
      color,
    }
  }

  return {
    mode: 'create',
    triangleIndices: uniqueSorted(input.strokeIndices),
    color,
  }
}
