import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

const palette = (page: import("@playwright/test").Page) => page.getByTestId("command-palette");

test("Ctrl+K opens the palette, finds a candidate by name and opens it", async ({ page }) => {
  const email = uniqueEmail("palette");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  const name = `Zelda Quillfeather ${Date.now() % 10000}`;
  const [created] = (await adminRest("POST", "candidates", [{ user_id, full_name: name, profile_url: `https://www.linkedin.com/in/zq-${Date.now()}`, profile_key: `zq-${Date.now()}`, status: "new" }])) as { id: string }[];

  await page.goto("/overview");
  await page.waitForLoadState("networkidle"); // the shortcut listener is attached after hydration
  await page.keyboard.press("Control+K");
  await expect(palette(page)).toBeVisible();
  // A screen reader hears a dialog with a listbox.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("listbox")).toBeVisible();

  await page.getByRole("combobox", { name: "Search and commands" }).fill("Quillfeather");
  const option = page.getByRole("option", { name: new RegExp(name) });
  await expect(option).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/candidates/${created.id}`));
  await expect(palette(page)).toBeHidden();
});

test("pages are two keystrokes away, and shortcuts never fire while typing", async ({ page }) => {
  await signIn(page, uniqueEmail("chords"));
  await page.goto("/overview");
  await page.waitForLoadState("networkidle");
  await page.locator("body").click();
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page).toHaveURL(/\/applications/);
  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/settings/);

  // Typing "ga/?" into a text field does nothing else.
  await page.goto("/discover");
  await page.waitForLoadState("networkidle"); // typing before hydration is lost by the controlled field
  const field = page.locator("#discoverQuery");
  await field.focus();
  await page.keyboard.type("ga/?");
  await expect(field).toHaveValue("ga/?");
  await expect(palette(page)).toBeHidden();
  await expect(page).toHaveURL(/\/discover$/);
});

test("? shows the shortcut list and Escape closes it", async ({ page }) => {
  await signIn(page, uniqueEmail("sheet"));
  await page.goto("/overview");
  await page.waitForLoadState("networkidle");
  await page.locator("body").click();
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-sheet")).toBeVisible();
  await expect(page.getByText("g then a")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shortcut-sheet")).toBeHidden();
});

test("the header button opens the palette and the palette code is not in the first load", async ({ page }) => {
  await signIn(page, uniqueEmail("button"));
  const scripts: string[] = [];
  page.on("response", (r) => r.url().includes("/_next/static") && r.url().endsWith(".js") && scripts.push(r.url()));
  await page.goto("/overview");
  await page.waitForLoadState("networkidle");
  const before = scripts.length;
  await page.getByRole("button", { name: /^Search/ }).click();
  await expect(palette(page)).toBeVisible();
  expect(scripts.length).toBeGreaterThan(before);
});
