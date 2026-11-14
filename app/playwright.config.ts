import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.e2e.ts', '**/*.spec.ts'],
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.HACK_BROWSER_OUTPUT ?? '/private/tmp/hp-browser-results',
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.HACK_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
