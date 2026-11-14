import { afterEach, expect, it, vi } from 'vitest'
import { packageClient } from '../src/api/packages'
afterEach(() => vi.unstubAllGlobals())

it('downloads a ZIP using presentation only, never client domain records', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([80, 75]), { headers: { 'content-type': 'application/zip' } }))
  vi.stubGlobal('fetch', fetcher)
  const blob = await packageClient.export('project/a', {})
  expect(blob.type).toBe('application/zip')
  expect(fetcher).toHaveBeenCalledWith('/api/projects/project%2Fa/package', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
})

it('uploads an explicit file once and rejects server/non-ZIP errors without retries', async () => {
  const file = new File(['zip'], 'project.zip', { type: 'application/zip' })
  const result = { projectId: 'new-project', presentation: { viewState: {}, openDocuments: [], activeDocumentId: null } }
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)))
  vi.stubGlobal('fetch', fetcher)
  expect(await packageClient.importCopy(file)).toEqual(result)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith('/api/packages/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file })
  fetcher.mockResolvedValue(new Response(JSON.stringify({ error: 'Hash mismatch' }), { status: 422 }))
  await expect(packageClient.importCopy(file)).rejects.toThrow('Hash mismatch')
  expect(fetcher).toHaveBeenCalledTimes(2)
  fetcher.mockResolvedValue(new Response('<html>'))
  await expect(packageClient.export('p', {})).rejects.toThrow('Invalid package download response')
})
