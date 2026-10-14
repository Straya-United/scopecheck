import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    browserName: 'chromium',
    viewport: { width: 1536, height: 1024 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
  },
  webServer: {
    command: 'node server/index.mjs', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: !process.env.CI,
  },
});
