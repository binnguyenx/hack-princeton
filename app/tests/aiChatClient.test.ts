import { afterEach, expect, it, vi } from 'vitest'
import { streamingChatClient as langGraphClient } from '../src/api/chat'
import { ndjsonResponse } from './chatStreamMock'

const context = { project_id: 'project', case_id: 'case', object_id: 'source', expected_revision_id: null }
afterEach(() => vi.unstubAllGlobals())
it('posts bounded history and authoritative identity to FastAPI Gemini chat', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body)
    return ndjsonResponse(({ request_id: body.request_id, conversation_id: body.conversation_id,
      mode: 'gemini-read-only', outcome: { status: 'completed', explanation: 'Read-only reconstruction brief.',
        context: { ...context, selected_object_id: 'source', revision_id: null },
        observation: { scope: 'application-read' } } }))
  })
  vi.stubGlobal('fetch', fetch)
  const events = []
  for await (const event of langGraphClient.streamResponse('conversation', [{role:'human',content:'Inspect skull'}], 'Draft reconstruction brief', context)) events.push(event)
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][0]).toBe('/api/ai/chat/stream')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ ...context, conversation_id:'conversation', message:'Draft reconstruction brief',history:[{role:'human',content:'Inspect skull'}] })
  expect(events.find(e => e.event === 'messages')?.data).toEqual([expect.objectContaining({ content:'Read-only reconstruction brief.' })])
  expect(events[0]).toMatchObject({ event: 'metadata', data: { mode: 'gemini-read-only' } })
})

it('does not fall back to a greeting when FastAPI is unavailable or context is missing', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', {status:502}))
  vi.stubGlobal('fetch', fetch)
  const run = async (target = context) => {
    for await (const _ of langGraphClient.streamResponse('session', [], 'hello', target)) { /* consume */ }
  }
  await expect(run()).rejects.toThrow('502')
  await expect(run(null as unknown as typeof context)).rejects.toThrow('provide chat context')
  expect(fetch).toHaveBeenCalledOnce()
})
it('rejects another selection or mutation envelope instead of rendering it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return ndjsonResponse(({ request_id:request.request_id,conversation_id:request.conversation_id,
      mode:'gemini-read-only',outcome:{status:'completed',explanation:'Wrong selection',
        context:{project_id:'other',case_id:'case',selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}}}))
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hello', context)) {} })()).rejects.toThrow('context mismatch')
})

it('calls VITE_LANGGRAPH_API_URL directly and accepts only Gemini mode', async () => {
  vi.stubEnv('VITE_LANGGRAPH_API_URL', 'http://127.0.0.1:8000/')
  vi.resetModules()
  const { streamingChatClient: configured, CHAT_ENDPOINT, CHAT_STREAM_ENDPOINT } = await import('../src/api/chat')
  const fetch = vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return ndjsonResponse(({ request_id: request.request_id, conversation_id: request.conversation_id,
      mode: 'gemini-read-only', outcome: { status: 'completed', explanation: 'Grid is 2 × 3 × 4.',
        context: { project_id: 'project', case_id: 'case', selected_object_id: 'source', revision_id: null },
        observation: { scope: 'application-read' } } }))
  })
  vi.stubGlobal('fetch', fetch)
  const events = []
  for await (const event of configured.streamResponse('session', [], 'grid?', context)) events.push(event)
  expect(CHAT_ENDPOINT).toBe('http://127.0.0.1:8000/api/ai/chat')
  expect(CHAT_STREAM_ENDPOINT).toBe('http://127.0.0.1:8000/api/ai/chat/stream')
  expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/ai/chat/stream')
  expect(events[0]).toMatchObject({ event: 'metadata', data: { mode: 'gemini-read-only' } })
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('rejects legacy fake-read-only mode envelopes', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return ndjsonResponse(({ request_id: request.request_id, conversation_id: request.conversation_id,
      mode: 'fake-read-only', outcome: { status: 'completed', explanation: 'old fake',
        context: { ...context, selected_object_id: 'source', revision_id: null },
        observation: { scope: 'application-read' } } }))
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hi', context)) {} })())
    .rejects.toThrow('Invalid AI chat response')
})

it('yields thinking events in order before the validated answer', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id,
      mode: 'gemini-read-only', outcome: { status: 'completed', explanation: 'Answer.',
        context: { ...context, selected_object_id: 'source', revision_id: null }, observation: { scope: 'application-read' } } },
    [{ id: 'reasoning-1', kind: 'reasoning', text: 'Need the evidence summary.' },
     { id: 'step-1', kind: 'step', text: 'Searching the clinical knowledge base…' },
     { id: 'step-1', kind: 'step', text: 'Searching the clinical knowledge base: found PMMA' }])
  }))
  const events = []
  for await (const event of langGraphClient.streamResponse('session', [], 'PMMA?', context)) events.push(event)
  expect(events.map(event => event.event)).toEqual(['metadata', 'thinking', 'thinking', 'thinking', 'messages', 'end'])
  expect(events[1].data).toEqual({ id: 'reasoning-1', kind: 'reasoning', text: 'Need the evidence summary.' })
})

it('rejects a stream that ends without a result line', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return new Response(JSON.stringify({ type: 'metadata', mode: 'gemini-read-only', request_id: request.request_id,
      conversation_id: request.conversation_id }) + '\n')
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hi', context)) {} })())
    .rejects.toThrow('without a result')
})

it('yields only proposals for the exact selection and rejects malformed ones', async () => {
  const candidate = { project_id: 'project', case_id: 'case', object_id: 'cand', expected_revision_id: 'rev-1' }
  const base = { proposal_id: 'p', kind: 'rigid_pose', status: 'pending', summary: 's', project_id: 'project',
    case_id: 'case', candidate_id: 'cand', base_revision_id: 'rev-1' }
  const run = async (staged: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'gemini-read-only',
        outcome: { status: 'completed', explanation: 'ok',
          context: { project_id: 'project', case_id: 'case', selected_object_id: 'cand', revision_id: 'rev-1' },
          observation: { scope: 'application-read' } }, staged_proposal: staged })
    }))
    const events = []
    for await (const event of langGraphClient.streamResponse('s', [], 'hi', candidate)) events.push(event)
    return events.filter(event => event.event === 'proposal')
  }
  expect(await run(base)).toHaveLength(1)
  expect(await run({ ...base, base_revision_id: 'rev-0' })).toHaveLength(0)
  expect(await run(null)).toHaveLength(0)
  await expect(run({ ...base, kind: 'delete_everything' })).rejects.toThrow('Invalid AI chat response')
  // model_fix: generate is bound to the skull (no candidate yet); adjustments are bound to the selected revision.
  const fix = { ...base, kind: 'model_fix', sample_id: 'sample', payload: { action: 'generate' }, candidate_id: null, base_revision_id: null }
  expect(await run(fix)).toHaveLength(1)
  expect(await run({ ...fix, case_id: 'other-case' })).toHaveLength(0)
  expect(await run({ ...fix, payload: { action: 'threshold', threshold: 0.4 }, candidate_id: 'cand', base_revision_id: 'rev-1' })).toHaveLength(1)
  expect(await run({ ...fix, payload: { action: 'threshold', threshold: 0.4 }, candidate_id: 'cand', base_revision_id: 'rev-0' })).toHaveLength(0)
  await expect(run({ ...fix, payload: { action: 'explode' } })).rejects.toThrow('Invalid AI chat response')
})

it('yields a viewport overlay only for the measured selection and drops malformed ones', async () => {
  const base = { overlay_id: 'o', kind: 'rim_thickness', title: 'Rim thickness', unit: 'mm', threshold_mm: 2,
    legend: [{ severity: 'critical', label: '< 2.0 mm' }], frame: 'voxel-ijk', sizes: [10, 10, 10], spacing_mm: [1, 1, 1],
    object_id: 'source', revision_id: null, focus_ijk: [1, 2, 3], points: [{ ijk: [1, 2, 3], value_mm: 1.2, severity: 'critical' }] }
  const run = async (overlay: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'bedrock-read-only',
        outcome: { status: 'completed', explanation: 'ok', context: { ...context, selected_object_id: 'source', revision_id: null },
          observation: { scope: 'application-read' } }, viewport_overlay: overlay })
    }))
    const events = []
    for await (const event of langGraphClient.streamResponse('s', [], 'rim?', context)) events.push(event)
    return events.filter(event => event.event === 'overlay')
  }
  expect(await run(base)).toHaveLength(1)
  expect(await run({ ...base, object_id: 'other' })).toHaveLength(0)
  expect(await run({ ...base, revision_id: 'rev-9' })).toHaveLength(0)
  expect(await run({ ...base, points: [{ ijk: [1, 2], value_mm: 1, severity: 'critical' }] })).toHaveLength(0)
  expect(await run({ ...base, points: [{ ijk: [1, 2, 3], value_mm: 1, severity: 'purple' }] })).toHaveLength(0)
  expect(await run(null)).toHaveLength(0)
})
