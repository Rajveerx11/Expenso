import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  outputDir: '../../artifacts/playwright-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../artifacts/playwright-report', open: 'never' }],
    ['json', { outputFile: '../../artifacts/playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'on',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium-full',
      testMatch: /full-flow\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-smoke',
      testMatch: /firefox-smoke\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'chromium-a11y',
      testMatch: /responsive-a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-smoke',
      testMatch: /responsive-a11y\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
