import { sha256Hex } from '../domain/hash'
import { newId } from '../domain/id'
import type { OpResult, SpatialMeta } from '../domain/types'
import { parseNrrdBuffer, withinTol } from '../io/nrrdParse'
import type { OpsContext } from './session'

export type SampleMetadata = {
  sampleId: string
  license: string
  primaryVolume: string
  spatial: {
    units: string
    space?: string
    dimension: number
    sizes: number[]
    spacings: number[]
    bboxMm: number[]
    orientationNote?: string
  }
  r3ToleranceMm: number
  r3ToleranceSpacing: number
}

function verifyAgainstMetadata(
  spatial: SpatialMeta,
  meta: SampleMetadata,
): { verified: true } | { verified: false; error: string } {
  const ref = meta.spatial
  const st = meta.r3ToleranceSpacing
  const bt = meta.r3ToleranceMm
  if (spatial.sizes.length !== ref.sizes.length) {
    return { verified: false, error: 'size rank mismatch vs metadata.json' }
  }
  for (let i = 0; i < spatial.sizes.length; i++) {
    if (spatial.sizes[i] !== ref.sizes[i]) {
      return {
        verified: false,
        error:
          'size[' + String(i) + '] ' + String(spatial.sizes[i]) + ' != ' + String(ref.sizes[i]),
      }
    }
    if (!withinTol(spatial.spacings[i], ref.spacings[i], st)) {
      return { verified: false, error: 'spacing[' + String(i) + '] out of tolerance' }
    }
    if (!withinTol(spatial.bboxMm[i], ref.bboxMm[i], bt)) {
      return { verified: false, error: 'bboxMm[' + String(i) + '] out of tolerance' }
    }
  }
  if (ref.space && spatial.space && spatial.space !== ref.space) {
    return {
      verified: false,
      error: 'orientation/space ' + spatial.space + ' != ' + ref.space,
    }
  }
  return { verified: true }
}

function fail<T = void>(error: string): OpResult<T> {
  return { ok: false, error }
}
function okVal<T>(value: T): OpResult<T> {
  return { ok: true, value }
}

/**
 * Browser- and Node-safe import of a prepared NRRD volume + metadata.json
 * (curated trees under data/samples/, served as /samples/ in the app).
 */
export async function importPreparedSample(
  ctx: OpsContext,
  args: {
    caseId: string
    sampleId?: string
    displayName?: string
    bytes: Uint8Array
    meta: SampleMetadata
  },
): Promise<OpResult<{ sampleId: string; objectId: string; spatiallyVerified: boolean }>> {
  const s = ctx.store.getState()
  if (!s) return fail('No project open')
  if (!s.cases.some((c) => c.id === args.caseId)) {
    return fail('Unknown case: ' + args.caseId)
  }

  let spatial: SpatialMeta
  try {
    spatial = parseNrrdBuffer(args.bytes).spatial
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
  const check = verifyAgainstMetadata(spatial, args.meta)
  const sampleId = args.sampleId ?? args.meta.sampleId ?? newId('sample')
  const volumeId = 'vol-' + sampleId
  const objectId = 'obj-source-' + sampleId
  const volumeHash = await sha256Hex(args.bytes)
  const nextVolumes = new Map(s.volumes)
  nextVolumes.set(volumeId, args.bytes)

  ctx.store.update((st) => ({
    ...st,
    dirty: true,
    volumes: nextVolumes,
    samples: [
      ...st.samples,
      {
        id: sampleId,
        caseId: args.caseId,
        displayName: args.displayName ?? args.meta.sampleId ?? sampleId,
        license: args.meta.license,
        spatiallyVerified: check.verified,
        sourceAnatomy: {
          objectId,
          sampleId,
          volumeId,
          spatial,
          volumeHash,
        },
      },
    ],
  }))

  return okVal({
    sampleId,
    objectId,
    spatiallyVerified: check.verified,
  })
}

export type SampleCatalogEntry = {
  id: string
  label: string
  primaryVolume: string
  baseUrl: string
  license: string
}

export async function fetchPreparedSample(
  entry: SampleCatalogEntry,
): Promise<{ bytes: Uint8Array; meta: SampleMetadata }> {
  const metaRes = await fetch(entry.baseUrl + '/metadata.json')
  if (!metaRes.ok) throw new Error('Missing metadata for ' + entry.id)
  const meta = (await metaRes.json()) as SampleMetadata
  const volRes = await fetch(entry.baseUrl + '/' + entry.primaryVolume)
  if (!volRes.ok) throw new Error('Missing volume ' + entry.primaryVolume)
  const bytes = new Uint8Array(await volRes.arrayBuffer())
  return { bytes, meta }
}

export async function loadSampleCatalog(
  url = '/samples/catalog.json',
): Promise<SampleCatalogEntry[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Sample catalog missing — run npm run sync:samples')
  return (await res.json()) as SampleCatalogEntry[]
}
