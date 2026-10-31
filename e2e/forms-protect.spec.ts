import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/** Forms that protect your work: a warning before leaving with edits, and a draft that survives a closed tab. */

test("a Settings form with unsaved edits asks before a link leaves the page", async ({ page }) => {
  await signIn(page, uniqueEmail("unsaved"), "/settings");
  const input = page.locator("#dailyInviteTarget");
  await input.fill("12");

  // Saying no keeps the page and the typed value.
  const asked: string[] = [];
  page.once("dialog", async (d) => {
    asked.push(d.message());
    await d.dismiss();
  });
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(page).toHaveURL(/\/settings/);
  expect(asked[0]).toMatch(/unsaved changes/i);
  await expect(input).toHaveValue("12");

  // Saying yes leaves.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(page).toHaveURL(/\/overview/);
});

test("saving clears the warning, so leaving afterwards does not ask", async ({ page }) => {
  await signIn(page, uniqueEmail("saved"), "/settings");
  await page.locator("#dailyInviteTarget").fill("12");
  await page.getByRole("button", { name: "Save planning" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: /saved/i }).first()).toBeVisible();

  let asked = false;
  page.on("dialog", async (d) => {
    asked = true;
    await d.accept();
  });
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(page).toHaveURL(/\/overview/);
  expect(asked).toBe(false);
});

test("a half-written note comes back after the tab is closed", async ({ page, context }) => {
  const email = uniqueEmail("draft");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  const [person] = (await adminRest("POST", "network_people", [
    { user_id, full_name: "Dee Draft", normalized_name: "dee draft", saved: true },
  ])) as { id: string }[];

  await page.goto(`/people/${person.id}`);
  const notes = page.getByLabel("Notes (private)");
  await notes.fill("Met at the career fair; follow up about the co-op.");
  // Drafts are written as you type; wait for the next write cycle, then close the tab without saving.
  await page.waitForTimeout(300);
  await page.close();

  const again = await context.newPage();
  await again.goto(`/people/${person.id}`);
  const banner = again.getByTestId("draft-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Restore it" }).click();
  await expect(again.getByLabel("Notes (private)")).toHaveValue("Met at the career fair; follow up about the co-op.");

  // Saving removes the draft for good.
  await again.getByRole("button", { name: "Save", exact: true }).click();
  await expect(again.getByTestId("toast").filter({ hasText: /saved/i }).first()).toBeVisible();
  await again.reload();
  await expect(again.getByTestId("draft-banner")).toHaveCount(0);
});

test("the Back button asks before leaving a form with unsaved edits", async ({ page }) => {
  await signIn(page, uniqueEmail("back"), "/overview");
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const input = page.locator("#dailyInviteTarget");
  await input.fill("14");

  // Saying no keeps the page and what was typed.
  let asked = 0;
  page.once("dialog", async (d) => {
    asked++;
    await d.dismiss();
  });
  await page.goBack();
  await expect.poll(() => asked).toBe(1);
  await expect(page).toHaveURL(/\/settings/);
  await expect(input).toHaveValue("14");

  // Asking again works (the spare entry was put back), and yes leaves.
  page.once("dialog", (d) => d.accept());
  await page.goBack();
  await expect(page).toHaveURL(/\/overview/);
});

test("the Back button does not ask when nothing was changed", async ({ page }) => {
  await signIn(page, uniqueEmail("back-clean"), "/overview");
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  let asked = false;
  page.on("dialog", async (d) => {
    asked = true;
    await d.accept();
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/overview/);
  expect(asked).toBe(false);
});
