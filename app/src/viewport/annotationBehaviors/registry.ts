import type { AnnotationType } from '../../domain/types'
import type { BehaviorForType } from './types'

const POINT_SET: AnnotationType[] = [
  'line',
  'closed_curve',
  'open_curve',
  'angle',
  'text_note',
  'landmark',
]

const ORIENTED_EXTENT: AnnotationType[] = ['plane', 'roi']

export function behaviorFor(type: AnnotationType): BehaviorForType {
  if (ORIENTED_EXTENT.includes(type)) {
    return { kind: 'orientedExtent', isPointSet: false, isOrientedExtent: true }
  }
  if (POINT_SET.includes(type)) {
    return { kind: 'pointSet', isPointSet: true, isOrientedExtent: false }
  }
  // highlight and any future types: selectable only
  return { kind: 'selectable', isPointSet: false, isOrientedExtent: false }
}

export function isPointSetType(type: AnnotationType): boolean {
  return behaviorFor(type).isPointSet
}

export function isOrientedExtentType(type: AnnotationType): boolean {
  return behaviorFor(type).isOrientedExtent
}
