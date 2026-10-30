import { expect, test, type Page } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

/** The Applications board: drag and drop (pointer and keyboard), conflicts from another tab, and bulk moves. */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });
const column = (page: Page, name: string) => page.locator("section[data-column]").filter({ has: page.getByRole("heading", { name, exact: false }) });
const card = (page: Page, title: string) => page.getByTestId("board-card").filter({ hasText: title });

async function seed(email: string, titles: string[]) {
  const user_id = await userIdFor(email);
  const rows = (await adminRest(
    "POST",
    "applications",
    titles.map((title) => ({ user_id, title, company: "Test Co", stage: "saved" })),
  )) as { id: string }[];
  return rows.map((r) => r.id);
}

test.use({ viewport: { width: 1400, height: 900 } });

test("drag a card to another stage with the mouse, then Undo", async ({ page }) => {
  const email = uniqueEmail("dnd");
  await signIn(page, email);
  await seed(email, ["Drag Me"]);
  await page.goto("/applications");
  await expect(column(page, "Saved").getByText("Drag Me")).toBeVisible();

  const handle = card(page, "Drag Me").getByRole("button", { name: /Move Drag Me/ });
  const from = await handle.boundingBox();
  const to = await column(page, "Applied").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(toast(page, "Saved → Applied")).toBeVisible();
  await expect(column(page, "Applied").getByText("Drag Me")).toBeVisible();

  await toast(page, "Saved → Applied").getByRole("button", { name: "Undo" }).click();
  await expect(column(page, "Saved").getByText("Drag Me")).toBeVisible();
});

test("the keyboard can pick a card up, move it a column and drop it", async ({ page }) => {
  const email = uniqueEmail("dnd-key");
  await signIn(page, email);
  await seed(email, ["Key Card"]);
  await page.goto("/applications");

  await card(page, "Key Card").getByRole("button", { name: /Move Key Card/ }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(toast(page, "Saved → Applied")).toBeVisible();
  await expect(column(page, "Applied").getByText("Key Card")).toBeVisible();
});

test("a card changed in another tab is put back with a clear message", async ({ page }) => {
  const email = uniqueEmail("dnd-conflict");
  await signIn(page, email);
  const [id] = await seed(email, ["Stale Card"]);
  await page.goto("/applications");
  await expect(column(page, "Saved").getByText("Stale Card")).toBeVisible();

  // Another tab changes it after this page loaded.
  await adminRest("PATCH", `applications?id=eq.${id}`, { version: 9 });

  const handle = card(page, "Stale Card").getByRole("button", { name: /Move Stale Card/ });
  const from = await handle.boundingBox();
  const to = await column(page, "Applied").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(toast(page, "changed in another tab")).toBeVisible();
  await expect(column(page, "Saved").getByText("Stale Card")).toBeVisible();
});

test("the stage menu still moves a card, and a bulk move changes several at once", async ({ page }) => {
  const email = uniqueEmail("apps-bulk");
  await signIn(page, email);
  await seed(email, ["One", "Two"]);
  await page.goto("/applications?view=list");

  await page.getByRole("checkbox", { name: "Select every application" }).click();
  await expect(page.getByTestId("bulk-bar")).toContainText("2 selected");
  await page.getByLabel("Move to").selectOption("applied");
  await page.getByRole("button", { name: "Move 2" }).click();
  await expect(toast(page, "2 moved to Applied")).toBeVisible();
  await toast(page, "2 moved to Applied").getByRole("button", { name: "Undo" }).click();
  await expect(toast(page, "2 moved back")).toBeVisible();
});
