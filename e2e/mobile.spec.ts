import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("mobile: menu works and pages fit the screen", async ({ page }) => {
  await signIn(page, uniqueEmail("mobile"));
  for (const [link, path] of [["Daily Queue", "/queue"], ["Candidates", "/candidates"], ["Discover", "/discover"], ["People", "/people"], ["Connections", "/connections"], ["Analytics", "/analytics"]] as const) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(new RegExp(path));
    await expect(page.getByRole("dialog")).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
