import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Signs in through the real magic-link flow, reading the email from local Mailpit. */
export async function signIn(page: Page, email: string, start = "/overview") {
  await page.goto(start);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
        const id = list.messages?.[0]?.ID;
        if (!id) return false;
        const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
        link = (msg.HTML || msg.Text).match(/href="([^"]+verify[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.goto(link!);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth") && !u.pathname.startsWith("/login"));
}

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
