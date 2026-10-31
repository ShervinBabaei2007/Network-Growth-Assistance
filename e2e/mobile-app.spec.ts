import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

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
  await expect(page.getByTestId("bottom-tabs")).toBeVisible();
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

test("swiping a queue card left reveals Skip and Mark sent, and the swipe itself changes nothing", async ({ page }) => {
  const email = uniqueEmail("swipe");
  await signIn(page, email, "/overview", { welcome: true });
  const wizard = page.getByTestId("onboarding-wizard");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  // The queue needs a daily target; the example data does not set one.
  await adminRest("PATCH", `settings?user_id=eq.${await userIdFor(email)}`, { daily_invite_target: 10 });
  await page.goto("/queue");
  await page.getByRole("heading", { name: "Daily Queue" }).waitFor();
  await page.waitForLoadState("networkidle");
  if ((await page.getByTestId("swipe-row").count()) === 0) await page.getByRole("button", { name: "Build today's queue" }).click();
  const row = page.getByTestId("swipe-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // getByRole skips aria-hidden elements, which is exactly the closed state being checked, so select by attribute.
  const tray = row.locator('[role="group"][aria-label^="Quick actions"]');
  // Closed: the tray is hidden from assistive tech and cannot be focused, so nothing is announced twice.
  await expect(tray).toHaveAttribute("aria-hidden", "true");

  // A real touch drag from the right of the card towards the left.
  const box = (await row.boundingBox())!;
  const y = box.y + 24;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", box.x + box.width - 20);
  for (let i = 1; i <= 8; i++) await touch("touchMove", box.x + box.width - 20 - i * 24);
  await touch("touchEnd", 0);

  await expect(tray).toHaveAttribute("aria-hidden", "false");
  await expect(tray.getByRole("button", { name: "Skip today" })).toBeVisible();
  await expect(tray.getByRole("button", { name: "Mark sent" })).toBeVisible();
  // Nothing was recorded by the swipe: the card is still there.
  await expect(row.getByRole("link", { name: /open on linkedin/i })).toBeVisible();

  // The tray's button does what the card's own button does.
  // (The card's form unmounts when the list refreshes, so there is no toast to wait for; the list shrinking is the proof.)
  const before = await page.getByTestId("swipe-row").count();
  await tray.getByRole("button", { name: "Skip today" }).click();
  await expect(page.getByTestId("swipe-row")).toHaveCount(before - 1);
});
