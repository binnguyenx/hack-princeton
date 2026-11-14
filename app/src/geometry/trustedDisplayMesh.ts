import type { Sample } from '../domain/types'
import type { SampleCatalogEntry } from '../ops/importPrepared'

function key(value?: string): string | undefined {
  return value?.replace(/\\/g, '/').split('/').filter(Boolean).at(-1)?.toLowerCase().replace(/\.nrrd$/, '')
}

/** Imported names/paths are not asset authority. Match a bundled catalog entry and raw volume hash. */
export async function resolveTrustedDisplayMesh(sample: Sample, catalog: SampleCatalogEntry[]): Promise<string | null> {
  const entry = catalog.find((item) => key(sample.displayName) === item.id.toLowerCase()
    || key(sample.sourceSampleDir) === item.id.toLowerCase()
    || sample.displayMeshAsset === `${item.baseUrl}/display_mesh.glb`)
  if (!entry || !/^\/samples\/[A-Za-z0-9_-]+$/.test(entry.baseUrl) || !/^[A-Za-z0-9_-]+\.nrrd$/.test(entry.primaryVolume)) return null
  try {
    const response = await fetch(`${entry.baseUrl}/metadata.json`)
    if (!response.ok) return null
    const metadata = await response.json()
    const expected = metadata?.files?.[entry.primaryVolume]?.sha256
    return typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected) && expected === sample.sourceAnatomy.volumeHash
      ? `${entry.baseUrl}/display_mesh.glb` : null
  } catch { return null }
}
