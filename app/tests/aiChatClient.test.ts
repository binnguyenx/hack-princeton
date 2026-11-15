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

it('accepts Gemini only with the explicit read-only policy and reports actual provider identity', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return new Response(JSON.stringify({ request_id:request.request_id, conversation_id:request.conversation_id,
      mode:'llm-read-only', capability_policy:'metadata-read-only',model:{provider:'gemini',id:'gemini-test'},
      outcome:{status:'completed',explanation:'Which aspect of the skull would you like to inspect?',
        context:{...context,selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}} }))
  }))
  const events = []
  for await (const event of langGraphClient.streamResponse('session', [], 'continue', context)) events.push(event)
  expect(events[0]).toMatchObject({event:'metadata',data:{provider:'gemini',model_id:'gemini-test'}})
})


it.each(['missing-policy','mutation-policy','wrong-provider'])('rejects unapproved LLM envelope: %s', async kind => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return new Response(JSON.stringify({request_id:request.request_id,conversation_id:request.conversation_id,
      mode:'llm-read-only',capability_policy:kind === 'missing-policy' ? undefined : kind === 'mutation-policy' ? 'write' : 'metadata-read-only',
      model:{provider:kind === 'wrong-provider' ? 'unknown' : 'gemini',id:'gemini-test'},
      outcome:{status:'completed',explanation:'Untrusted',context:{...context,selected_object_id:'source',revision_id:null},
        observation:{scope:'application-read'}}}))
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hello', context)) {} })()).rejects.toThrow('provider policy')
})

it('surfaces backend model configuration errors instead of misdiagnosing storage', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({code:'model-config-invalid',
    error:'Gemini requires backend environment configuration.'}),{status:503})))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hello', context)) {} })())
    .rejects.toThrow('model-config-invalid')
})

it('retains provider error codes when explanation generation fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return new Response(JSON.stringify({request_id:request.request_id,conversation_id:request.conversation_id,
      mode:'llm-read-only',capability_policy:'metadata-read-only',model:{provider:'gemini',id:'gemini-test'},
      outcome:{status:'unavailable',code:'model-rate-limited',explanation:'Gemini request failed.'}}))
  }))
  await expect((async () => { for await (const _ of langGraphClient.streamResponse('session', [], 'hello', context)) {} })())
    .rejects.toThrow('model-rate-limited')
})
