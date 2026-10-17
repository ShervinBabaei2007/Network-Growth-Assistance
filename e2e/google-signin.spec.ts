import { test, expect } from "@playwright/test";

// Google itself can't be driven in a test. This checks our half: the button starts the
// OAuth flow at Supabase with this site's callback (which keeps the `next` redirect), and
// the email form is still there.
test("Continue with Google starts the OAuth flow with our callback", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL(/\/auth\/v1\/authorize\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("google");
  const redirect = new URL(url.searchParams.get("redirect_to")!);
  expect(redirect.pathname).toBe("/auth/callback");
  expect(redirect.searchParams.get("next")).toBe("/overview");
});
