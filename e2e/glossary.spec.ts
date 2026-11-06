import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("a status word explains itself on tap and with the keyboard", async ({ page }) => {
  await signIn(page, uniqueEmail("glossary"), "/analytics");
  await page.waitForLoadState("networkidle");
  const term = page.getByRole("button", { name: "What does “Pending” mean?" }).first();
  await term.click();
  await expect(page.getByText("LinkedIn has not shown a reply yet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("LinkedIn has not shown a reply yet")).toBeHidden();
  await term.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("LinkedIn has not shown a reply yet")).toBeVisible();
});
