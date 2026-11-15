import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_COLOR_KEYS,
  annotationColorHex,
  annotationColorCss,
  resolveAnnotationColorKey,
} from '../src/domain/annotationPalette'

describe('annotation palette', () => {
  it('has exactly the five spec colours with their hex values', () => {
    expect(ANNOTATION_COLOR_KEYS).toEqual(['accent', 'amber', 'emerald', 'rose', 'slate'])
    expect(annotationColorCss('accent')).toBe('#2F6BFF')
    expect(annotationColorCss('amber')).toBe('#F59E0B')
    expect(annotationColorCss('emerald')).toBe('#10B981')
    expect(annotationColorCss('rose')).toBe('#F43F5E')
    expect(annotationColorCss('slate')).toBe('#64748B')
    expect(annotationColorHex('slate')).toBe(0x64748b)
  })

  it('uses meta.color when it is a palette key', () => {
    expect(resolveAnnotationColorKey({ type: 'plane', meta: { color: 'slate' } })).toBe('slate')
    expect(resolveAnnotationColorKey({ type: 'roi', meta: { color: 'emerald' } })).toBe('emerald')
  })

  it('falls back to today\'s look: ROI amber, every other type accent', () => {
    expect(resolveAnnotationColorKey({ type: 'roi', meta: {} })).toBe('amber')
    expect(resolveAnnotationColorKey({ type: 'line', meta: {} })).toBe('accent')
    expect(resolveAnnotationColorKey({ type: 'highlight', meta: {} })).toBe('accent')
  })

  it('treats unknown colour values as missing', () => {
    expect(resolveAnnotationColorKey({ type: 'roi', meta: { color: 'purple' } })).toBe('amber')
    expect(resolveAnnotationColorKey({ type: 'line', meta: { color: 42 } })).toBe('accent')
  })
})
