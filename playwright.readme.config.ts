import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Regenerates the pictures in docs/images for the README: `npm run docs:screenshots`.
 * It signs in to the local app (fictional data only), so run `npm run db:start` first.
 */
export default defineConfig({
  ...base,
  testMatch: /readme-screenshots.*\.spec\.ts/,
  timeout: 300_000,
  projects: [{ name: "readme", use: { ...devices["Desktop Chrome"], actionTimeout: 20_000, viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1.5 } }],
});
