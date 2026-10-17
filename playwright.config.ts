import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the dev server and the local Supabase stack
 * (`npm run db:start` first). Sign-in emails are read from local Mailpit.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker: parallel files overload the single dev server and cause timeouts in unrelated tests.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile.spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(mobile|sticky-nav|onboarding)\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    // Discover and Jobs use built-in fictional datasets in tests: no network calls, no API keys.
    // Alert emails go to local Mailpit's SMTP port; the token secret is for tests only.
    env: {
      DISCOVERY_FIXTURES: "1",
      JOBS_FIXTURES: "1",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "54325",
      SMTP_FROM: "Network Growth <alerts@example.test>",
      APP_URL: "http://localhost:3000",
      EMAIL_TOKEN_SECRET: "e2e-only-not-a-real-secret-0123456789abcdef",
      // AI is unlimited by default; the jobs test checks what happens when an operator sets a quota.
      AI_DAILY_QUOTA: "3",
    },
    timeout: 120_000,
  },
});
