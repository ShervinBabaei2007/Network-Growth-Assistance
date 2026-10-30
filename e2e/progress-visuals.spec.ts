import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/** The funnel on Analytics: drawn from real counts, with waiting invitations kept apart, and a table version. */

test("the funnel shows each step, drop-off, and keeps pending apart from accepted", async ({ page }) => {
  const email = uniqueEmail("funnel");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  const stamp = Date.now() % 100000;
  const statuses = ["awaiting_review", "awaiting_review", "approved", "invitation_pending", "connected"];
  await adminRest(
    "POST",
    "candidates",
    statuses.map((status, i) => ({
      user_id,
      full_name: `Funnel ${i}`,
      profile_url: `https://www.linkedin.com/in/funnel-${stamp}-${i}`,
      profile_key: `funnel-${stamp}-${i}`,
      university_confidence: "needs_review",
      discipline_confidence: "needs_review",
      status,
    })),
  );

  await page.goto("/analytics");
  const funnel = page.getByRole("list", { name: "Outreach funnel" });
  await expect(funnel).toBeVisible();
  await expect(page.getByTestId("funnel-discovered")).toContainText("5");
  // Approved counts people who were approved and have since been invited: 1 approved + 2 invited.
  await expect(page.getByTestId("funnel-approved")).toContainText("3");
  await expect(page.getByTestId("funnel-invited")).toContainText("2");
  await expect(page.getByTestId("funnel-invited")).toContainText("1 waiting for an answer");
  await expect(page.getByTestId("funnel-accepted")).toContainText("1");

  // The same numbers as a table.
  await page.getByText("Show as table").first().click();
  await expect(page.getByRole("columnheader", { name: "Waiting for an answer" })).toBeVisible();
});

test("an empty account sees an explanation instead of an empty chart", async ({ page }) => {
  await signIn(page, uniqueEmail("funnel-empty"), "/analytics");
  await expect(page.getByText("Nobody has been added yet.")).toBeVisible();
});
