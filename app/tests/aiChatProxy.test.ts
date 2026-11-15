import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'
import { aiChatPlugin } from '../vite-ai-chat-plugin'

afterEach(() => vi.unstubAllEnvs())
it('forwards only the exact AI route and surfaces backend outage without replacing SQLite CRUD', async () => {
  vi.stubEnv('HACK_AI_ORIGIN','http://127.0.0.1:1')
  let handler!: (request: IncomingMessage,response: ServerResponse,next: () => void) => void
  const plugin = aiChatPlugin()
  const configure = plugin.configureServer as (server: ViteDevServer) => void
  configure({middlewares:{use(fn: typeof handler) { handler = fn }}} as unknown as ViteDevServer)
  const server = createServer((request,response) => handler(request,response,() => {response.end('sqlite-crud-next')}))
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server failed to start')
    const base = `http://127.0.0.1:${address.port}`
    for (const path of ['/api/projects','/api/ai/chat-extra']) {
      const response = await fetch(base+path)
      expect(await response.text()).toBe('sqlite-crud-next')
    }
    const failed = await fetch(base+'/api/ai/chat',{method:'POST',body:'{}',headers:{'content-type':'application/json'}})
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({error:'Read-only AI backend unavailable',code:'ai-backend-unavailable'})
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
