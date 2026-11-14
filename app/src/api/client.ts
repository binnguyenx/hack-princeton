import type { ProjectManifest } from '../io/projectPackage'
import type { SpatialMeta } from '../domain/types'
// Thin typed fetch wrapper for /api/... endpoints
const BASE = '/api'

export type ApiProject = { id: string; name: string; updatedAt: string; caseCount: number }
export type ApiCase = { id: string; name: string; projectId: string }
export type ApiSample = { sampleId: string; spatiallyVerified: boolean }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  // Projects
  async listProjects(): Promise<ApiProject[]> {
    return request<ApiProject[]>('/projects')
  },

  async createProject(name: string): Promise<{ projectId: string }> {
    return request<{ projectId: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  async deleteProject(id: string): Promise<void> {
    return request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  async getProjectManifest(id: string): Promise<ProjectManifest> {
    return request<ProjectManifest>(`/projects/${encodeURIComponent(id)}`)
  },

  // Cases
  async createCase(projectId: string, name: string): Promise<{ caseId: string }> {
    return request<{ caseId: string }>(`/projects/${encodeURIComponent(projectId)}/cases`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  async deleteCase(projectId: string, caseId: string): Promise<void> {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}`,
      { method: 'DELETE' },
    )
  },

  async importSample(
    projectId: string,
    caseId: string,
    args: {
      displayName: string
      spatiallyVerified: boolean
      meta: SpatialMeta
      bytes: Uint8Array
      filename?: string
    },
  ): Promise<ApiSample> {
    const fd = new FormData()
    fd.set('displayName', args.displayName)
    fd.set('spatiallyVerified', String(args.spatiallyVerified))
    fd.set('meta', JSON.stringify(args.meta))
    const blobBytes = Uint8Array.from(args.bytes)
    fd.set(
      'file',
      new Blob([blobBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
      args.filename ?? `${args.displayName || 'sample'}.nrrd`,
    )
    return request<ApiSample>(
      `/projects/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}/samples`,
      { method: 'POST', body: fd },
    )
  },

  async deleteSample(sampleId: string): Promise<void> {
    return request<void>(`/samples/${encodeURIComponent(sampleId)}`, { method: 'DELETE' })
  },

  // Samples
  async createCandidate(sampleId: string): Promise<{ candidateId: string }> {
    return request<{ candidateId: string }>(`/samples/${encodeURIComponent(sampleId)}/candidates`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  async deleteCandidate(candidateId: string): Promise<void> {
    return request<void>(`/candidates/${encodeURIComponent(candidateId)}`, { method: 'DELETE' })
  },

  async fetchSampleVolume(sampleId: string): Promise<Uint8Array> {
    const res = await fetch(`${BASE}/samples/${encodeURIComponent(sampleId)}/volume`)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API GET /samples/${sampleId}/volume → ${res.status}: ${text}`)
    }
    return new Uint8Array(await res.arrayBuffer())
  },

  async transformCandidate(candidateId: string, pose: number[]): Promise<void> {
    return request<void>(`/candidates/${encodeURIComponent(candidateId)}/transform`, {
      method: 'POST',
      body: JSON.stringify({ pose }),
    })
  },

  async restoreRevision(candidateId: string, revisionId: string): Promise<void> {
    return request<void>(`/candidates/${encodeURIComponent(candidateId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ revisionId }),
    })
  },
}
