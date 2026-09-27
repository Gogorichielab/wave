import { defineConfig, devices } from '@playwright/test';

// PW_PRODUCTION=1 serves the built dist/ with `vite preview` so smoke tests
// exercise the artifact that is actually deployed
const production = !!process.env.PW_PRODUCTION;
const baseURL = production ? 'http://localhost:4173' : 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: production ? 'npm run preview -- --port 4173 --strictPort' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
