import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  workers: 1,
  timeout: 330_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'performance-report/html', open: 'never' }]],
  outputDir: 'performance-report/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [{ name: 'chromium-profile', use: { ...devices['Desktop Chrome'], viewport: { width: 1365, height: 900 } } }],
  webServer: {
    command: 'vite preview --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
