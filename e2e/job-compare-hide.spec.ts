import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/** Hide a company (with Undo), manage hidden jobs, keep a private note, and compare jobs. Uses the fictional job fixtures. */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

test("hide a company, undo it, write a note and compare two jobs", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, uniqueEmail("compare"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  await page.goto("/jobs?q=Developer&range=any");
  const results = page.getByRole("region", { name: /jobs from/i });
  const northwind = results.getByRole("listitem").filter({ hasText: "Northwind Labs" }).first();
  await expect(northwind).toBeVisible();

  // Hide the company from the card's menu; it leaves the list, and Undo brings it back.
  await northwind.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Hide jobs from Northwind Labs" }).click();
  await expect(toast(page, "Hiding jobs from northwind labs.")).toBeVisible();
  await expect(results.getByText("Northwind Labs", { exact: true })).toHaveCount(0);
  await toast(page, "Hiding jobs from northwind labs.").getByRole("button", { name: "Undo" }).click();
  await expect(results.getByText("Northwind Labs", { exact: true }).first()).toBeVisible();

  // Hide it again; the Hidden page lists it and "Show again" restores it.
  await results.getByRole("listitem").filter({ hasText: "Northwind Labs" }).first().getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Hide jobs from Northwind Labs" }).click();
  await page.goto("/jobs/hidden");
  const row = page.getByRole("listitem").filter({ hasText: "northwind labs" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Show again" }).click();
  await expect(row).toHaveCount(0);

  // A private note on a job.
  await page.goto("/jobs?q=Developer&range=any");
  await results.getByRole("listitem").first().getByRole("link").first().click();
  await page.getByLabel("Your private note").fill("Ask about remote days");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(toast(page, "Note saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your private note")).toHaveValue("Ask about remote days");

  // Compare two jobs.
  await page.goto("/jobs?q=Developer&range=any");
  const items = results.getByRole("listitem");
  await items.nth(0).getByLabel(/^Compare /).check();
  await expect(page.getByTestId("compare-bar")).toContainText("pick at least one more");
  await items.nth(1).getByLabel(/^Compare /).check();
  await page.getByTestId("compare-bar").getByRole("link", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: "Compare jobs" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Jobs compared side by side" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Pay" })).toBeVisible();
});
