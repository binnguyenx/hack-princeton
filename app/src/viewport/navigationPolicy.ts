import { MOUSE } from 'three'
import type { NavigationScheme } from '../domain/types'

export type { NavigationScheme }

export function isNavigationAvailableForTool(_activeTool: string): boolean {
  return true
}

export function getSlicerMouseButtons(): Partial<
  Record<'LEFT' | 'MIDDLE' | 'RIGHT', number>
> {
  return {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.PAN,
    RIGHT: MOUSE.DOLLY,
  }
}

export function getOrbitMouseButtons(
  _scheme?: NavigationScheme,
): Partial<Record<'LEFT' | 'MIDDLE' | 'RIGHT', number>> {
  return getSlicerMouseButtons()
}

export function getNavigationHint(_scheme?: NavigationScheme): string {
  return 'LMB rotate · MMB pan · RMB drag zoom · Shift+LMB pan'
}
