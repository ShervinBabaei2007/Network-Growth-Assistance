import { expect, test, type Page } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/**
 * People at a company (JOBS_FIXTURES=1): an imported connection with its date, a possible
 * match the user confirms, a referral recorded once on the application's timeline, a
 * template draft (no AI) copied but never sent, and the company page.
 */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

test("people at a company, referrals and the company page", async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const email = uniqueEmail("network");
  await signIn(page, email, "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from the last/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");
  const userId = await userIdFor(email);

  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  // Someone imported from LinkedIn at the company, and a saved person at a regional name.
  await adminRest("POST", "known_connections", { user_id: userId, full_name: "Sam Rivera", normalized_name: "sam rivera", company: "Northwind Labs", position: "Platform Engineer" });
  await adminRest("POST", "network_people", { user_id: userId, full_name: "Riley Chen", normalized_name: "riley chen", current_company: "Northwind Labs Canada", current_title: "Engineering Manager", saved: true });

  await page.goto("/jobs?q=Developer");
  await page.getByRole("region", { name: /jobs from/i }).getByRole("link", { name: "Junior Software Developer" }).first().click();
  await page.getByRole("button", { name: "I applied" }).click();
  await expect(toast(page, "Application marked as applied.")).toBeVisible();

  const people = page.getByRole("complementary", { name: "Apply and track" });
  await expect(people.getByText("People at Northwind Labs")).toBeVisible();
  await expect(people.getByText("Sam Rivera")).toBeVisible();
  await expect(people.getByText(/Your LinkedIn connections, imported today/)).toBeVisible();
  // Riley's company only possibly matches: the user decides.
  await expect(people.getByText("Possibly the same company")).toBeVisible();
  await people.getByRole("button", { name: "Yes" }).click();
  await expect(toast(page, "Treated as the same company.")).toBeVisible();
  await expect(people.getByRole("link", { name: "Riley Chen" })).toBeVisible();
  await expect(people.getByText(/You confirmed these are the same company/)).toBeVisible();

  // A referral, recorded once.
  await people.getByRole("button", { name: "I asked for a referral" }).click();
  await expect(toast(page, "Recorded that you asked for a referral.")).toBeVisible();
  await people.getByRole("button", { name: "I asked for a referral" }).click();
  await expect(toast(page, "Already recorded.")).toBeVisible();

  // A template draft, copied (nothing is sent).
  await people.getByRole("button", { name: "Draft a message" }).click();
  const draft = people.getByLabel(/Template for Riley Chen/);
  await expect(draft).toHaveValue(/Hi Riley/);
  await expect(draft).toHaveValue(/you've been at Northwind Labs/);
  await people.getByRole("button", { name: "Copy" }).click();
  await expect(toast(page, "Copied. Nothing was sent.")).toBeVisible();

  // On the application's timeline, once.
  await page.getByRole("link", { name: /In Applications: Applied/ }).click();
  await expect(page.getByText("Asked Riley Chen")).toHaveCount(1);

  // The company page brings it together.
  await page.getByRole("link", { name: "Everything at Northwind Labs" }).click();
  await expect(page.getByRole("heading", { name: "Northwind Labs", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Junior Software Developer" }).first()).toBeVisible();
  // (The previous page stays mounted but hidden after a client navigation: match what's shown.)
  await expect(page.getByText("Asked Riley Chen").filter({ visible: true })).toBeVisible();
});
