import { expect, test } from "@playwright/test";
import { setUpPlan, signIn } from "./helpers";
import { dropFixtureNotes, freshAccount, pasteIntoQuickCapture, prepareJobs, seedNetwork, shot, tidy, toTop } from "./readme-kit";

/**
 * Takes the pictures used in README.md, from the real app with fictional data:
 * `npm run docs:screenshots` (needs `npm run db:start`). Not part of the normal e2e run.
 * Raw captures go to test-results/readme-shots; scripts/docs/frame-screenshots.mjs then puts each in a window frame
 * and writes docs/images. Nothing here is a test of behaviour; the other specs cover that.
 */

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

test.describe.configure({ mode: "serial" });

test("overview, analytics, candidates, applications and a phone", async ({ page, browser }) => {
  const email = await freshAccount("alex.morgan");
  await tidy(page.context());
  await signIn(page, email);
  await seedNetwork(page, email);

  // The dashboard, from the top.
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /overview|progress/i }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "overview");
  // Each discipline against its own target; pending invitations are shown apart and never counted.
  await page.locator("[data-tour=breakdown]").evaluate((el) => ((el as HTMLDetailsElement).open = true));
  // A taller window for this one, so the pipeline, the activity and every discipline fit in one picture.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await toTop(page.getByText("Network total").first(), 120);
  await page.waitForTimeout(800);
  await shot(page, "overview-disciplines");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Analytics (the charts load as they scroll into view).
  await page.goto("/analytics");
  await expect(() => page.getByRole("img", { name: "Recorded network total by date" }).scrollIntoViewIfNeeded()).toPass();
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await shot(page, "analytics");

  // Candidates, with Quick capture holding a pasted LinkedIn results page.
  await page.goto("/candidates");
  await pasteIntoQuickCapture(page);
  await page.waitForTimeout(1200);
  await toTop(page.getByText("Quick capture from LinkedIn search"), 110);
  await page.waitForTimeout(400);
  await shot(page, "quick-capture");

  // The applications board.
  await page.goto("/applications");
  await expect(page.getByText("Northwind Labs").first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "applications");

  // Dark theme.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/overview");
  await page.waitForTimeout(1500);
  await shot(page, "overview-dark");
  await page.emulateMedia({ colorScheme: "light" });

  // A phone: the same account on a small screen.
  const phone = await browser.newContext({ storageState: await page.context().storageState(), ...PHONE, baseURL: test.info().project.use.baseURL });
  await tidy(phone);
  const m = await phone.newPage();
  await m.goto("/overview");
  await m.waitForTimeout(1500);
  await shot(m, "mobile-overview", "phone");
  await m.goto("/candidates");
  await m.waitForTimeout(1000);
  await toTop(m.getByText(/^\d+ candidates?$/).first(), 76);
  await m.waitForTimeout(600);
  await shot(m, "mobile-candidates", "phone");
  await m.getByRole("button", { name: "Open menu" }).click();
  await expect(m.getByRole("dialog", { name: "Network Growth" })).toBeVisible();
  await m.waitForTimeout(600);
  await shot(m, "mobile-menu", "phone");
  await phone.close();
});

test("discover: people with quoted evidence", async ({ page, context }) => {
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
  await expect(page.getByRole("article", { name: "Alex Chen" })).toBeVisible();
  await dropFixtureNotes(page);
  await toTop(page.getByRole("heading", { name: /verified match/ }), 110);
  await page.waitForTimeout(1200);
  await shot(page, "discover");
  await page.getByRole("article", { name: "Alex Chen" }).getByRole("button", { name: "View evidence" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "discover-evidence");
});

test("jobs: verified postings with fit explained", async ({ page, browser }) => {
  await tidy(page.context());
  await signIn(page, await freshAccount("riley.park"), "/jobs");
  test.skip(!(await prepareJobs(page)), "Run the dev server with JOBS_FIXTURES=1");
  await page.goto("/jobs?q=Developer&range=any");
  await expect(page.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await page.waitForTimeout(2500);
  await dropFixtureNotes(page);
  await toTop(page.getByRole("heading", { name: /jobs from/i }), 110);
  await page.waitForTimeout(600);
  await shot(page, "jobs");
  const phone = await browser.newContext({ storageState: await page.context().storageState(), ...PHONE, baseURL: test.info().project.use.baseURL });
  await tidy(phone);
  const m = await phone.newPage();
  await m.goto("/jobs?q=Developer&range=any");
  await expect(m.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await dropFixtureNotes(m);
  await toTop(m.getByRole("heading", { name: /jobs from/i }), 76);
  await m.waitForTimeout(800);
  await shot(m, "mobile-jobs", "phone");
  await phone.close();
  await page.goto("/jobs/resume");
  await page.waitForTimeout(1200);
  await shot(page, "resume");
});
