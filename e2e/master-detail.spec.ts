import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/** Master-detail on wide screens: a record opens beside its list, keeps its own URL, and phones keep the full-page flow. */

async function seedPeople(email: string) {
  const user_id = await userIdFor(email);
  const names = ["Ana Alvarez", "Bo Bennett", "Cleo Chan"];
  const rows = (await adminRest(
    "POST",
    "network_people",
    names.map((full_name, i) => ({ user_id, full_name, normalized_name: full_name.toLowerCase(), saved: true, relevance_score: 90 - i })),
  )) as { id: string; full_name: string }[];
  return rows;
}

test.describe("wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("choosing a person opens their record beside the list, and the arrow keys move through the list", async ({ page }) => {
    const email = uniqueEmail("md");
    await signIn(page, email);
    await seedPeople(email);
    await page.goto("/people");
    await expect(page.getByText("Choose a person from the list")).toBeVisible();

    await page.getByRole("link", { name: "Ana Alvarez", exact: true }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    const pane = page.getByRole("complementary", { name: "Selected record" });
    await expect(pane.getByRole("heading", { name: "Ana Alvarez" })).toBeVisible();
    // The list is still there, with the open row marked.
    await expect(page.getByRole("link", { name: "Bo Bennett", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ana Alvarez", exact: true })).toHaveAttribute("aria-current", "true");

    // Arrow keys move through the list while the record changes.
    await page.getByRole("link", { name: "Ana Alvarez", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(pane.getByRole("heading", { name: "Bo Bennett" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bo Bennett", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(pane.getByRole("heading", { name: "Cleo Chan" })).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(pane.getByRole("heading", { name: "Bo Bennett" })).toBeVisible();
  });

  test("a link or a reload keeps the list beside the record", async ({ page }) => {
    const email = uniqueEmail("md-direct");
    await signIn(page, email);
    const [first] = await seedPeople(email);
    await page.goto(`/people/${first.id}`);
    // The record fills the right-hand side and the list is still there, with this row marked.
    await expect(page.getByRole("heading", { name: first.full_name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bo Bennett", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: first.full_name, exact: true })).toHaveAttribute("aria-current", "true");
    // Arrow keys still move through the list from a record that was opened directly.
    await page.getByRole("link", { name: first.full_name, exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Bo Bennett" })).toBeVisible();
  });

  test("the divider resizes the pane by keyboard and remembers the width", async ({ page }) => {
    const email = uniqueEmail("md-divider");
    await signIn(page, email);
    const [first] = await seedPeople(email);
    await page.goto(`/people/${first.id}`);
    // The server-rendered page briefly holds the frame's divider as well as its own; wait for the frame to step aside.
    await expect(page.getByTestId("pane-divider")).toHaveCount(1);
    const divider = page.getByTestId("pane-divider");
    await expect(divider).toBeVisible();
    const before = Number(await divider.getAttribute("aria-valuenow"));
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", String(before + 2));
    await page.keyboard.press("Home");
    await expect(divider).toHaveAttribute("aria-valuenow", "22");
    await page.keyboard.press("End");
    await expect(divider).toHaveAttribute("aria-valuenow", "48");
    // Remembered on this device.
    await page.reload();
    await expect(page.getByTestId("pane-divider")).toHaveCount(1);
    await expect(page.getByTestId("pane-divider")).toHaveAttribute("aria-valuenow", "48");
  });

  test("a remembered view does not close the pane when a record is chosen", async ({ page }) => {
    const email = uniqueEmail("md-remember");
    await signIn(page, email);
    await seedPeople(email);
    // Using a filter once stores it as this device's last view; a row link has no filters in its URL.
    await page.goto("/people?q=a");
    await page.getByRole("link", { name: "Ana Alvarez", exact: true }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("complementary", { name: "Selected record" }).getByRole("heading", { name: "Ana Alvarez" })).toBeVisible();
  });

  test("candidates open beside their list too", async ({ page }) => {
    const email = uniqueEmail("md-cand");
    await signIn(page, email);
    const user_id = await userIdFor(email);
    const stamp = Date.now() % 100000;
    await adminRest("POST", "candidates", ["Cam Okafor", "Dee Park"].map((full_name, i) => ({
      user_id, full_name, profile_url: `https://www.linkedin.com/in/md-${stamp}-${i}`, profile_key: `md-${stamp}-${i}`,
      university_confidence: "needs_review", discipline_confidence: "needs_review", status: "awaiting_review",
    })));
    await page.goto("/candidates");
    await page.getByRole("link", { name: "Cam Okafor", exact: true }).click();
    await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("complementary", { name: "Selected record" }).getByRole("heading", { name: "Cam Okafor" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dee Park", exact: true })).toBeVisible();
    // A reload keeps both.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Cam Okafor" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dee Park", exact: true })).toBeVisible();
  });

  test("applications open beside the list view, but a board card opens the full page", async ({ page }) => {
    const email = uniqueEmail("md-apps");
    await signIn(page, email);
    const user_id = await userIdFor(email);
    await adminRest("POST", "applications", ["Alpha Role", "Beta Role"].map((title) => ({ user_id, title, company: "Co", stage: "applied" })));

    await page.goto("/applications?view=list");
    await page.getByRole("link", { name: "Alpha Role", exact: true }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("complementary", { name: "Selected record" }).getByRole("heading", { name: "Alpha Role" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Beta Role", exact: true })).toBeVisible();

    // From the board there is no room for a pane: the record replaces the board.
    await page.goto("/applications");
    await page.getByRole("link", { name: "Alpha Role", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Alpha Role" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Beta Role", exact: true })).toBeHidden();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("choosing a person shows their record instead of the list, with a way back", async ({ page }) => {
    const email = uniqueEmail("md-phone");
    await signIn(page, email);
    await seedPeople(email);
    await page.goto("/people");
    await page.getByRole("link", { name: "Ana Alvarez", exact: true }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Ana Alvarez" })).toBeVisible();
    // The list is not on screen at the same time.
    await expect(page.getByRole("link", { name: "Bo Bennett", exact: true })).toBeHidden();
    await page.getByRole("link", { name: "People", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Bo Bennett", exact: true })).toBeVisible();
  });
});
