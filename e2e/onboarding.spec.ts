import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/** What is stored for this account. Progress is saved by server actions, so wait for it before reloading. */
async function stored(email: string): Promise<{ status?: string; step?: number }> {
  const rows = (await adminRest("GET", `settings?user_id=eq.${await userIdFor(email)}&select=onboarding`)) as { onboarding: { status?: string; step?: number } }[];
  return rows[0]?.onboarding ?? {};
}

// A genuinely new user: the welcome is not pre-dismissed here.
const welcome = (page: import("@playwright/test").Page) => page.getByTestId("onboarding-wizard");
// Scoped to the welcome: the Next.js dev-tools button also has "Next" in its name.
const wizardButton = (page: import("@playwright/test").Page, name: string) => welcome(page).getByRole("button", { name, exact: true });

test("first-time user: welcome with progress, Back/Next/Skip, and it stays dismissed", async ({ page }) => {
  const email = uniqueEmail("welcome");
  await signIn(page, email, "/overview", { welcome: true });
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to Network Growth" })).toBeVisible();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 1 of 4");
  await expect(wizardButton(page, "Back")).toBeDisabled();

  await wizardButton(page, "Next").click();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 2 of 4");
  await page.getByLabel("Find a job").check();
  await wizardButton(page, "Back").click();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 1 of 4");

  await wizardButton(page, "Skip").click();
  await expect(welcome(page)).toBeHidden();
  await expect.poll(async () => (await stored(email)).status).toBe("skipped");

  // Skipping is remembered for this account: it does not come back on reload or on other pages.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(welcome(page)).toBeHidden();
  await page.goto("/candidates");
  await expect(welcome(page)).toBeHidden();
  // The Getting Started checklist is there for people who skipped.
  await page.goto("/overview");
  await expect(page.getByTestId("getting-started")).toBeVisible();
});

test("welcome resumes at the step the user left, and Escape skips it", async ({ page }) => {
  const email = uniqueEmail("resume");
  await signIn(page, email, "/overview", { welcome: true });
  await wizardButton(page, "Next").click();
  await page.getByLabel("Grow my network").check();
  await wizardButton(page, "Next").click();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 3 of 4");
  await expect.poll(async () => (await stored(email)).step).toBe(2);

  await page.reload();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 3 of 4");

  await page.keyboard.press("Escape");
  await expect(welcome(page)).toBeHidden();
  await expect.poll(async () => (await stored(email)).status).toBe("skipped");
  await page.reload();
  await expect(welcome(page)).toBeHidden();
});

test("the tour is skippable, keyboard operable, and can be reopened from Help", async ({ page, isMobile }) => {
  await signIn(page, uniqueEmail("tour"), "/overview", { welcome: true });
  for (let i = 0; i < 3; i++) await wizardButton(page, "Next").click();
  await wizardButton(page, "Take a 1-minute tour").click();

  const tour = page.getByTestId("tour-popover");
  await expect(tour).toBeVisible();
  await expect(tour).toContainText(/Tour step 1 of \d+/);
  // Mobile has no sidebar, so the first stop is the menu button.
  await expect(tour).toContainText(isMobile ? "Your menu" : "Grouped by goal");

  // Focus starts on Next, so Enter advances without a mouse.
  await expect(tour.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tour).toContainText(/Tour step 2 of \d+/);

  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(page).not.toHaveURL(/tour=1/);
  // The app is fully usable afterwards.
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();

  // Reopen from Help.
  await page.getByRole("link", { name: /the tour/ }).click();
  await expect(page.getByTestId("tour-popover")).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByTestId("tour-popover")).toBeHidden();
});

test("restarting the setup guide from Help reopens the welcome; returning users are not interrupted", async ({ page }) => {
  await signIn(page, uniqueEmail("restart")); // default: already onboarded
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(welcome(page)).toBeHidden();

  await page.goto("/help");
  await page.getByRole("button", { name: "Restart the setup guide" }).click();
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Step 1 of 4");
});

test("welcome fits the screen and the menu can still be reached afterwards", async ({ page }) => {
  await signIn(page, uniqueEmail("fit"), "/overview", { welcome: true });
  await expect(welcome(page)).toBeVisible();
  const box = await welcome(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  await wizardButton(page, "Skip").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
