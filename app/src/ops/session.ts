import { sha256Hex } from '../domain/hash'
import { newId } from '../domain/id'
import {
  IDENTITY_POSE,
  type CameraState,
  type EditorState,
  type InspectionPlane,
  type Mat4,
  type OpResult,
} from '../domain/types'
import { EditorStore, emptyViewState } from '../state/store'

export type OpsContext = {
  store: EditorStore
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
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    candidates: st.candidates.map((c) =>
      c.objectId === cand.objectId ? { ...c, currentRevisionId: rev.id } : c,
    ),
  }))
  return ok()
}

export function seedEmptyProject(ctx: OpsContext): void {
  ctx.store.setState({
    user: { id: 'local-dev', displayName: 'Local Dev' },
    project: { id: 'proj-new', ownerUserId: 'local-dev', name: 'Untitled' },
    cases: [{ id: 'case-1', projectId: 'proj-new', name: 'Primary' }],
    samples: [],
    candidates: [],
    revisions: [],
    view: emptyViewState(),
    volumes: new Map(),
    dirty: false,
  })
}
