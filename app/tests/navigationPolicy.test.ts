import { describe, expect, it } from 'vitest'
import {
  getNavigationHint,
  getSlicerMouseButtons,
  isNavigationAvailableForTool,
} from '../src/viewport/navigationPolicy'

describe('canvas navigation policy', () => {
  it('keeps navigation available regardless of active tool', () => {
    expect(isNavigationAvailableForTool('navigate')).toBe(true)
    expect(isNavigationAvailableForTool('select')).toBe(true)
    expect(isNavigationAvailableForTool('transform')).toBe(true)
  })

  it('uses Slicer-standard direct manipulation bindings', () => {
    const buttons = getSlicerMouseButtons()
    expect(buttons.LEFT).toBe(0)
    expect(buttons.MIDDLE).toBe(2)
    expect(buttons.RIGHT).toBe(1)
  })

  it('exposes one truthful Slicer navigation hint', () => {
    expect(getNavigationHint()).toBe('LMB rotate · MMB pan · RMB drag zoom · Shift+LMB pan')
  })
})
