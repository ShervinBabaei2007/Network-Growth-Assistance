import { readFileSync } from "node:fs";
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

/** A server-only setting from the environment or .env.local (tests run outside Next.js). */
function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

/**
 * Deletes rows a test added to a shared table (e.g. an employer), so test data doesn't pile
 * up in the local database. Uses the local Supabase API with the server key; filters are
 * PostgREST ones, e.g. { board_token: "eq.e2e-123" }.
 */
export async function deleteTestRows(table: string, filters: Record<string, string>) {
  const url = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = localEnv("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to clean up test rows.");
  const res = await fetch(`${url}/rest/v1/${table}?${new URLSearchParams(filters)}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Couldn't delete test rows from ${table}: ${res.status}`);
}
