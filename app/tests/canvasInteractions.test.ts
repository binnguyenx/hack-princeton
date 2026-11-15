import { describe, expect, it } from 'vitest'
import { resolveCanvasPointerOwner } from '../src/viewport/canvasInteractions'

const base = {
  button: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  placeActive: false,
  highlightActive: false,
  hitHandle: false,
  hitAnatomy: false,
  hitAnnotation: false,
}

describe('resolveCanvasPointerOwner', () => {
  it('gives an unlocked visible handle priority over every canvas tool', () => {
    expect(
      resolveCanvasPointerOwner({
        ...base,
        placeActive: true,
        highlightActive: true,
        hitHandle: true,
        hitAnatomy: true,
        hitAnnotation: true,
      }),
    ).toBe('manipulate')
  })

  it('routes Highlight primary drags to paint before placement or selection', () => {
    expect(
      resolveCanvasPointerOwner({
        ...base,
        placeActive: true,
        highlightActive: true,
        hitAnatomy: true,
        hitAnnotation: true,
      }),
    ).toBe('paint')
  })

  it('routes Place to anatomy before selecting an annotation', () => {
    expect(
      resolveCanvasPointerOwner({
        ...base,
        placeActive: true,
        hitAnatomy: true,
        hitAnnotation: true,
      }),
    ).toBe('place')
  })

  it('selects an annotation outside Place mode and otherwise navigates', () => {
    expect(
      resolveCanvasPointerOwner({ ...base, hitAnnotation: true }),
    ).toBe('select')
    expect(resolveCanvasPointerOwner(base)).toBe('navigate')
  })

  it('keeps modified and non-primary input out of direct tools', () => {
    expect(
      resolveCanvasPointerOwner({ ...base, placeActive: true, hitAnatomy: true, altKey: true }),
    ).toBe('navigate')
    expect(
      resolveCanvasPointerOwner({ ...base, hitHandle: true, metaKey: true }),
    ).toBe('navigate')
    expect(
      resolveCanvasPointerOwner({ ...base, hitAnnotation: true, button: 2 }),
    ).toBe('none')
  })
})
