import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("mobile: menu works and pages fit the screen", async ({ page }) => {
  await signIn(page, uniqueEmail("mobile"));
  for (const [link, path] of [["Daily Queue", "/queue"], ["Candidates", "/candidates"], ["Discover", "/discover"], ["People", "/people"], ["Connections", "/connections"], ["Analytics", "/analytics"], ["Jobs", "/jobs"], ["Applications", "/applications"]] as const) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(new RegExp(path));
    // The menu sheet closes. (Toasts also have role "dialog", so match the menu by its title.)
    await expect(page.getByRole("dialog", { name: "Network Growth" })).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  // The resume page (import, review, versions) fits too.
  await page.goto("/jobs/resume");
  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // So do notifications and saved searches (here, their empty states).
  for (const [path, heading] of [["/notifications", "Notifications"], ["/jobs/searches", "Saved searches"], ["/companies/northwind-labs", "Northwind Labs"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
