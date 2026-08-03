import { defineConfig, devices } from '@playwright/test';

/**
 * Two-tier E2E config — see e2e/README.md for the full architecture.
 *
 * `chromium` (mocked tier, `npm run e2e`): journeys run against the real Angular
 * app started by `webServer` (ng serve) with the backend stubbed at the network
 * layer — see e2e/support/api-mock.ts. No live API or database is required.
 *
 * `real` (real-stack tier, `npm run e2e:real`): journeys run against the REAL
 * docker stack (nginx UI on :4200, ASP.NET Core API on :8080, SQL Server), no
 * request mocking. Bring the stack up FIRST:
 *   docker compose -f rental-api/docker-compose.yml up --build -d
 * Every real spec starts with the stack guard in e2e/support/real-stack.ts,
 * which hard-fails when :4200 is not the docker nginx bundle (M-011: a stale
 * `ng serve` or docker image is indistinguishable from fresh by eye).
 *
 * `globalSetup` runs the inverse check once, automatically, for every mocked
 * (`chromium`) run: `webServer` below reuses whatever already answers on
 * :4200 (reuseExistingServer), including a stale docker `ui` container — see
 * e2e/support/global-setup.ts for why this can't live inside `webServer`
 * itself and isn't a per-spec-file call the way the real tier's guard is.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    // The dev server uses a self-signed cert for the API host; ignore TLS in tests.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /real\//,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real',
      testMatch: /real\/.*\.spec\.ts/,
      // Flaky policy: no retries locally or on CI for the real tier — a re-run
      // must never hide the original failure; flakiness gets investigated, not
      // retried away. Failure artifacts only (trace + screenshot), never on pass.
      retries: 0,
      // Real journeys span multiple contexts and full lifecycle transitions.
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
