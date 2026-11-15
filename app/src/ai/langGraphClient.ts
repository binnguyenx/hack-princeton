/** Application FastAPI JSON chat; the backend selects a metadata-only fake or Gemini model. */
import type { ChatContext } from './chatContext'

export interface ChatMessage {
  id: string
  role: 'human' | 'ai'
  content: string
  streaming?: boolean
  createdAt: string
}
export type ChatTurn = { role: 'human' | 'assistant'; content: string }
export type StreamEvent =
  | { event: 'metadata'; data: { run_id: string; provider?: string; model_id?: string } }
  | { event: 'messages'; data: Array<{ id: string; content: string; type: string }> }
  | { event: 'end'; data: Record<string, never> }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export const langGraphClient = {
  // Retain the restored panel interface; there is no remote thread/SSE server.
  async createThread(): Promise<string> { return crypto.randomUUID() },
  async *streamResponse(conversationId: string, history: ChatTurn[], message: string,
    context?: ChatContext | null, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    if (!context) throw new Error('Open a source or candidate to provide chat context.')
    const requestId = crypto.randomUUID()
    const response = await fetch('/api/ai/chat', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, request_id: requestId, conversation_id: conversationId,
        message, history: history.slice(-24).map(turn => ({ ...turn, content: turn.content.slice(0, 4000) })) }) })
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null)
      if (record(failure) && failure.code === 'model-config-invalid') {
        throw new Error('model-config-invalid: configure the backend Gemini environment (provider, key and model).')
      }
      throw new Error(`Read-only chat unavailable (${response.status}). Check FastAPI and the shared storage root.`)
    }
    const body: unknown = await response.json()
    if (!record(body) || !['fake-read-only', 'llm-read-only'].includes(String(body.mode)) || body.request_id !== requestId || body.conversation_id !== conversationId
      || !record(body.outcome) || typeof body.outcome.explanation !== 'string') throw new Error('Invalid read-only chat response.')
    if (body.mode === 'llm-read-only' && (body.capability_policy !== 'metadata-read-only'
      || !record(body.model) || body.model.provider !== 'gemini' || typeof body.model.id !== 'string' || !body.model.id)) throw new Error('Invalid read-only provider policy.')
    const outcome = body.outcome
    if (outcome.status !== 'completed') throw new Error(`${typeof outcome.code === 'string' ? outcome.code + ': ' : ''}${String(outcome.explanation)}`)
    const actual = outcome.context
    if (!record(actual) || actual.project_id !== context.project_id || actual.case_id !== context.case_id
      || actual.selected_object_id !== context.object_id || actual.revision_id !== context.expected_revision_id
      || !record(outcome.observation) || outcome.observation.scope !== 'application-read') throw new Error('Chat context mismatch. Reload the selected document.')
    yield { event: 'metadata', data: { run_id: requestId, provider: body.mode === 'llm-read-only' ? 'gemini' : 'fake',
      model_id: record(body.model) && typeof body.model.id === 'string' ? body.model.id : 'deterministic' } }
    yield { event: 'messages', data: [{ id: requestId, content: String(outcome.explanation), type: 'AIMessageChunk' }] }
    yield { event: 'end', data: {} }
  },
}
