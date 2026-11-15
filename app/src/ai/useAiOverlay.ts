import { useCallback, useState } from 'react'
import type { ViewportOverlay } from '../api/chat'

/**
 * Active AI viewport overlay, scoped to one selection. When `selectionKey` changes (case, object
 * or revision), any overlay from the previous selection is dropped before it can render.
 */
export function useAiOverlay(selectionKey: string) {
  const [state, setState] = useState<{ key: string; overlay: ViewportOverlay | null }>({ key: selectionKey, overlay: null })
  const overlay = state.key === selectionKey ? state.overlay : null
  const setOverlay = useCallback((next: ViewportOverlay | null) => setState({ key: selectionKey, overlay: next }),
    [selectionKey])
  return [overlay, setOverlay] as const
}
