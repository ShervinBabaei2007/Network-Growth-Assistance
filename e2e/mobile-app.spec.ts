import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/** The app-like phone experience: a bottom tab bar beside the hamburger, and an installable manifest. */

test("the bottom tab bar shows the main places, marks the current one, and More opens the full menu", async ({ page }) => {
  await signIn(page, uniqueEmail("tabs"), "/overview");
  const tabs = page.getByTestId("bottom-tabs");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

  await tabs.getByRole("link", { name: "Applications" }).click();
  await expect(page).toHaveURL(/\/applications/);
  await expect(page.getByTestId("bottom-tabs").getByRole("link", { name: "Applications" })).toHaveAttribute("aria-current", "page");

  // The header's menu button is still there, and More opens the same menu.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.getByTestId("bottom-tabs").getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Settings" })).toBeVisible();
});

test("the tab bar never covers the end of a page", async ({ page }) => {
  await signIn(page, uniqueEmail("tabs-pad"), "/settings");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = await page.getByTestId("bottom-tabs").boundingBox();
  const last = await page.locator("main > div").boundingBox();
  expect(bar).not.toBeNull();
  expect(last).not.toBeNull();
  expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y + 1);
});

test("the install manifest, service worker and icons are public", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json.display).toBe("standalone");
  expect(json.start_url).toBe("/overview");
  expect(json.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const code = await sw.text();
  // Only the two remembered pages, kept privately and for a limited time.
  expect(code).toContain('url.pathname === "/queue"');
  expect(code).toContain("PRIVATE_TTL_MS");

  const icon = await request.get("/pwa-icon?size=192");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/png");
});
