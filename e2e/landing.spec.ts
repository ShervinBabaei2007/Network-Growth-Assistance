import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("visitors see the landing page and can reach sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Grow your network on purpose");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What it never does" })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join("")).toContain("FAQPage");
  expect(ld.join("")).toContain("SoftwareApplication");

  await page.getByRole("link", { name: "Create a free account" }).first().click();
  await expect(page).toHaveURL(/\/login\?mode=signup/);
  await expect(page.getByRole("tab", { name: "Sign up", selected: true })).toBeVisible();
});

test("guides are public and each has numbered steps", async ({ page }) => {
  await page.goto("/guides");
  await page.getByRole("link", { name: /export your LinkedIn connections/i }).first().click();
  await expect(page).toHaveURL(/\/guides\/export-linkedin-connections/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("export your LinkedIn connections");
  await expect(page.getByRole("listitem").filter({ hasText: "Download the file" })).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

test("signed-in people skip the landing page", async ({ page }) => {
  await signIn(page, uniqueEmail("landing"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview/);
});

test("the landing page does not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
