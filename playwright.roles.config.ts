import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/real',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5273', trace: 'retain-on-failure', serviceWorkers: 'block', reducedMotion: 'reduce' },
  projects: [{ name: 'real-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev', url: 'http://localhost:5273', reuseExistingServer: false,
    env: { VITE_API_MODE: 'real', VITE_API_BASE: 'http://localhost:3001' },
  },
})
