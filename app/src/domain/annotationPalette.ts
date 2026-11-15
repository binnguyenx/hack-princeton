import type { AnnotationType } from './types'

/**
 * Shared annotation palette (canvas only; see DESIGN.md "Annotation palette").
 * The single source of annotation colours for the 3D overlay, placement strip and list.
 */
export const ANNOTATION_COLOR_KEYS = ['accent', 'amber', 'emerald', 'rose', 'slate'] as const

export type AnnotationColorKey = (typeof ANNOTATION_COLOR_KEYS)[number]

const CSS: Record<AnnotationColorKey, string> = {
  accent: '#2F6BFF',
  amber: '#F59E0B',
  emerald: '#10B981',
  rose: '#F43F5E',
  slate: '#64748B',
}

export function isAnnotationColorKey(value: unknown): value is AnnotationColorKey {
  return typeof value === 'string' && (ANNOTATION_COLOR_KEYS as readonly string[]).includes(value)
}

/** Today's look for annotations with no colour: ROI amber, everything else accent. */
export function defaultAnnotationColorKey(type: AnnotationType): AnnotationColorKey {
  return type === 'roi' ? 'amber' : 'accent'
}

export function resolveAnnotationColorKey(ann: {
  type: AnnotationType
  meta: Record<string, unknown>
}): AnnotationColorKey {
  const value = ann.meta.color
  return isAnnotationColorKey(value) ? value : defaultAnnotationColorKey(ann.type)
}

export function annotationColorCss(key: AnnotationColorKey): string {
  return CSS[key]
}

export function annotationColorHex(key: AnnotationColorKey): number {
  return Number.parseInt(CSS[key].slice(1), 16)
}
