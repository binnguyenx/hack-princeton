import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { apiPlugin } from './vite-api-plugin'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@data': new URL('../data', import.meta.url).pathname,
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
})
