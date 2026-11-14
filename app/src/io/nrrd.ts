import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256Hex } from '../domain/hash'
import type { SpatialMeta } from '../domain/types'
import { parseNrrdBuffer, withinTol } from './nrrdParse'

export { parseNrrdBuffer, withinTol } from './nrrdParse'

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

export function verifyAgainstMetadata(
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
      return { verified: false, error: `size[${i}] ${spatial.sizes[i]} != ${ref.sizes[i]}` }
    }
    if (!withinTol(spatial.spacings[i], ref.spacings[i], st)) {
      return { verified: false, error: `spacing[${i}] out of tolerance` }
    }
    if (!withinTol(spatial.bboxMm[i], ref.bboxMm[i], bt)) {
      return { verified: false, error: `bboxMm[${i}] out of tolerance` }
    }
  }
  if (ref.space && spatial.space && spatial.space !== ref.space) {
    return { verified: false, error: `orientation/space ${spatial.space} != ${ref.space}` }
  }
  return { verified: true }
}

/** Node-only: load curated sample directory. */
export async function loadSampleVolume(
  sampleDir: string,
  volumeFile = 'defective_skull.nrrd',
): Promise<{
  bytes: Uint8Array
  spatial: SpatialMeta
  volumeHash: string
  meta: SampleMetadata
  spatiallyVerified: boolean
  verifyError?: string
}> {
  const metaPath = path.join(sampleDir, 'metadata.json')
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as SampleMetadata
  const volPath = path.join(sampleDir, volumeFile)
  const bytes = new Uint8Array(await readFile(volPath))
  let spatial: SpatialMeta
  try {
    spatial = parseNrrdBuffer(bytes).spatial
  } catch (e) {
    return {
      bytes,
      spatial: { units: 'unknown', sizes: [], spacings: [], bboxMm: [] },
      volumeHash: await sha256Hex(bytes),
      meta,
      spatiallyVerified: false,
      verifyError: e instanceof Error ? e.message : String(e),
    }
  }
  const check = verifyAgainstMetadata(spatial, meta)
  return {
    bytes,
    spatial,
    volumeHash: await sha256Hex(bytes),
    meta,
    spatiallyVerified: check.verified,
    verifyError: check.verified ? undefined : check.error,
  }
}
