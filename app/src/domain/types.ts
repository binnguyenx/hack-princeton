/** Domain records for the mechanical editor (IDs stable across save/reopen). */

export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export const IDENTITY_POSE: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export type User = {
  id: string
  displayName: string
}

export type SpatialMeta = {
  units: string
  space?: string
  sizes: number[]
  spacings: number[]
  bboxMm: number[]
}

export type SourceAnatomy = {
  objectId: string
  sampleId: string
  volumeId: string
  spatial: SpatialMeta
  /** SHA-256 of volume bytes */
  volumeHash: string
}

export type CandidateRevision = {
  id: string
  candidateId: string
  order: number
  volumeId: string
  pose: Mat4
  volumeHash: string
}

export type Candidate = {
  objectId: string
  sampleId: string
  currentRevisionId: string
}

export type Sample = {
  id: string
  caseId: string
  license: string
  spatiallyVerified: boolean
  sourceAnatomy: SourceAnatomy
  sourceSampleDir?: string
}

export type Case = {
  id: string
  projectId: string
  name: string
}

export type Project = {
  id: string
  ownerUserId: string
  name: string
}

export type InspectionPlane = {
  enabled: boolean
  axis: 'x' | 'y' | 'z'
  offset: number
}

export type CameraState = {
  position: [number, number, number]
  target: [number, number, number]
}

export type ViewState = {
  selectionObjectId: string | null
  camera: CameraState
  /** objectId → visible */
  visibility: Record<string, boolean>
  inspectionPlane: InspectionPlane
}

export type VolumeStore = Map<string, Uint8Array>

export type EditorState = {
  user: User
  project: Project
  cases: Case[]
  samples: Sample[]
  candidates: Candidate[]
  revisions: CandidateRevision[]
  view: ViewState
  volumes: VolumeStore
  dirty: boolean
}

export type OpResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string }
