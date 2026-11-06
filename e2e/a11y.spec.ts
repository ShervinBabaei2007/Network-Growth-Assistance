import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/**
 * Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A and AA rules) of the public pages and the main
 * signed-in pages, filled with example data, in light and dark, on desktop and on a 390 px phone.
 * Serious and critical findings fail the run. This does not replace the manual screen-reader pass in
 * docs/ACCESSIBILITY.md; it catches the mistakes a tool can see.
 */

const PUBLIC = ["/", "/login", "/login?mode=signup", "/guides", "/guides/export-linkedin-connections", "/privacy", "/terms"];
const APP = [
  "/overview", "/analytics", "/candidates", "/candidates/import", "/queue", "/follow-ups", "/connections", "/people", "/discover",
  "/universities", "/disciplines", "/applications", "/jobs", "/jobs/resume", "/jobs/employers", "/jobs/searches", "/jobs/hidden",
  "/notifications", "/settings", "/help",
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, path: string, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n   ")}`);
  expect(summary, `${path} (${scheme})`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`public pages have no serious accessibility violations (${scheme})`, async ({ page }) => {
    for (const path of PUBLIC) await scan(page, path, scheme);
  });
}

test("signed-in pages, with example data, have no serious accessibility violations", async ({ page }, info) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("axe");
  await signIn(page, email, "/overview", { welcome: true });
  const wizard = page.getByTestId("onboarding-wizard");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  // The tour opens on first arrival; it is scanned by its own test, so leave it for the pages here.
  await page.getByRole("button", { name: /skip/i }).first().click({ timeout: 3000 }).catch(() => {});
  for (const scheme of ["light", "dark"] as const) {
    for (const path of APP) await scan(page, path, scheme);
  }
  expect(info.project.name).toBeTruthy();
});

test("the phone layout (390 px) has no serious violations", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PUBLIC) await scan(page, path, "light");
});

test("keyboard: the skip link moves focus to the main content", async ({ page }) => {
  await signIn(page, uniqueEmail("skip"));
  // On a cold development server the first page can still be hydrating; a key pressed before then is lost.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("reflow: pages fit a 320 px wide window (about 400% zoom) without sideways scrolling", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/", "/login", "/guides"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await signIn(page, uniqueEmail("reflow"));
  for (const path of ["/overview", "/applications", "/candidates", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});

test("zoom: pages fit a 200% zoom window (640 px wide) without sideways scrolling or serious violations", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 640, height: 360 });
  for (const path of ["/", "/login", "/guides"]) {
    await scan(page, path, "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await signIn(page, uniqueEmail("zoom"));
  for (const path of ["/overview", "/applications", "/candidates", "/settings"]) {
    await scan(page, path, "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    await expect(page.locator("#main")).toBeVisible();
  }
});

// WCAG 1.4.12: content must survive these user overrides without losing text or function.
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

test("text spacing: the WCAG 1.4.12 overrides clip no text on buttons, tabs or headings", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("spacing"));
  for (const path of ["/overview", "/applications", "/candidates", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const style = await page.addStyleTag({ content: TEXT_SPACING });
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, [role=tab], a, h1, h2, h3")]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width <= 2 || box.height <= 2) return false; // visually hidden (skip link, sr-only)
          const overflow = getComputedStyle(el).overflow;
          return overflow !== "visible" && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && !getComputedStyle(el).textOverflow.includes("ellipsis");
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`),
    );
    expect(clipped, path).toEqual([]);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
    expect(blocking, path).toEqual([]);
    await style.evaluate((el) => (el as Element).remove());
  }
});

test("reduced motion: animations and transitions are effectively off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, uniqueEmail("motion"));
  await page.waitForLoadState("networkidle");
  const longest = await page.evaluate(() => {
    const ms = (v: string) => Math.max(0, ...v.split(",").map((s) => (s.trim().endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000) || 0));
    let worst = 0;
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const s = getComputedStyle(el);
      worst = Math.max(worst, ms(s.animationDuration), ms(s.transitionDuration));
    }
    return worst;
  });
  expect(longest).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).not.toBe("smooth");
});
