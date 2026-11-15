import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ isPreview }) => {
  // FastAPI is the only application backend; preview remains frontend-only.
  const apiOrigin = !isPreview ? (process.env.HACK_API_ORIGIN ?? 'http://127.0.0.1:8000') : undefined
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
        '@data': new URL('../data', import.meta.url).pathname,
      },
    },
    server: {
      proxy: apiOrigin ? { '/api': { target: apiOrigin, changeOrigin: true } } : undefined,
      fs: {
        allow: ['..'],
      },
    },
    preview: { proxy: {} },
    test: {
      environment: 'node',
      globalSetup: ['./tests/vitest.globalSetup.ts'],
      setupFiles: ['./tests/vitest.setup.ts'],
      // Prefer happy-dom for React UI/hooks: jsdom+undici fails to boot in this Node toolchain.
      environmentMatchGlobs: [
        ['tests/ui/**/*.{test,spec}.{ts,tsx}', 'happy-dom'],
        ['tests/useReadOnlyChat.test.ts', 'happy-dom'],
      ],
      include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    },
  }
})
