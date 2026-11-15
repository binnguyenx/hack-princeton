export type ReadOnlyChatRequest = {
  request_id: string
  conversation_id: string
  project_id: string
  case_id: string
  object_id: string
  expected_revision_id?: string
  message: string
}

export type ReadOnlyChatResponse = {
  mode: 'fake-read-only'
  request_id: string
  conversation_id: string
  outcome: {
    status: 'completed' | 'unsupported' | 'unavailable' | 'stale' | 'failed'
    code?: string | null
    explanation: string
  }
  limitations: string[]
}

function isResponse(value: unknown): value is ReadOnlyChatResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<ReadOnlyChatResponse>
  return response.mode === 'fake-read-only'
    && typeof response.request_id === 'string'
    && typeof response.conversation_id === 'string'
    && !!response.outcome
    && typeof response.outcome.explanation === 'string'
    && Array.isArray(response.limitations)
}

export const chatClient = {
  async send(request: ReadOnlyChatRequest, signal?: AbortSignal): Promise<ReadOnlyChatResponse> {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`)
    }
    const payload: unknown = await response.json()
    if (!isResponse(payload)) {
      throw new Error('Chat response does not match the read-only contract')
    }
    return payload
  },
}
