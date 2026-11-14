import express from 'express'
import type { Plugin } from 'vite'
import { createApiRouter } from './server/api'

export function apiPlugin(): Plugin {
  return {
    name: 'hack-princeton-api',
    configureServer(server) {
      const app = express()
      app.use(express.json({ limit: '10mb' }))
      app.use('/api', createApiRouter())
      server.middlewares.use(app)
    },
  }
}

