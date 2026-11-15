import { afterEach, expect, it, vi } from 'vitest'
import { langGraphClient } from '../src/ai/langGraphClient'

const context = { project_id: 'project', case_id: 'case', object_id: 'source', expected_revision_id: null }
afterEach(() => vi.unstubAllGlobals())
it('posts bounded history and authoritative identity to FastAPI instead of returning canned greetings', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body)
    return new Response(JSON.stringify({ request_id: body.request_id, conversation_id: body.conversation_id,
      mode: 'fake-read-only', outcome: { status: 'completed', explanation: 'Read-only reconstruction brief.',
        context: { ...context, selected_object_id: 'source', revision_id: null },
        observation: { scope: 'application-read' } } }))
  })
  vi.stubGlobal('fetch', fetch)
  const events = []
  for await (const event of langGraphClient.streamResponse('conversation', [{role:'human',content:'Inspect skull'}], 'Draft reconstruction brief', context)) events.push(event)
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][0]).toBe('/api/ai/chat')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ ...context, conversation_id:'conversation', message:'Draft reconstruction brief',history:[{role:'human',content:'Inspect skull'}] })
  expect(events.find(e => e.event === 'messages')?.data).toEqual([expect.objectContaining({ content:'Read-only reconstruction brief.' })])
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
    return new Response(JSON.stringify({ request_id:request.request_id,conversation_id:request.conversation_id,
      mode:'fake-read-only',outcome:{status:'completed',explanation:'Wrong selection',
        context:{project_id:'other',case_id:'case',selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}}}))
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hello', context)) {} })()).rejects.toThrow('context mismatch')
})
