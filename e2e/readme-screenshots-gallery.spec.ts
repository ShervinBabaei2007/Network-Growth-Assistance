import { expect, test, type Page } from "@playwright/test";
import { setUpPlan, signIn } from "./helpers";
import { dropFixtureNotes, freshAccount, prepareJobs, seedNetwork, shot, tidy, toTop } from "./readme-kit";

/**
 * The README gallery: four pictures on a wide screen and four on a phone, chosen to show different parts of the app
 * (progress, fit explained, a list with a record beside it and a bulk action open, the board in the dark, French,
 * and Discover's evidence). Same rules as the other readme-screenshots specs: `npm run docs:screenshots`, fictional
 * data only, not a test of behaviour.
 */

const WIDE = { width: 1440, height: 900 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const settle = (page: Page, ms = 900) => page.waitForTimeout(ms);

test.describe.configure({ mode: "serial" });

test("gallery: progress, jobs, a list with its record, the board", async ({ page, browser, context }) => {
  test.setTimeout(300_000);
  const email = await freshAccount("sam.rivera");
  await tidy(context);
  await signIn(page, email);
  await seedNetwork(page, email);
  const hasJobs = await prepareJobs(page);
  test.skip(!hasJobs, "Run the dev server with JOBS_FIXTURES=1");
  await page.setViewportSize(WIDE);

  // Wide 1. Progress: the goal ring, the pipeline and the activity.
  await page.goto("/overview");
  await expect(page.getByText("Network total").first()).toBeVisible();
  await settle(page, 1800);
  await toTop(page.getByText("Network total").first(), 80);
  await settle(page, 600);
  await shot(page, "gallery-overview");

  // Wide 2. Jobs: each posting with its fit explained.
  await page.goto("/jobs?q=Developer&range=any");
  await expect(page.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await settle(page, 2500);
  await dropFixtureNotes(page);
  // A taller window for this one, so the search, the filters and every posting fit from the top of the page.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 900);
  await shot(page, "gallery-jobs");
  await page.setViewportSize(WIDE);

  // Wide 3. A list with its record beside it, and a bulk action ready: three people ticked.
  await page.goto("/candidates");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Maya Chen", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected record" }).getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  for (const name of ["Daniel Okafor", "Priya Nair", "Hannah Weiss"]) await page.getByRole("row").filter({ hasText: name }).getByRole("checkbox").check();
  await expect(page.getByTestId("bulk-bar")).toContainText("3 selected");
  await toTop(page.getByText(/^\d+ candidates?$/).first(), 84);
  await settle(page, 1200);
  await shot(page, "gallery-list");

  // Wide 4. The board, in the dark theme.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/applications");
  await expect(page.getByText("Northwind Labs").first()).toBeVisible();
  await settle(page, 1000);
  await shot(page, "gallery-board-dark");
  await page.emulateMedia({ colorScheme: "light" });

  // Phone: the same account on a small screen.
  const state = await page.context().storageState();
  const phone = await browser.newContext({ storageState: state, ...PHONE, baseURL: test.info().project.use.baseURL });
  await tidy(phone);
  const m = await phone.newPage();
  await m.goto("/overview");
  await expect(m.getByText("Network total").first()).toBeVisible();
  await settle(m, 1800);
  await toTop(m.getByText("Network total").first(), 76);
  await settle(m, 600);
  await shot(m, "gallery-mobile-overview", "phone");

  await m.goto("/jobs?q=Developer&range=any");
  await expect(m.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await settle(m, 1500);
  await dropFixtureNotes(m);
  await toTop(m.getByRole("heading", { name: /jobs from/i }), 76);
  await settle(m, 800);
  await shot(m, "gallery-mobile-jobs", "phone");
  await phone.close();

  // Phone, in French and in the dark: the board.
  const frDark = await browser.newContext({ storageState: state, ...PHONE, colorScheme: "dark", baseURL: test.info().project.use.baseURL });
  await frDark.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await tidy(frDark);
  const f = await frDark.newPage();
  await f.goto("/applications");
  await expect(f.getByRole("heading", { name: "Candidatures" })).toBeVisible();
  await settle(f, 1500);
  await shot(f, "gallery-mobile-board-fr-dark", "phone");
  await frDark.close();
});

test("gallery: Discover on a phone", async ({ page, browser, context }) => {
  test.setTimeout(180_000);
  await tidy(context);
  await signIn(page, await freshAccount("jordan.reyes"), "/discover");
  test.skip(!(await page.getByTestId("discovery-sources").textContent())?.includes("Fixture web"), "Run the dev server with DISCOVERY_FIXTURES=1");
  await setUpPlan(page, {
    schools: [{ name: "University of Toronto", aliases: "UofT, U of T" }],
    disciplines: [{ name: "Computer Engineering", aliases: "CompEng, comp eng" }],
  });
  await page.goto("/discover");
  await page.getByLabel("Who would you like to meet?").fill("Find 5 UofT Computer Engineering alumni working as software engineers in Canada");
  await page.getByRole("button", { name: "Find people" }).click();
  await page.waitForURL(/\/discover\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Research complete" })).toBeVisible({ timeout: 60_000 });
  const url = page.url();

  const phone = await browser.newContext({ storageState: await page.context().storageState(), ...PHONE, baseURL: test.info().project.use.baseURL });
  await tidy(phone);
  const m = await phone.newPage();
  await m.goto(url);
  await expect(m.getByRole("article", { name: "Alex Chen" })).toBeVisible({ timeout: 30_000 });
  await dropFixtureNotes(m);
  await toTop(m.getByRole("article", { name: "Alex Chen" }), 76);
  await settle(m, 1200);
  await shot(m, "gallery-mobile-discover", "phone");
  await phone.close();
});
