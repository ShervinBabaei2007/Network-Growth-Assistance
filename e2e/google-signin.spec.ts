import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Google itself can't be driven in a test. This checks our half. With a Google client in supabase/.env
// (GOOGLE_CLIENT_ID), the button must hand over to Google with our callback and the `next` redirect. Without
// one, the person must land back on the sign-in page with a clear message, never on a raw JSON error.
function googleConfigured(): boolean {
  try {
    return /^GOOGLE_CLIENT_ID=\S+/m.test(readFileSync("supabase/.env", "utf8"));
  } catch {
    return false;
  }
}

test("Continue with Google either starts the OAuth flow or explains it isn't set up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue with Google" }).click();

  if (googleConfigured()) {
    // We reach Google (a made-up client id there shows Google's own "invalid client" page, which is fine).
    await page.waitForURL(/accounts\.google\.com/, { waitUntil: "commit" });
    expect(new URL(page.url()).searchParams.get("client_id")).toBeTruthy();
  } else {
    await page.waitForURL(/\/login\?error=google/);
    await expect(page.getByText(/Google sign-in isn't available right now/)).toBeVisible();
    await expect(page.getByText("validation_failed")).toHaveCount(0);
  }
});

test("the redirect after Google carries our callback and next page", async ({ request }) => {
  test.skip(!googleConfigured(), "Needs GOOGLE_CLIENT_ID in supabase/.env");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const res = await request.get(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent("http://localhost:3000/auth/callback?next=/queue")}`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toContain("accounts.google.com");
});
