import type { AnnotationType, RasPoint } from '../domain/types'

export type AnnotationAction =
  | { type: 'place'; annotationType?: AnnotationType }
  | { type: 'delete'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'setVisible'; id: string; visible: boolean }
  | { type: 'setLocked'; id: string; locked: boolean }
  | { type: 'updateMeta'; id: string; meta: Record<string, unknown> }
  | { type: 'jumpTo'; id: string; point: RasPoint }
  | { type: 'showPlaneInDock'; annotationId: string }
  | { type: 'alignPlaneToView'; annotationId: string }
