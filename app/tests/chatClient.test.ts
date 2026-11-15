import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatClient } from '../src/api/chat'

const request = {
  request_id: 'request-1',
  conversation_id: 'conversation-1',
  project_id: 'project-1',
  case_id: 'case-1',
  object_id: 'candidate-1',
  expected_revision_id: 'revision-1',
  message: 'Describe the selected object',
}

afterEach(() => vi.restoreAllMocks())

describe('chatClient', () => {
  it('posts the active workspace context to the same-origin FastAPI chat route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        mode: 'fake-read-only',
        request_id: request.request_id,
        conversation_id: request.conversation_id,
        outcome: { status: 'completed', explanation: 'Read authoritative metadata.' },
        limitations: ['No geometry operation was performed.'],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const response = await chatClient.send(request)

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }))
    expect(response.outcome.explanation).toBe('Read authoritative metadata.')
    expect(response.limitations).toEqual(['No geometry operation was performed.'])
  })
})
