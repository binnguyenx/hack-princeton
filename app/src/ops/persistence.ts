import { newId } from '../domain/id'
import type { OpResult } from '../domain/types'
import { loadSampleVolume } from '../io/nrrd'
import { loadProjectPackage, saveProjectPackage } from '../io/projectPackage'
import type { OpsContext } from './session'

function fail<T = void>(error: string): OpResult<T> {
  return { ok: false, error }
}
function ok(): OpResult {
  return { ok: true, value: undefined }
}
function okVal<T>(value: T): OpResult<T> {
  return { ok: true, value }
}

export async function importSample(
  ctx: OpsContext,
  args: { caseId: string; sampleDir: string; sampleId?: string },
): Promise<OpResult<{ sampleId: string; objectId: string }>> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (!s.cases.some((c) => c.id === args.caseId)) return fail(`Unknown case: ${args.caseId}`)
  const loaded = await loadSampleVolume(args.sampleDir)
  const sampleId = args.sampleId ?? newId('sample')
  const volumeId = `vol-${sampleId}`
  const objectId = `obj-source-${sampleId}`
  const nextVolumes = new Map(s.volumes)
  nextVolumes.set(volumeId, loaded.bytes)
  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    volumes: nextVolumes,
    samples: [
      ...st.samples,
      {
        id: sampleId,
        caseId: args.caseId,
        license: loaded.meta.license,
        spatiallyVerified: loaded.spatiallyVerified,
        sourceSampleDir: args.sampleDir,
        sourceAnatomy: {
          objectId,
          sampleId,
          volumeId,
          spatial: loaded.spatial,
          volumeHash: loaded.volumeHash,
        },
      },
    ],
  }))
  return okVal({ sampleId, objectId })
}

export async function saveProject(ctx: OpsContext, dir: string): Promise<OpResult> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  const writer = ctx.saveWriter ?? saveProjectPackage
  try {
    await writer(dir, s)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
  ctx.store.update((st) => ({ ...st, dirty: false }))
  return ok()
}

export async function openProject(ctx: OpsContext, dir: string): Promise<OpResult> {
  const prior = ctx.store.getState()
  try {
    const loaded = await loadProjectPackage(dir)
    ctx.store.setState(loaded)
    return ok()
  } catch (e) {
    ctx.store.setState(prior)
    return fail(e instanceof Error ? e.message : String(e))
  }
}
