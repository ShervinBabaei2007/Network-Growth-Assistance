import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/**
 * Signs in through the real magic-link flow, reading the email from local Mailpit.
 * New users see the welcome on their first visit, so by default it is marked finished first and
 * the tests are about everything else. Pass { welcome: true } to see it as a real first-time user would.
 */
export async function signIn(page: Page, email: string, start = "/overview", options: { welcome?: boolean } = {}) {
  await page.goto(start);
  // The sign-in form is plain HTML until the page has loaded its JavaScript; a click before then does nothing.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /sign-in link instead/i }).click();
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
  // The signup trigger has already created the settings row, so this can be set before the first page load.
  let skipped = options.welcome === true;
  if (!skipped) skipped = await markOnboarded(email);
  await page.goto(link!);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth") && !u.pathname.startsWith("/login"));
  if (!skipped && !options.welcome) {
    await markOnboarded(email, true);
    await page.goto(start);
  }
}

/** Marks the welcome as finished for a test user. Returns false if the user's row doesn't exist yet. */
async function markOnboarded(email: string, strict = false): Promise<boolean> {
  try {
    const id = await userIdFor(email);
    const rows = (await adminRest("PATCH", `settings?user_id=eq.${id}`, { onboarding: { status: "done", tourDone: true, checklistDismissed: true } })) as unknown[];
    return rows.length > 0;
  } catch (e) {
    if (strict) throw e;
    return false;
  }
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

/** A call to the local Supabase REST API with the server key, for test setup and cleanup. */
export async function adminRest(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const url = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = localEnv("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for test setup.");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** A call to the local Supabase auth admin API with the server key (e.g. DELETE users/<id>), for test setup. */
export async function adminAuth(method: "GET" | "DELETE", path: string): Promise<void> {
  const url = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = localEnv("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for test setup.");
  const res = await fetch(`${url}/auth/v1/admin/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${method} auth ${path}: ${res.status} ${await res.text()}`);
}

/** Calls a cron route the way pg_cron does, with CRON_SECRET from .env.local. */
export async function runCron(route: "alerts" | "crawl" | "daily", base = "http://localhost:3000") {
  const secret = localEnv("CRON_SECRET");
  if (!secret) throw new Error("Set CRON_SECRET in .env.local to run cron routes in tests.");
  const res = await fetch(`${base}/api/cron/${route}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  if (!res.ok) throw new Error(`cron ${route}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
}

/** The newest email Mailpit received for an address, as text, or null. */
export async function latestEmail(to: string, subject?: RegExp): Promise<{ subject: string; text: string } | null> {
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
  for (const m of list.messages ?? []) {
    if (subject && !subject.test(m.Subject)) continue;
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    return { subject: msg.Subject, text: msg.Text };
  }
  return null;
}

/** The auth user id for a test email (local Supabase admin API). */
export async function userIdFor(email: string): Promise<string> {
  const url = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = localEnv("SUPABASE_SECRET_KEY");
  const res = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=5`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  const user = body.users?.find((u) => u.email === email);
  if (!user) throw new Error(`No user ${email}`);
  return user.id;
}

export type PlanSetup = {
  goal?: number;
  schools: { name: string; aliases?: string; ownTargets?: boolean }[];
  disciplines: { name: string; aliases?: string }[];
  /** Per discipline: its total, and the target for each school with its own targets. */
  targets?: Record<string, { total?: number; schools?: Record<string, number> }>;
};

/** Sets up a new user's own networking plan through Settings, as a person would. Nothing is built in. */
export async function setUpPlan(page: Page, plan: PlanSetup) {
  await page.goto("/settings");
  if (plan.goal !== undefined) {
    await page.locator("#overallTarget").fill(String(plan.goal));
    await page.getByRole("button", { name: "Save goal" }).click();
    await expect(page.getByTestId("form-status").filter({ hasText: "Saved." }).first()).toBeVisible();
  }
  for (const s of plan.schools) {
    await page.locator("#university-new-name").fill(s.name);
    await page.locator("#university-new-aliases").fill(s.aliases ?? "");
    const own = page.locator("form").filter({ has: page.locator("#university-new-name") }).getByRole("checkbox", { name: "Give this school its own targets" });
    if (s.ownTargets === false) await own.uncheck();
    else await own.check();
    await page.getByRole("button", { name: "Add school" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: `Added “${s.name}”` }).first()).toBeVisible();
  }
  for (const d of plan.disciplines) {
    await page.locator("#discipline-new-name").fill(d.name);
    await page.locator("#discipline-new-aliases").fill(d.aliases ?? "");
    await page.getByRole("button", { name: "Add discipline" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: `Added “${d.name}”` }).first()).toBeVisible();
  }
  if (plan.targets) {
    for (const [discipline, t] of Object.entries(plan.targets)) {
      const group = page.getByRole("group", { name: discipline });
      if (t.total !== undefined) await group.getByLabel("Total", { exact: true }).fill(String(t.total));
      for (const [school, n] of Object.entries(t.schools ?? {})) await group.getByLabel(school, { exact: true }).fill(String(n));
    }
    await page.getByRole("button", { name: "Save targets" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Saved." }).first()).toBeVisible();
  }
}

/**
 * Chooses an option in a labelled dropdown by the text people see. The app's dropdown is the native select on
 * phones and the shadcn Select popover on desktop, and this works with either.
 */
export async function chooseOption(control: Locator, optionText: string) {
  if ((await control.evaluate((el) => el.tagName)) === "SELECT") {
    await control.selectOption({ label: optionText });
    return;
  }
  await control.click();
  await control.page().getByRole("option", { name: optionText, exact: true }).click();
}

/** Checks which option a labelled dropdown shows, for the native select (phones) and the shadcn Select (desktop) alike. */
export async function expectSelected(control: Locator, optionText: string) {
  if ((await control.evaluate((el) => el.tagName)) === "SELECT") {
    await expect(control.locator("option:checked")).toHaveText(optionText);
  } else {
    await expect(control).toHaveText(optionText);
  }
}
