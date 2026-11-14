import type { SourceLandmark } from '../domain/types'
export type LandmarkContext = { projectId: string; caseId: string; volumeHash: string }
async function request<T>(path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Landmark request failed (HTTP ${response.status})`)
  }
  return response.status === 204 ? undefined as T : response.json()
}
export const landmarkClient = {
  async create(sampleId: string, context: LandmarkContext, ijk: [number, number, number], label: string): Promise<SourceLandmark> {
    const result = await request<{ landmark: SourceLandmark }>(`/api/samples/${encodeURIComponent(sampleId)}/landmarks`, 'POST', { ...context, ijk, label })
    return result.landmark
  },
  async delete(sampleId: string, id: string, context: LandmarkContext): Promise<void> {
    await request<void>(`/api/samples/${encodeURIComponent(sampleId)}/landmarks/${encodeURIComponent(id)}`, 'DELETE', context)
  },
}
