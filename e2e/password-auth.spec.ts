import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function linkFor(email: string, pattern: RegExp): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
        const id = list.messages?.[0]?.ID;
        if (!id) return false;
        const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
        link = (msg.HTML || msg.Text).match(pattern)?.[1]?.replaceAll("&amp;", "&") ?? "";
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return link;
}

test("sign up with a password, confirm by email, then sign in", async ({ page }) => {
  const email = uniqueEmail("pw");
  await page.goto("/login?mode=signup");
  await expect(page.getByRole("tab", { name: "Sign up", selected: true })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse 1");
  await page.getByLabel("Confirm password").fill("correct horse 1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/check your inbox to confirm/i)).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  // The resend button waits out a cooldown, since the first email was just sent.
  await expect(page.getByRole("button", { name: /resend email \(\d+s\)/i })).toBeDisabled();

  await page.goto(await linkFor(email, /href="([^"]+verify[^"]+)"/));
  await page.waitForURL((u) => !u.pathname.startsWith("/auth") && !u.pathname.startsWith("/login"));

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse 1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
});

test("a wrong password shows one generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill("whatever123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/email and password don't match/i)).toBeVisible();
});

test("sign up rejects mismatched passwords", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(uniqueEmail("mismatch"));
  await page.getByLabel("Password", { exact: true }).fill("correct horse 1");
  await page.getByLabel("Confirm password").fill("different horse 2");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/passwords don't match/i)).toBeVisible();
});

test("forgot password sends a reset link that lets you choose a new password", async ({ page }) => {
  const email = uniqueEmail("reset");
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("first password 1");
  await page.getByLabel("Confirm password").fill("first password 1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/check your inbox to confirm/i)).toBeVisible();
  await page.goto(await linkFor(email, /href="([^"]+verify[^"]+)"/));
  await page.waitForURL((u) => !u.pathname.startsWith("/auth") && !u.pathname.startsWith("/login"));
  await page.context().clearCookies();

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

  // The confirmation email is first in the inbox; the reset email is the newest one.
  let link = "";
  await expect
    .poll(async () => {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      for (const m of list.messages ?? []) {
        const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
        const found = (msg.HTML || msg.Text).match(/href="([^"]+verify[^"]+type=recovery[^"]*)"/)?.[1];
        if (found) link = found.replaceAll("&amp;", "&");
      }
      return Boolean(link);
    })
    .toBe(true);
  await page.goto(link);
  await page.waitForURL(/\/auth\/reset/);
  await page.getByLabel("New password").fill("second password 2");
  await page.getByLabel("Confirm password").fill("second password 2");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("second password 2");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
});
