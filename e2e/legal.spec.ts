import { test, expect } from "@playwright/test";

test("privacy policy and terms are public and linked from the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();

  await page.goto("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
});
