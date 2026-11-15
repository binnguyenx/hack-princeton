import type { AnnotationType, RasPoint } from '../../domain/types'

/** Place-mode hint for PointSet types (ContextStrip). */
export function pointSetPlaceHint(type: AnnotationType): string | null {
  switch (type) {
    case 'line':
      return 'Double-click A · B'
    case 'closed_curve':
      return 'Tap ≥3 points · double-click the last point to finish'
    case 'open_curve':
      return 'Tap ≥2 points · double-click the last point to finish'
    case 'text_note':
      return 'Tap to place note'
    case 'plane':
      return 'Tap to place · then Size / Rotate / Align in the Annotations panel'
    case 'roi':
      return 'Tap two opposite corners · drag amber face cubes to resize'
    default:
      return null
  }
}

/**
 * Angle preview segments: always draw A–vertex and vertex–C (or cursor)
 * so a partial angle never looks like one straight polyline through all points.
 */
export function anglePreviewSegments(
  points: RasPoint[],
  hoverCursor?: RasPoint | null,
): RasPoint[][] {
  if (points.length === 0) {
    return hoverCursor ? [[hoverCursor]] : []
  }
  if (points.length === 1) {
    const a = points[0]
    return hoverCursor ? [[a, hoverCursor]] : [[a]]
  }
  if (points.length === 2) {
    const [a, vertex] = points
    const segs: RasPoint[][] = [[a, vertex]]
    if (hoverCursor) segs.push([vertex, hoverCursor])
    return segs
  }
  const [a, vertex, c] = points
  return [
    [a, vertex],
    [vertex, c],
  ]
}
