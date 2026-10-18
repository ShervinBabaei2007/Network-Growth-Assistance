import { expect, test, type Page } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

// Desktop sidebar. The phone menu uses the same list (see sticky-nav and mobile specs).
const sidebar = (page: Page) => page.locator("aside").first();
const link = (page: Page, name: string) => sidebar(page).getByRole("link", { name, exact: true });
const moreButton = (page: Page) => sidebar(page).getByRole("button", { name: "More" });

async function setGoal(email: string, goal?: "network" | "jobs" | "both") {
  await adminRest("PATCH", `settings?user_id=eq.${await userIdFor(email)}`, {
    onboarding: { status: "done", tourDone: true, checklistDismissed: true, ...(goal ? { goal } : {}) },
  });
}

test("with no goal chosen the menu shows the everyday links and tucks the rest under More", async ({ page }) => {
  await signIn(page, uniqueEmail("nav-both"));
  for (const name of ["Overview", "Discover", "Jobs", "Daily Queue", "Applications", "Settings", "Help"]) await expect(link(page, name)).toBeVisible();
  for (const name of ["Candidates", "People", "Connections", "Analytics", "Disciplines", "Schools"]) await expect(link(page, name)).toBeHidden();
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("a jobs goal puts Jobs and Applications up front; More opens to the rest", async ({ page }) => {
  const email = uniqueEmail("nav-jobs");
  await signIn(page, email);
  await setGoal(email, "jobs");
  await page.goto("/overview");
  for (const name of ["Overview", "Jobs", "Applications", "Settings", "Help"]) await expect(link(page, name)).toBeVisible();
  await expect(link(page, "Discover")).toBeHidden();
  await expect(link(page, "Daily Queue")).toBeHidden();

  await moreButton(page).click();
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Discover", "Daily Queue", "Candidates", "Analytics"]) await expect(link(page, name)).toBeVisible();
  await link(page, "Analytics").click();
  await expect(page).toHaveURL(/\/analytics$/);
  await moreButton(page).click();
  await expect(link(page, "Analytics")).toBeHidden();
});

test("a network goal puts the network pages up front", async ({ page }) => {
  const email = uniqueEmail("nav-network");
  await signIn(page, email);
  await setGoal(email, "network");
  await page.goto("/overview");
  for (const name of ["Overview", "Discover", "Daily Queue", "Candidates", "People"]) await expect(link(page, name)).toBeVisible();
  await expect(link(page, "Jobs")).toBeHidden();
  await expect(link(page, "Applications")).toBeHidden();
});

test("opening a page that lives under More opens More and marks it current", async ({ page }) => {
  const email = uniqueEmail("nav-active");
  await signIn(page, email);
  await setGoal(email, "jobs");
  await page.goto("/candidates");
  await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(link(page, "Candidates")).toHaveAttribute("aria-current", "page");
});

test("choosing a goal in the welcome changes the menu straight away", async ({ page }) => {
  await signIn(page, uniqueEmail("nav-welcome"), "/overview", { welcome: true });
  const welcome = page.getByTestId("onboarding-wizard");
  await welcome.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Find a job").check();
  await welcome.getByRole("button", { name: "Next", exact: true }).click();
  await welcome.getByRole("button", { name: "Next", exact: true }).click();
  await welcome.getByRole("button", { name: "Done", exact: true }).click();
  await expect(welcome).toBeHidden();
  await expect(link(page, "Applications")).toBeVisible();
  await expect(link(page, "Daily Queue")).toBeHidden();
});
