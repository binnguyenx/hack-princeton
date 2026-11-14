import type { OpenDocument, ViewState } from '../domain/types'

export type PackagePresentation = { viewState?: ViewState; openDocuments?: OpenDocument[]; activeDocumentId?: string | null }
export type PackageImportResult = { projectId: string; presentation: Required<PackagePresentation> }
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024

async function error(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null)
  throw new Error(typeof payload?.error === 'string' ? payload.error : `Package request failed (HTTP ${response.status}).`)
}

export const packageClient = {
  async export(projectId: string, presentation: PackagePresentation): Promise<Blob> {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/package`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(presentation),
    })
    if (!response.ok) return error(response)
    if (!response.headers.get('content-type')?.includes('application/zip')) throw new Error('Invalid package download response.')
    return response.blob()
  },
  async importCopy(file: File): Promise<PackageImportResult> {
    if (file.size > MAX_PACKAGE_BYTES) throw new Error('Package must be 64 MiB or smaller.')
    const response = await fetch('/api/packages/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file })
    if (!response.ok) return error(response)
    const result: unknown = await response.json()
    if (typeof result !== 'object' || !result || !('projectId' in result) || typeof result.projectId !== 'string'
      || !('presentation' in result) || typeof result.presentation !== 'object' || !result.presentation) {
      throw new Error('Invalid package import response. Check Projects before importing again.')
    }
    return result as PackageImportResult
  },
}

/** A browser download request, not proof that a user accepted a filesystem save. */
export function startPackageDownload(blob: Blob, projectId: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `project-${projectId}.zip`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
