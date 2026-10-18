import { expect, test } from "@playwright/test";
import { adminRest, runCron, signIn, uniqueEmail, userIdFor } from "./helpers";

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** A person who accepted `daysAgo` days ago, recorded the way the app records it. */
async function accepted(user_id: string, name: string, daysAgo: number) {
  const key = `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now() % 100000}`;
  const [c] = (await adminRest("POST", "candidates", [{ user_id, full_name: name, profile_url: `https://www.linkedin.com/in/${key}`, profile_key: key, status: "connected" }])) as { id: string }[];
  await adminRest("POST", "invitations", [{ user_id, candidate_id: c.id, sent_at: day(daysAgo + 3), outcome: "accepted", resolved_at: day(daysAgo) }]);
  return c.id;
}

test("an accepted invitation suggests follow-ups you can copy, finish, snooze and dismiss", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const email = uniqueEmail("followups");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  await accepted(user_id, "Maya Chen", 0);

  // Overview says one is due (the thank-you); the coffee-chat ask is a week away.
  await page.goto("/overview");
  await expect(page.getByRole("link", { name: "1 follow-up due" })).toBeVisible();

  await page.goto("/follow-ups");
  const cards = page.getByTestId("follow-up");
  await expect(cards).toHaveCount(4);
  const thanks = cards.filter({ hasText: "Thank them for connecting" });
  await expect(thanks).toContainText("Due today");
  await expect(cards.filter({ hasText: "Ask for a short chat" })).toContainText("This week");
  await expect(thanks.getByRole("textbox")).toHaveValue(/^Hi Maya, thank you for accepting my invitation to connect/);

  // Copy puts the draft on the clipboard and says the user sends it.
  await thanks.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "send it yourself" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Hi Maya, thank you for accepting/);

  // An edit that states something the record can't back up is flagged, but still copied.
  await thanks.getByRole("textbox").fill("Hi Maya, congrats on joining Shopify!");
  await thanks.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Copied, but check it" })).toBeVisible();

  // Done removes it, and Undo brings it back.
  await thanks.getByRole("button", { name: "Done" }).click();
  await expect(cards).toHaveCount(3);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).first().click();
  await expect(cards).toHaveCount(4);

  // Snooze moves it a week out, so it is no longer due.
  await cards.filter({ hasText: "Thank them for connecting" }).getByRole("button", { name: "Snooze a week" }).click();
  await expect(page.getByRole("heading", { name: /Due now/ })).toContainText("(0)");

  // Dismiss takes one away for good.
  await cards.filter({ hasText: "Catch up" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(cards).toHaveCount(3);
});

test("an old acceptance gets only the check-in still ahead, and the bell announces due follow-ups once", async ({ page }) => {
  const email = uniqueEmail("followups-old");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  await accepted(user_id, "Daniel Okafor", 60);
  await accepted(user_id, "Priya Nair", 10);

  await page.goto("/follow-ups");
  const cards = page.getByTestId("follow-up");
  // 60 days ago: the thank-you, chat and 30-day check-in were due too long ago to be worth suggesting, so only the 90-day check-in remains.
  await expect(cards.filter({ hasText: "Daniel Okafor" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "Daniel Okafor" })).toContainText("Catch up");

  await runCron("alerts");
  await runCron("alerts");
  await page.goto("/notifications");
  await expect(page.getByText(/follow-ups? due/)).toHaveCount(1);
});

test("follow-ups are private and example data shows them too", async ({ page }) => {
  const email = uniqueEmail("followups-private");
  await signIn(page, email, "/overview", { welcome: true });
  const wizard = page.getByTestId("onboarding-wizard");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await page.goto("/follow-ups");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();

  // Sample follow-ups are left out of the export and removed with the examples.
  const exported = await (await page.request.get("/api/export")).json();
  expect(exported.follow_ups).toHaveLength(0);
  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeHidden();
  await page.goto("/follow-ups");
  await expect(page.getByText("No follow-ups waiting")).toBeVisible();
});
