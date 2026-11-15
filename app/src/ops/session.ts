import { sha256Hex } from '../domain/hash'
import { newId } from '../domain/id'
import {
  IDENTITY_POSE,
  type Annotation,
  type AnnotationType,
  type CameraState,
  type DocumentKind,
  type EditorState,
  type InspectionPlane,
  type Mat4,
  type OpResult,
  type ProjectSummary,
  type RasPoint,
} from '../domain/types'
import { EditorStore, emptyViewState } from '../state/store'
import type { ProjectRegistry } from './projectRegistry'

export type OpsContext = {
  store: EditorStore
  registry?: ProjectRegistry
  saveWriter?: (
    dir: string,
    state: EditorState,
  ) => Promise<void>
}

function ok(): OpResult {
  return { ok: true, value: undefined }
}
function fail<T = void>(error: string): OpResult<T> {
  return { ok: false, error }
}
function okVal<T>(value: T): OpResult<T> {
  return { ok: true, value }
}

export function readState(ctx: OpsContext): OpResult<EditorState | null> {
  const s = ctx.store.getState()
  if (!s) return okVal(null)
  return okVal({
    ...s,
    volumes: new Map(s.volumes),
    view: {
      ...s.view,
      camera: {
        ...s.view.camera,
        position: [...s.view.camera.position] as CameraState['position'],
        target: [...s.view.camera.target] as CameraState['target'],
      },
      visibility: { ...s.view.visibility },
      inspectionPlane: { ...s.view.inspectionPlane },
    },
  })
}

export function navigateCamera(ctx: OpsContext, camera: CameraState): OpResult {
  if (!ctx.store.getState()) return fail('No project open')
  const values = [...camera.position, ...camera.target]
  if (!values.every(Number.isFinite)) {
    return fail('Camera state must contain finite coordinates')
  }
  const distanceSquared = camera.position.reduce((sum, value, index) => {
    const delta = value - camera.target[index]
    return sum + delta * delta
  }, 0)
  if (distanceSquared < 1e-12) {
    return fail('Camera must remain separated from its target')
  }
  ctx.store.update((st) => ({
    ...st,
    view: {
      ...st.view,
      camera: {
        position: [...camera.position] as CameraState['position'],
        target: [...camera.target] as CameraState['target'],
      },
    },
  }))
  return ok()
}

export function setVisibility(
  ctx: OpsContext,
  objectId: string,
  visible: boolean,
): OpResult {
  if (!ctx.store.getState()) return fail('No project open')
  ctx.store.update((st) => ({
    ...st,
    view: {
      ...st.view,
      visibility: { ...st.view.visibility, [objectId]: visible },
    },
  }))
  return ok()
}

export function setInspectionPlane(
  ctx: OpsContext,
  plane: InspectionPlane,
): OpResult {
  if (!ctx.store.getState()) return fail('No project open')
  ctx.store.update((st) => ({
    ...st,
    view: { ...st.view, inspectionPlane: { ...plane } },
  }))
  return ok()
}

export function selectObject(ctx: OpsContext, objectId: string | null): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (objectId) {
    const known =
      s.samples.some((x) => x.sourceAnatomy.objectId === objectId) ||
      s.candidates.some((c) => c.objectId === objectId)
    if (!known) return fail(`Unknown object: ${objectId}`)
  }
  ctx.store.update((st) => ({
    ...st,
    view: { ...st.view, selectionObjectId: objectId },
  }))
  return ok()
}

export async function createCandidate(
  ctx: OpsContext,
  sampleId: string,
): Promise<OpResult<{ candidateId: string; revisionId: string }>> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const sample = s.samples.find((x) => x.id === sampleId)
  if (!sample) return fail(`Unknown sample: ${sampleId}`)
  if (!sample.spatiallyVerified) {
    return fail('Sample is not spatially verified; createCandidate rejected')
  }
  const srcBytes = s.volumes.get(sample.sourceAnatomy.volumeId)
  if (!srcBytes) return fail('Source volume missing')
  const candidateId = newId('cand')
  const revisionId = newId('rev')
  const volumeId = `vol-${candidateId}`
  const copy = new Uint8Array(srcBytes)
  const volumeHash = await sha256Hex(copy)
  const nextVolumes = new Map(s.volumes)
  nextVolumes.set(volumeId, copy)
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    volumes: nextVolumes,
    candidates: [
      ...st.candidates,
      { objectId: candidateId, sampleId, currentRevisionId: revisionId },
    ],
    revisions: [
      ...st.revisions,
      {
        id: revisionId,
        candidateId,
        order: 0,
        volumeId,
        pose: IDENTITY_POSE,
        volumeHash,
      },
    ],
  }))
  return okVal({ candidateId, revisionId })
}

export async function transformCandidate(
  ctx: OpsContext,
  args: { candidateId: string; pose: Mat4; apply: boolean },
): Promise<OpResult<{ revisionId?: string }>> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (s.samples.some((x) => x.sourceAnatomy.objectId === args.candidateId)) {
    return fail('Cannot transform source anatomy')
  }
  const cand = s.candidates.find((c) => c.objectId === args.candidateId)
  if (!cand) return fail(`Unknown candidate: ${args.candidateId}`)
  if (!args.apply) return okVal({})
  const current = s.revisions.find((r) => r.id === cand.currentRevisionId)
  if (!current) return fail('Current revision missing')
  const revisionId = newId('rev')
  const order =
    Math.max(
      0,
      ...s.revisions.filter((r) => r.candidateId === cand.objectId).map((r) => r.order),
    ) + 1
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    candidates: st.candidates.map((c) =>
      c.objectId === cand.objectId ? { ...c, currentRevisionId: revisionId } : c,
    ),
    revisions: [
      ...st.revisions,
      {
        id: revisionId,
        candidateId: cand.objectId,
        order,
        volumeId: current.volumeId,
        pose: args.pose,
        volumeHash: current.volumeHash,
      },
    ],
  }))
  return okVal({ revisionId })
}

export function restoreRevision(
  ctx: OpsContext,
  args: { candidateId: string; revisionId: string },
): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const cand = s.candidates.find((c) => c.objectId === args.candidateId)
  if (!cand) return fail(`Unknown candidate: ${args.candidateId}`)
  const rev = s.revisions.find(
    (r) => r.id === args.revisionId && r.candidateId === args.candidateId,
  )
  if (!rev) return fail('Revision not found for candidate')
  if (cand.currentRevisionId === rev.id) return ok()
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    candidates: st.candidates.map((c) =>
      c.objectId === cand.objectId ? { ...c, currentRevisionId: rev.id } : c,
    ),
  }))
  return ok()
}

export function createProject(
  ctx: OpsContext,
  args: { name: string },
): OpResult<{ projectId: string }> {
  const name = args.name.trim()
  if (!name) return fail('Project name is required')
  const projectId = newId('proj')
  const state: EditorState = {
    user: { id: 'local-dev', displayName: 'Local Dev' },
    project: { id: projectId, ownerUserId: 'local-dev', name },
    cases: [],
    samples: [],
    candidates: [],
    revisions: [],
    annotations: [],
    view: emptyViewState(),
    volumes: new Map(),
    dirty: false,
    openDocuments: [],
    activeDocumentId: null,
  }
  ctx.store.setState(state)
  ctx.registry?.remember({
    id: projectId,
    name,
    updatedAt: new Date().toISOString(),
    caseCount: 0,
  })
  return okVal({ projectId })
}

export function listProjects(ctx: OpsContext): OpResult<ProjectSummary[]> {
  return okVal(ctx.registry?.list() ?? [])
}

export function createCase(
  ctx: OpsContext,
  args: { name: string },
): OpResult<{ caseId: string }> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const name = args.name.trim()
  if (!name) return fail('Case name is required')
  const caseId = newId('case')
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    cases: [
      ...st.cases,
      { id: caseId, projectId: st.project.id, name },
    ],
  }))
  const next = ctx.store.getState()
  if (next) {
    ctx.registry?.updateCaseCount(next.project.id, next.cases.length)
  }
  return okVal({ caseId })
}

export function openDocument(
  ctx: OpsContext,
  args: { kind: DocumentKind; id: string },
): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (args.kind === 'sample') {
    if (!s.samples.some((x) => x.id === args.id)) {
      return fail(`Unknown sample: ${args.id}`)
    }
  } else if (!s.candidates.some((c) => c.objectId === args.id)) {
    return fail(`Unknown candidate: ${args.id}`)
  }
  const already = s.openDocuments.some(
    (d) => d.kind === args.kind && d.id === args.id,
  )
  ctx.store.update((st) => ({
    ...st,
    openDocuments: already
      ? st.openDocuments
      : [...st.openDocuments, { kind: args.kind, id: args.id }],
    activeDocumentId: args.id,
  }))
  return ok()
}

export function closeDocument(
  ctx: OpsContext,
  args: { kind: DocumentKind; id: string },
): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const open = s.openDocuments.some(
    (d) => d.kind === args.kind && d.id === args.id,
  )
  if (!open) return fail('Document tab is not open')
  ctx.store.update((st) => {
    const openDocuments = st.openDocuments.filter(
      (d) => !(d.kind === args.kind && d.id === args.id),
    )
    let activeDocumentId = st.activeDocumentId
    if (activeDocumentId === args.id) {
      activeDocumentId = openDocuments[openDocuments.length - 1]?.id ?? null
    }
    return { ...st, openDocuments, activeDocumentId }
  })
  return ok()
}

export function setActiveDocument(
  ctx: OpsContext,
  args: { kind: DocumentKind; id: string },
): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const open = s.openDocuments.some(
    (d) => d.kind === args.kind && d.id === args.id,
  )
  if (!open) return fail('Document tab is not open')
  ctx.store.update((st) => ({ ...st, activeDocumentId: args.id }))
  return ok()
}

/** Test helper: seeded project with a default case (legacy fixtures). */
export function seedEmptyProject(ctx: OpsContext): void {
  const projectId = 'proj-new'
  ctx.store.setState({
    user: { id: 'local-dev', displayName: 'Local Dev' },
    project: { id: projectId, ownerUserId: 'local-dev', name: 'Untitled' },
    cases: [{ id: 'case-1', projectId, name: 'Primary' }],
    samples: [],
    candidates: [],
    revisions: [],
    annotations: [],
    view: emptyViewState(),
    volumes: new Map(),
    dirty: false,
    openDocuments: [],
    activeDocumentId: null,
  })
}

function pointsAreFinite(points: RasPoint[]): boolean {
  return points.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 3 &&
      p.every((n) => typeof n === 'number' && Number.isFinite(n)),
  )
}

function validatePointCount(
  type: AnnotationType,
  points: RasPoint[],
  meta: Record<string, unknown>,
): string | null {
  const n = points.length
  switch (type) {
    case 'landmark':
    case 'text_note':
    case 'highlight':
      return n === 1 ? null : `${type} requires exactly 1 control point`
    case 'line':
    case 'roi':
      return n === 2 ? null : `${type} requires exactly 2 control points`
    case 'angle':
      return n === 3 ? null : 'angle requires exactly 3 control points'
    case 'closed_curve':
      return n >= 3 ? null : 'closed_curve requires at least 3 control points'
    case 'open_curve':
      return n >= 2 ? null : 'open_curve requires at least 2 control points'
    case 'plane': {
      const method = meta.method
      if (method !== 'point-normal' && method !== 'three-point') {
        return 'Plane method must be point-normal or three-point'
      }
      if (method === 'three-point' && n < 3) {
        return 'Three-point plane requires at least 3 control points'
      }
      if (method === 'point-normal' && n < 1) {
        return 'Point-normal plane requires at least 1 control point'
      }
      return null
    }
    default:
      return null
  }
}

function roiMetaFromPoints(
  points: RasPoint[],
  meta: Record<string, unknown>,
): Record<string, unknown> {
  if (meta.min != null && meta.max != null) return { ...meta }
  const [a, b] = points
  const min: RasPoint = [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2]),
  ]
  const max: RasPoint = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2]),
  ]
  return { ...meta, min, max }
}

export function addAnnotation(
  ctx: OpsContext,
  args: {
    type: AnnotationType
    name: string
    points: RasPoint[]
    meta: Record<string, unknown>
    revisionId: string
  },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (s.samples.some((x) => x.id === s.activeDocumentId)) {
    return fail('Cannot annotate source anatomy; requires active candidate')
  }
  const rev = s.revisions.find((r) => r.id === args.revisionId)
  if (!rev) return fail('Revision not found')
  if (!s.candidates.some((c) => c.objectId === rev.candidateId)) {
    return fail('Revision does not belong to a candidate')
  }
  if (!pointsAreFinite(args.points)) {
    return fail('Annotation points must contain finite coordinates')
  }
  const pointErr = validatePointCount(args.type, args.points, args.meta)
  if (pointErr) return fail(pointErr)
  const meta =
    args.type === 'roi' ? roiMetaFromPoints(args.points, args.meta) : { ...args.meta }
  const annotation: Annotation = {
    id: newId('ann'),
    revisionId: args.revisionId,
    type: args.type,
    name: args.name,
    points: args.points.map((p) => [p[0], p[1], p[2]] as RasPoint),
    meta,
    locked: false,
    visible: true,
    createdAt: new Date().toISOString(),
  }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: [...st.annotations, annotation],
  }))
  return okVal(annotation)
}

export function renameAnnotation(
  ctx: OpsContext,
  args: { id: string; name: string },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const existing = s.annotations.find((a) => a.id === args.id)
  if (!existing) return fail(`Unknown annotation: ${args.id}`)
  const updated: Annotation = { ...existing, name: args.name }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.map((a) => (a.id === args.id ? updated : a)),
  }))
  return okVal(updated)
}

export function setAnnotationVisible(
  ctx: OpsContext,
  args: { id: string; visible: boolean },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const existing = s.annotations.find((a) => a.id === args.id)
  if (!existing) return fail(`Unknown annotation: ${args.id}`)
  const updated: Annotation = { ...existing, visible: args.visible }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.map((a) => (a.id === args.id ? updated : a)),
  }))
  return okVal(updated)
}

export function setAnnotationLocked(
  ctx: OpsContext,
  args: { id: string; locked: boolean },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const existing = s.annotations.find((a) => a.id === args.id)
  if (!existing) return fail(`Unknown annotation: ${args.id}`)
  const updated: Annotation = { ...existing, locked: args.locked }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.map((a) => (a.id === args.id ? updated : a)),
  }))
  return okVal(updated)
}

export function updateAnnotationPoints(
  ctx: OpsContext,
  args: { id: string; points: RasPoint[] },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const existing = s.annotations.find((a) => a.id === args.id)
  if (!existing) return fail(`Unknown annotation: ${args.id}`)
  if (!pointsAreFinite(args.points)) {
    return fail('Annotation points must contain finite coordinates')
  }
  const updated: Annotation = {
    ...existing,
    points: args.points.map((p) => [p[0], p[1], p[2]] as RasPoint),
  }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.map((a) => (a.id === args.id ? updated : a)),
  }))
  return okVal(updated)
}

export function updateAnnotationMeta(
  ctx: OpsContext,
  args: { id: string; meta: Record<string, unknown> },
): OpResult<Annotation> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const existing = s.annotations.find((a) => a.id === args.id)
  if (!existing) return fail(`Unknown annotation: ${args.id}`)
  const updated: Annotation = {
    ...existing,
    meta: { ...existing.meta, ...args.meta },
  }
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.map((a) => (a.id === args.id ? updated : a)),
  }))
  return okVal(updated)
}

export function deleteAnnotation(
  ctx: OpsContext,
  args: { id: string },
): OpResult {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (!s.annotations.some((a) => a.id === args.id)) return ok()
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    annotations: st.annotations.filter((a) => a.id !== args.id),
  }))
  return ok()
}
