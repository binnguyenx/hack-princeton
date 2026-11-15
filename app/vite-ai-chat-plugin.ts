/** AI-only forwarding. SQLite CRUD remains with the unchanged apiPlugin. */
import http from 'node:http'
import https from 'node:https'
import type { Plugin } from 'vite'

export function aiChatPlugin(): Plugin {
  const origin = new URL(process.env.HACK_AI_ORIGIN ?? 'http://127.0.0.1:8000')
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('HACK_AI_ORIGIN must be HTTP(S)')
  return {
    name: 'read-only-ai-chat',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/api/ai/chat') return next()
        const target = new URL('/api/ai/chat', origin)
        const transport = target.protocol === 'https:' ? https : http
        const upstream = transport.request(target, { method: request.method,
          headers: { ...request.headers, host: target.host } }, result => {
          response.writeHead(result.statusCode ?? 502, result.headers)
          result.on('error', () => response.destroy())
          result.pipe(response)
        })
        upstream.setTimeout(30000, () => upstream.destroy(new Error('AI backend timeout')))
        upstream.on('error', () => {
          if (response.headersSent) return response.destroy()
          response.writeHead(502, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: 'Read-only AI backend unavailable', code: 'ai-backend-unavailable' }))
        })
        request.on('aborted', () => upstream.destroy())
        response.on('close', () => { if (!response.writableEnded) upstream.destroy() })
        request.pipe(upstream)
      })
    },
  }
}
