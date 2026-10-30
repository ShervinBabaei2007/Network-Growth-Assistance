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

    await page.getByRole("link", { name: "Ana Alvarez" }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    const pane = page.getByRole("complementary", { name: "Selected record" });
    await expect(pane.getByRole("heading", { name: "Ana Alvarez" })).toBeVisible();
    // The list is still there, with the open row marked.
    await expect(page.getByRole("link", { name: "Bo Bennett" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ana Alvarez" })).toHaveAttribute("aria-current", "true");

    // Arrow keys move through the list while the record changes.
    await page.getByRole("link", { name: "Ana Alvarez" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(pane.getByRole("heading", { name: "Bo Bennett" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bo Bennett" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(pane.getByRole("heading", { name: "Cleo Chan" })).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(pane.getByRole("heading", { name: "Bo Bennett" })).toBeVisible();
  });

  test("a link to a record still opens it directly, as a full page", async ({ page }) => {
    const email = uniqueEmail("md-direct");
    await signIn(page, email);
    const [first] = await seedPeople(email);
    await page.goto(`/people/${first.id}`);
    await expect(page.getByRole("heading", { name: first.full_name })).toBeVisible();
    await expect(page.locator("[data-record-page]")).toBeVisible();
    await expect(page.getByRole("link", { name: "People", exact: true }).first()).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("choosing a person shows their record instead of the list, with a way back", async ({ page }) => {
    const email = uniqueEmail("md-phone");
    await signIn(page, email);
    await seedPeople(email);
    await page.goto("/people");
    await page.getByRole("link", { name: "Ana Alvarez" }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Ana Alvarez" })).toBeVisible();
    // The list is not on screen at the same time.
    await expect(page.getByRole("link", { name: "Bo Bennett" })).toBeHidden();
    await page.getByRole("link", { name: "People", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Bo Bennett" })).toBeVisible();
  });
});
