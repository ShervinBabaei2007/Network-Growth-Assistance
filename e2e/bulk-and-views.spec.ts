import { expect, test, type Page } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

type Seed = { name: string; confirmed: boolean; status?: string };

/** A school and a field, then candidates that are confirmed or still need review. */
async function seed(email: string, people: Seed[]) {
  const user_id = await userIdFor(email);
  const [uni] = (await adminRest("POST", "universities", [{ user_id, name: "Test University" }])) as { id: string }[];
  const [disc] = (await adminRest("POST", "disciplines", [{ user_id, name: "Test Field" }])) as { id: string }[];
  const stamp = Date.now() % 100000;
  await adminRest(
    "POST",
    "candidates",
    people.map((p, i) => ({
      user_id,
      full_name: p.name,
      profile_url: `https://www.linkedin.com/in/bulk-${stamp}-${i}`,
      profile_key: `bulk-${stamp}-${i}`,
      university: p.confirmed ? uni.id : null,
      discipline: p.confirmed ? disc.id : null,
      university_confidence: p.confirmed ? "confirmed" : "needs_review",
      discipline_confidence: p.confirmed ? "confirmed" : "needs_review",
      status: p.status ?? "awaiting_review",
    })),
  );
}

const row = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });
const bar = (page: Page) => page.getByTestId("bulk-bar");
const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

test("one gesture changes many people, skips what the rules refuse, and Undo restores them", async ({ page }) => {
  const email = uniqueEmail("bulk");
  await signIn(page, email);
  await seed(email, [
    { name: "Ada Confirmed", confirmed: true },
    { name: "Ben Confirmed", confirmed: true },
    { name: "Cy Unconfirmed", confirmed: false },
  ]);
  await page.goto("/candidates");
  await page.waitForLoadState("networkidle");

  // Select the whole page with the header box.
  await page.getByRole("checkbox", { name: "Select everyone on this page" }).click();
  await expect(bar(page)).toContainText("3 selected");

  // Approve: two are confirmed, one is not and is skipped, and the toast says so.
  await bar(page).getByRole("button", { name: "Approve" }).click();
  await expect(toast(page, "2 marked approved. 1 skipped.")).toBeVisible();
  await expect(bar(page)).toBeHidden();
  await expect(row(page, "Ada Confirmed")).toContainText("Approved");
  await expect(row(page, "Cy Unconfirmed")).not.toContainText("Approved");

  // Undo puts both back.
  await toast(page, "2 marked approved").getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "Ada Confirmed")).not.toContainText("Approved");
  await expect(row(page, "Ben Confirmed")).not.toContainText("Approved");

  // Choosing a few rows and marking them not a match works too, by keyboard.
  await page.getByRole("checkbox", { name: "Select Ben Confirmed" }).focus();
  await page.keyboard.press("Space");
  await expect(bar(page)).toContainText("1 selected");
  await bar(page).getByRole("button", { name: "Not a match" }).focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "Ben Confirmed")).toContainText("Not a match");
});

test("an action nobody qualifies for explains why instead of failing silently", async ({ page }) => {
  const email = uniqueEmail("bulk-none");
  await signIn(page, email);
  await seed(email, [{ name: "Dee Unconfirmed", confirmed: false }]);
  await page.goto("/candidates");
  await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox", { name: "Select Dee Unconfirmed" }).click();
  await bar(page).getByRole("button", { name: "Approve" }).click();
  await expect(toast(page, /Approving needs the school and program confirmed/)).toBeVisible();
  await expect(row(page, "Dee Unconfirmed")).toBeVisible();
});

test("deleting asks first and then removes them for good", async ({ page }) => {
  const email = uniqueEmail("bulk-del");
  await signIn(page, email);
  await seed(email, [
    { name: "Eve Gone", confirmed: true },
    { name: "Fay Stays", confirmed: true },
  ]);
  await page.goto("/candidates");
  await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox", { name: "Select Eve Gone" }).click();
  await bar(page).getByRole("button", { name: "Delete…" }).click();
  await expect(bar(page)).toContainText("can't be undone");
  await bar(page).getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, "Eve Gone")).toBeVisible();

  await bar(page).getByRole("button", { name: "Delete…" }).click();
  await bar(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(toast(page, "1 deleted.")).toBeVisible();
  await expect(row(page, "Eve Gone")).toHaveCount(0);
  await expect(row(page, "Fay Stays")).toBeVisible();
});

test("saved views: save, open from the menu, remembered on return, per-page size and shareable URL", async ({ page }) => {
  const email = uniqueEmail("views");
  await signIn(page, email);
  const people: Seed[] = [
    ...Array.from({ length: 30 }, (_, i) => ({ name: `Person ${String(i).padStart(2, "0")}`, confirmed: true, status: "approved" })),
    { name: "Zed Review", confirmed: false },
  ];
  await seed(email, people);

  await page.goto("/candidates?status=awaiting_review");
  await page.waitForLoadState("networkidle");
  await expect(row(page, "Zed Review")).toBeVisible();
  await expect(row(page, "Person 00")).toHaveCount(0);

  // Save the filters as a view.
  await page.getByText(/^Saved views/).click();
  await expect(page.getByTestId("views-menu")).toContainText("1 filter applied");
  await page.getByLabel("Save these filters as").fill("Needs a look");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(toast(page, "Saved “Needs a look”.")).toBeVisible();

  // Leave, then come back with no filters: the last ones are restored on this device.
  await page.goto("/overview");
  await page.goto("/candidates");
  await expect(page).toHaveURL(/status=awaiting_review/);

  // Clear, then open the saved view from the menu.
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(row(page, "Person 00")).toBeVisible();
  await page.getByText(/^Saved views/).click();
  await page.getByRole("link", { name: "Needs a look" }).click();
  await expect(page).toHaveURL(/status=awaiting_review/);
  await expect(row(page, "Zed Review")).toBeVisible();

  // The URL alone reproduces the list, in a fresh session of the same account.
  const url = page.url();
  const fresh = await page.context().browser()!.newContext({ storageState: await page.context().storageState() });
  const other = await fresh.newPage();
  await other.goto(url);
  await expect(row(other, "Zed Review")).toBeVisible();
  await fresh.close();

  // Rows per page.
  await page.goto("/candidates?clear=1&size=25");
  await expect(page.getByText(/page 1 of 2/)).toBeVisible();
});
