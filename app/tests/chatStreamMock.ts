/** Build the NDJSON body `/api/ai/chat/stream` sends, from a JSON-route envelope. */
type Envelope = Record<string, unknown>
export type MockThinking = { id: string; kind: 'step' | 'reasoning' | 'subagent'; text: string; subagent?: string; phase?: string }

export function ndjsonLines(envelope: Envelope, thinking: MockThinking[] = []): string {
  const { request_id, conversation_id, mode } = envelope
  return [
    { type: 'metadata', mode, request_id, conversation_id },
    ...thinking.map(item => ({ type: 'thinking', ...item })),
    { type: 'result', ...envelope },
  ].map(line => JSON.stringify(line)).join('\n') + '\n'
}

export function ndjsonResponse(envelope: Envelope, thinking: MockThinking[] = []): Response {
  return new Response(ndjsonLines(envelope, thinking), { headers: { 'Content-Type': 'application/x-ndjson' } })
}
