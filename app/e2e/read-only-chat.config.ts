import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = process.env.HACK_CHAT_TEST_ROOT
if (!root || !root.startsWith('/private/tmp/hp-chat-e2e-')) throw new Error('Provide a disposable HACK_CHAT_TEST_ROOT under /private/tmp/hp-chat-e2e-')
const built = process.env.HACK_CHAT_BUILT === '1'
const python = process.env.SKULLFIX_PYTHON ?? path.resolve(app, '../.venv/bin/python')
export default defineConfig({
  testDir: '.', testMatch: 'read-only-chat.spec.ts', workers: 1, retries: 0, timeout: 90000,
  outputDir: path.join(root, 'browser-results'), reporter: 'line',
  use: { ...devices['Desktop Chrome'], baseURL: built ? 'http://127.0.0.1:18583' : 'http://127.0.0.1:18573', screenshot: 'only-on-failure', channel: process.env.HACK_CHAT_BROWSER_CHANNEL },
  webServer: [
    { command: `"${python}" -B -m skullfix_ai.api --storage-root "${root}/storage" --host 127.0.0.1 --port 18583${built ? ` --frontend-dir "${app}/dist"` : ''}`,
      cwd: path.resolve(app, '..'), env: { PYTHONPATH: path.resolve(app, '../backend/ai/src') },
      url: 'http://127.0.0.1:18583/healthz', reuseExistingServer: false },
    ...(!built ? [{ command: 'npm run dev -- --host 127.0.0.1 --port 18573 --strictPort', cwd: app,
      env: { HACK_STORAGE_ROOT: path.join(root, 'storage'), HACK_AI_ORIGIN: 'http://127.0.0.1:18583' },
      url: 'http://127.0.0.1:18573', reuseExistingServer: false }] : []),
  ],
})
