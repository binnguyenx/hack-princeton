/**
 * LangGraph Agent Client
 *
 * Implements the LangGraph Cloud / LangGraph Server HTTP API spec.
 *
 * Live endpoints (when a LangGraph server is running):
 *   POST /threads              — create a conversation thread
 *   POST /threads/{id}/runs/stream — stream agent responses (SSE)
 *   GET  /threads/{id}/stream  — rejoin an open stream
 *
 * Request body for /runs/stream:
 * {
 *   "assistant_id": "agent",
 *   "input": { "messages": [{ "role": "human", "content": "..." }] },
 *   "stream_mode": ["messages"]
 * }
 *
 * Response: text/event-stream  (Server-Sent Events)
 *   event: metadata  data: { "run_id": "..." }
 *   event: messages  data: [{ "id": "...", "content": "...", "type": "AIMessageChunk" }]
 *   event: end       data: {}
 *
 * This module exposes a mock implementation by default and can switch to the
 * real network client by setting VITE_LANGGRAPH_API_URL in your .env file.
 */

export interface ChatMessage {
  id: string
  role: 'human' | 'ai'
  content: string
  /** True while an AI message is still streaming in */
  streaming?: boolean
  /** ISO timestamp */
  createdAt: string
}

export interface ThreadCreateResponse {
  thread_id: string
}

export type StreamEvent =
  | { event: 'metadata'; data: { run_id: string } }
  | { event: 'messages'; data: Array<{ id: string; content: string; type: string }> }
  | { event: 'updates'; data: Record<string, unknown> }
  | { event: 'end'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } }

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_LANGGRAPH_API_URL as string | undefined
const ASSISTANT_ID = (import.meta.env.VITE_LANGGRAPH_ASSISTANT_ID as string | undefined) ?? 'agent'
const USE_MOCK = !API_BASE

// ─── Utilities ───────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Live client ─────────────────────────────────────────────────────────────

async function liveCreateThread(): Promise<string> {
  const res = await fetch(`${API_BASE}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`)
  const data = (await res.json()) as ThreadCreateResponse
  return data.thread_id
}

async function* liveStream(
  threadId: string,
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_BASE}/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      assistant_id: ASSISTANT_ID,
      input: { messages },
      stream_mode: ['messages'],
    }),
  })

  if (!res.ok) throw new Error(`Stream request failed: ${res.status}`)
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.trim().split('\n')
      let event = ''
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data = line.slice(5).trim()
      }
      if (!event || !data) continue
      try {
        yield { event, data: JSON.parse(data) } as StreamEvent
      } catch {
        // skip malformed
      }
    }
  }
}

// ─── Mock client ─────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  default:
    "I'm your AI workspace assistant for cranial vault reconstruction. I can help you analyze anatomy, evaluate implant candidates, review measurements, and discuss reconstruction strategies.\n\nWhat would you like to work on?",
  measure:
    "Looking at the active sample, here are the key measurements I can derive from the geometry:\n\n• Defect area: ~12.4 cm²\n• Maximum depth: 8.2 mm\n• Anterior–posterior extent: 54 mm\n• Superior–inferior extent: 61 mm\n\nWould you like me to suggest candidate constraints based on these dimensions?",
  candidate:
    "Based on the sample anatomy, I recommend initializing a candidate with:\n\n• Material: PEEK (polyether ether ketone)\n• Thickness: 3.0 mm uniform\n• Margin overlap: 5 mm beyond defect edge\n• Fixation points: 4× titanium micro-screws\n\nShall I draft the reconstruction brief?",
  implant:
    "The current implant candidate looks geometrically sound. A few observations:\n\n1. The superior margin shows a 2.1° mismatch with the native skull contour — this may require slight revision.\n2. The temporal ridge interface is clean.\n3. Volume displacement is within normal parameters at 18.6 cc.\n\nWould you like to review the slice views for detailed margin analysis?",
}

function mockResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('measure') || lower.includes('size') || lower.includes('dimension'))
    return MOCK_RESPONSES.measure
  if (lower.includes('candidate') || lower.includes('create') || lower.includes('recommend'))
    return MOCK_RESPONSES.candidate
  if (lower.includes('implant') || lower.includes('review') || lower.includes('check'))
    return MOCK_RESPONSES.implant
  return MOCK_RESPONSES.default
}

async function* mockStream(input: string): AsyncGenerator<StreamEvent> {
  yield { event: 'metadata', data: { run_id: uid() } }

  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200))

  const full = mockResponse(input)
  const words = full.split(' ')
  let acc = ''
  const msgId = uid()

  for (let i = 0; i < words.length; i++) {
    acc += (i > 0 ? ' ' : '') + words[i]
    // yield every 3 words as a chunk for realistic streaming
    if (i % 3 === 2 || i === words.length - 1) {
      yield {
        event: 'messages',
        data: [{ id: msgId, content: acc, type: 'AIMessageChunk' }],
      }
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 60))
    }
  }

  yield { event: 'end', data: {} }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const langGraphClient = {
  /**
   * Create a new conversation thread.
   * Returns a thread ID that must be passed to streamResponse.
   */
  async createThread(): Promise<string> {
    if (USE_MOCK) return `mock-thread-${uid()}`
    return liveCreateThread()
  },

  /**
   * Send a human message and stream the AI response.
   * Yields StreamEvents; caller must collect the message chunks.
   */
  async *streamResponse(
    threadId: string,
    history: Array<{ role: string; content: string }>,
    userMessage: string,
  ): AsyncGenerator<StreamEvent> {
    const messages = [...history, { role: 'human', content: userMessage }]
    if (USE_MOCK) {
      yield* mockStream(userMessage)
    } else {
      yield* liveStream(threadId, messages)
    }
  },

  isMock: USE_MOCK,
}
