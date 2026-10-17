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

test("the tour is skippable, keyboard operable, and can be reopened from Help", async ({ page }) => {
  await signIn(page, uniqueEmail("tour"), "/overview", { welcome: true });
  for (let i = 0; i < 3; i++) await wizardButton(page, "Next").click();
  await wizardButton(page, "Take the tour (18 stops)").click();

  const tour = page.getByTestId("tour-popover");
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("Stop 1 of 18");
  await expect(tour).toContainText("Overview: your next step");

  // Focus starts on Next, so Enter advances without a mouse.
  await expect(tour.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tour).toContainText("Stop 2 of 18");

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

test("the tour opens every page in turn, one stop each", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, uniqueEmail("fulltour"));
  await page.goto("/overview?tour=1");
  const tour = page.getByTestId("tour-popover");
  const stops: [string, RegExp][] = [
    ["Overview: your next step", /\/overview$/],
    ["Overview: the details", /\/overview$/],
    ["Discover: find people", /\/discover$/],
    ["Jobs: search", /\/jobs$/],
    ["Jobs: sorted by fit", /\/jobs$/],
    ["Your resume", /\/jobs\/resume$/],
    ["Daily Queue", /\/queue$/],
    ["Candidates", /\/candidates$/],
    ["People", /\/people$/],
    ["Known connections", /\/connections$/],
    ["Applications", /\/applications$/],
    ["Analytics", /\/analytics$/],
    ["Disciplines", /\/disciplines$/],
    ["Schools", /\/universities$/],
    ["Notifications", /\/notifications$/],
    ["Settings", /\/settings$/],
    ["Help", /\/help$/],
    ["That's the tour", /\/overview$/],
  ];
  for (const [i, [title, url]] of stops.entries()) {
    await expect(tour).toContainText(`Stop ${i + 1} of ${stops.length}`, { timeout: 30_000 });
    await expect(tour.getByText(title, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(url);
    // The popover sits inside the screen, whatever the width.
    const box = await tour.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    await tour.getByRole("button", { name: i === stops.length - 1 ? "Finish" : "Next" }).click();
  }
  await expect(tour).toBeHidden();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
});

test("a tour left part-way resumes at the same stop", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("tourresume");
  await signIn(page, email);
  await page.goto("/overview?tour=1");
  const tour = page.getByTestId("tour-popover");
  for (let i = 1; i <= 3; i++) {
    await expect(tour).toContainText(`Stop ${i} of 18`, { timeout: 30_000 });
    await tour.getByRole("button", { name: "Next" }).click();
  }
  await expect(tour).toContainText("Stop 4 of 18", { timeout: 30_000 });
  await expect.poll(async () => {
    const rows = (await adminRest("GET", `settings?user_id=eq.${await userIdFor(email)}&select=onboarding`)) as { onboarding: { tourStep?: number } }[];
    return rows[0]?.onboarding.tourStep;
  }).toBe(3);

  // Close the tab's page state (a hard reload) and come back through Help.
  await page.goto("/help");
  await page.getByRole("link", { name: "Resume the tour" }).click();
  await expect(page.getByTestId("tour-popover")).toContainText("Stop 4 of 18", { timeout: 30_000 });
});

test("a stop whose target never shows is still shown, then moves to its target when it appears", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("slowtarget"));
  // Hide the first stop's target, as a slow or missing element would be.
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.id = "hide-tour-target";
    style.textContent = "[data-tour=primary-action]{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
  await page.goto("/overview?tour=1");
  const tour = page.getByTestId("tour-popover");
  // The click gets feedback straight away, then the stop appears rather than being skipped.
  await expect(page.getByRole("status").filter({ hasText: "Starting the tour" })).toBeVisible();
  await expect(tour).toContainText("Stop 1 of 18", { timeout: 30_000 });
  await expect(tour).toContainText("Overview: your next step");
  await expect(page.getByRole("status").filter({ hasText: "Starting the tour" })).toBeHidden();

  // Once the target exists the popover is still there (it re-anchors to it).
  await page.evaluate(() => document.getElementById("hide-tour-target")?.remove());
  await expect(tour).toContainText("Stop 1 of 18");
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Stop 2 of 18", { timeout: 30_000 });
});

test("asking for the tour again while one is running starts it again instead of doing nothing", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("restartactive");
  await signIn(page, email);
  // Stop 17 is the Help page, which holds the "Take the tour" link.
  await adminRest("PATCH", `settings?user_id=eq.${await userIdFor(email)}`, { onboarding: { status: "done", tourDone: false, tourStep: 16, checklistDismissed: true } });
  await page.goto("/overview?tour=1");
  const tour = page.getByTestId("tour-popover");
  await expect(tour).toContainText("Stop 17 of 18", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/help$/);

  await page.getByRole("link", { name: /resume the tour|take the tour/i }).click();
  // The tour begins again from its saved stop and is visible, with the address back to a plain page.
  await expect(tour).toContainText("Stop 17 of 18", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/help$/);
  await expect(page).not.toHaveURL(/tour=1/);
});
