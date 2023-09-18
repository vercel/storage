import path from 'node:path';
import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT || 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ?? `http://localhost:${PORT}`;

const webServer = {
  command: 'pnpm dev',
  url: baseURL,
  timeout: 120 * 1000,
  reuseExistingServer: !process.env.CI,
};

// Reference: https://playwright.dev/docs/test-configuration
const config: PlaywrightTestConfig = {
  // Timeout per test
  timeout: 10 * 1000,
  // Test directory
  testDir: path.join(__dirname, 'test'),
  testMatch: process.env.PLAYWRIGHT_TEST_MATCH,
  // If a test fails, retry it additional 2 times
  retries: 2,
  // Artifacts folder where screenshots, videos, and traces are stored.
  outputDir: 'test-results/',

  // Run your local dev server before starting the tests:
  // https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL ? undefined : webServer,

  use: {
    // Use baseURL so to make navigations relative.
    // More information: https://playwright.dev/docs/api/class-testoptions#test-options-base-url
    baseURL,

    // Retry a test if its failing with enabled tracing. This allows you to analyse the DOM, console logs, network traffic etc.
    // More information: https://playwright.dev/docs/trace-viewer
    trace: 'retry-with-trace',
  },

  projects: process.env.PLAYWRIGHT_PROJECT
    ? [
        {
          name: process.env.PLAYWRIGHT_PROJECT,
          use: {
            ...devices[process.env.PLAYWRIGHT_PROJECT],
          },
        },
      ]
    : [
        {
          name: 'Desktop Chrome',
          use: {
            ...devices['Desktop Chrome'],
          },
        },
        {
          name: 'Desktop Firefox',
          use: {
            ...devices['Desktop Firefox'],
          },
        },
        {
          name: 'Desktop Safari',
          use: {
            ...devices['Desktop Safari'],
          },
        },
      ],
};

// eslint-disable-next-line import/no-default-export -- [@vercel/style-guide@5 migration]
export default config;
