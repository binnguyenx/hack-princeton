import type { Annotation, RasPoint } from '../../domain/types'

export type EmphasisLevel = 'none' | 'hover' | 'selected'

export type AnnotationBehaviorKind = 'selectable' | 'pointSet' | 'orientedExtent'

export type BehaviorForType = {
  kind: AnnotationBehaviorKind
  /** Types that use PointSet place/edit semantics. */
  isPointSet: boolean
  /** Types that use OrientedExtent gizmos when selected. */
  isOrientedExtent: boolean
}

export type ExtentEdit = {
  points: RasPoint[]
  meta: Record<string, unknown>
}

export type GizmoDragState = {
  annotationId: string
  mode: 'rotate' | 'scale'
  origin: RasPoint
  startClient: { x: number; y: number }
  startPoints: RasPoint[]
  startMeta: Record<string, unknown>
}

export type AnnotationLike = Pick<Annotation, 'id' | 'type' | 'points' | 'meta' | 'locked'>
