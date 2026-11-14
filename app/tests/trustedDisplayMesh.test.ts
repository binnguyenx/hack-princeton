import { afterEach, expect, it, vi } from 'vitest'
import { resolveTrustedDisplayMesh } from '../src/geometry/trustedDisplayMesh'
import type { Sample } from '../src/domain/types'
const hash = 'a'.repeat(64)
const entry = { id: 'fixture', label: 'Fixture', baseUrl: '/samples/fixture', primaryVolume: 'source.nrrd', license: 'test' }
const sample = { displayName: 'fixture', sourceAnatomy: { volumeHash: hash } } as Sample
afterEach(() => vi.unstubAllGlobals())
it('binds bundled display assets to primary-volume hashes rather than a matching sample name', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: { 'source.nrrd': { sha256: hash } } }))))
  expect(await resolveTrustedDisplayMesh(sample, [entry])).toBe('/samples/fixture/display_mesh.glb')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: { 'source.nrrd': { sha256: 'b'.repeat(64) } } }))))
  expect(await resolveTrustedDisplayMesh(sample, [entry])).toBeNull()
})
it('never follows a supplied external or local asset path', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  expect(await resolveTrustedDisplayMesh({ ...sample, displayName: 'unknown', sourceSampleDir: '/private/not-a-sample', displayMeshAsset: 'https://untrusted.invalid/mesh.glb' }, [entry])).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})
