/**
 * Shared direct-manipulation policy for canvas surfaces.
 *
 * Callers provide hit-test facts; this module never raycasts or changes state.
 */
export type CanvasPointerOwner =
  | 'manipulate'
  | 'paint'
  | 'place'
  | 'select'
  | 'navigate'
  | 'none'

export type CanvasInteractionContext = {
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  placeActive: boolean
  highlightActive: boolean
  hitHandle: boolean
  hitAnatomy: boolean
  hitAnnotation: boolean
}

/** Resolve exactly one owner for a pointer sequence that begins on canvas. */
export function resolveCanvasPointerOwner(
  context: CanvasInteractionContext,
): CanvasPointerOwner {
  if (context.button !== 0) {
    return context.button === 2 ? 'none' : 'navigate'
  }

  // Modifiers reserve the gesture for normal camera navigation.
  if (context.altKey || context.ctrlKey || context.metaKey) return 'navigate'

  if (context.hitHandle) return 'manipulate'
  if (context.highlightActive) return 'paint'
  if (context.placeActive && context.hitAnatomy) return 'place'
  if (context.hitAnnotation) return 'select'
  return 'navigate'
}
