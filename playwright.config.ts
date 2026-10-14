import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DEV_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.012, animations: 'disabled' } },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /strict-mode/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    // Landscape phone with touch input.
    { name: 'mobile', testIgnore: /strict-mode/, use: { ...devices['Pixel 7 landscape'] } },
    // Same game under the dev server, where React.StrictMode double-invokes effects.
    {
      name: 'strict-mode',
      testMatch: /strict-mode/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  // Tests run against the optimised production build, exactly what gets deployed.
  webServer: [
    {
      command: 'npm run build && npm run preview -- --strictPort',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
