import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/** Accent colour and high contrast: applied at once, shown in the preview, saved, and set before first paint. */

test("an accent and high contrast apply without a reload and are there before the next page paints", async ({ page }) => {
  await signIn(page, uniqueEmail("accent"), "/settings");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-accent", "blue");
  // The controls load when the section nears the viewport.
  await page.getByRole("heading", { name: "Appearance" }).scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "Teal" }).click();
  await expect(html).toHaveAttribute("data-accent", "teal");
  await expect(page.getByTestId("appearance-preview")).toContainText("teal accent");

  await page.getByRole("button", { name: "High contrast" }).click();
  await expect(html).toHaveAttribute("data-contrast", "high");

  // Saved: the next page load has both set by the inline script, before any component runs.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(html).toHaveAttribute("data-accent", "teal");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(page.getByRole("button", { name: "Teal" })).toHaveAttribute("aria-pressed", "true");
});

test("choosing the pressed option again keeps it", async ({ page }) => {
  await signIn(page, uniqueEmail("accent-same"), "/settings");
  await page.getByRole("heading", { name: "Appearance" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Rose" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "rose");
  await page.getByRole("button", { name: "Rose" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "rose");
});
