import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Records the raw footage for the README tour: `npm run docs:video` (scripts/docs/make-video.mjs runs this, then edits it).
 * It signs in to the local app (fictional data only), so run `npm run db:start` first.
 */
export default defineConfig({
  ...base,
  testMatch: /readme-video\.spec\.ts/,
  timeout: 480_000,
  projects: [{ name: "video", use: { ...devices["Desktop Chrome"], actionTimeout: 25_000, viewport: { width: 1280, height: 720 } } }],
});
