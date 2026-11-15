import type { ProjectManifest } from '../io/projectPackage'
import type { Annotation, AnnotationType, RasPoint, SpatialMeta } from '../domain/types'
// Thin typed fetch wrapper for /api/... endpoints
const BASE = '/api'

export type ApiProject = { id: string; name: string; updatedAt: string; caseCount: number }
export type ApiCase = { id: string; name: string; projectId: string }
export type ApiSample = { sampleId: string; spatiallyVerified: boolean }

/** Predicted bone fix (cranial-reconstruction-candidate). */
export type FixRunResult = { candidateId: string; revisionId: string; implantVoxels: number }
export type FixRunState = {
  runId: string
  status: 'running' | 'succeeded' | 'failed'
  stage: string
  elapsedS: number
  result?: FixRunResult
  error?: { code: string; message: string }
}
export type FixMetric = {
  key: string
  label: string
  value: number | string | number[] | null
  unit: string
  method: string
  status: 'ok' | 'not-available'
  reason?: string
}
export type HeldOutScores = {
  cases: number
  failures: number
  meanDice: number
  medianHd95Mm: number
  meanDice95Ci?: [number, number]
}
export type FixReport = {
  candidateId: string
  revisionId: string
  fix: { label: string; metrics: FixMetric[] }
  mlRecord: {
    model: { name: string; architecture: string; parameters: number; input: string }
    trainingData: string
    heldOut: { test: HeldOutScores; validation: HeldOutScores; note: string }
    checkpointHash: string
    runId: string
    threshold: number
    thresholdIsDefault: boolean
    region: number[][] | null
    inferenceSeconds: number
    totalSeconds: number
    limitation: string
  }
}
export type FixScope = { project_id: string; case_id: string }

/** Error carrying the backend's machine-readable code (e.g. model-endpoint-unconfigured). */
export class ApiCodeError extends Error {
  readonly code: string | null
  readonly status: number
  constructor(message: string, code: string | null, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    let body: { code?: unknown; error?: unknown } = {}
    try { body = JSON.parse(text) } catch { /* plain-text error */ }
    const code = typeof body.code === 'string' ? body.code : null
    // Coded backend errors carry a human-readable message; show that instead of the raw response.
    const message = code && typeof body.error === 'string'
      ? body.error
      : `API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`
    throw new ApiCodeError(message, code, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  // Predicted fix (cranial-reconstruction-candidate)
  async startFix(sampleId: string, scope: FixScope): Promise<{ runId: string }> {
    return request(`/samples/${encodeURIComponent(sampleId)}/reconstructions`, {
      method: 'POST', body: JSON.stringify(scope),
    })
  },

  async getFixRun(runId: string): Promise<FixRunState> {
    return request(`/reconstructions/${encodeURIComponent(runId)}`)
  },

  async adjustFix(
    candidateId: string,
    body: FixScope & { expected_revision_id: string; threshold?: number; region?: number[][] },
  ): Promise<FixRunResult & { threshold: number; thresholdIsDefault: boolean }> {
    return request(`/candidates/${encodeURIComponent(candidateId)}/fix-adjustment`, {
      method: 'POST', body: JSON.stringify(body),
    })
  },

  async getFixReport(candidateId: string, scope: FixScope): Promise<FixReport> {
    const query = new URLSearchParams(scope).toString()
    return request(`/candidates/${encodeURIComponent(candidateId)}/fix-report?${query}`)
  },

  async fetchRevisionVolume(candidateId: string, revisionId: string): Promise<Uint8Array> {
    const res = await fetch(`${BASE}/candidates/${encodeURIComponent(candidateId)}/revisions/${encodeURIComponent(revisionId)}/volume`)
    if (!res.ok) throw new Error(`Revision volume unavailable (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  },

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

  async searchProjectSamples(
    projectId: string,
    q = '',
  ): Promise<{
    samples: Array<{ id: string; displayName: string; caseId: string; caseName: string }>
  }> {
    const query = new URLSearchParams()
    if (q) query.set('q', q)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return request(`/projects/${encodeURIComponent(projectId)}/samples${suffix}`)
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

  async listAnnotations(revisionId: string): Promise<Annotation[]> {
    return request<Annotation[]>(
      `/revisions/${encodeURIComponent(revisionId)}/annotations`,
    )
  },

  async createAnnotation(
    revisionId: string,
    fields: {
      type: AnnotationType
      name: string
      points: RasPoint[]
      meta?: Record<string, unknown>
      locked?: boolean
      visible?: boolean
      createdAt?: string
    },
  ): Promise<Annotation> {
    return request<Annotation>(
      `/revisions/${encodeURIComponent(revisionId)}/annotations`,
      {
        method: 'POST',
        body: JSON.stringify(fields),
      },
    )
  },

  async updateAnnotation(
    id: string,
    partial: {
      name?: string
      points?: RasPoint[]
      meta?: Record<string, unknown>
      locked?: boolean
      visible?: boolean
    },
  ): Promise<Annotation> {
    return request<Annotation>(`/annotations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(partial),
    })
  },

  async deleteAnnotation(id: string): Promise<void> {
    return request<void>(`/annotations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
