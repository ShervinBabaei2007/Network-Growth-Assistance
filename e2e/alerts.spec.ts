import { expect, test, type Page } from "@playwright/test";
import { adminRest, latestEmail, runCron, signIn, uniqueEmail } from "./helpers";

/**
 * Saved-search alerts end to end (JOBS_FIXTURES=1, emails to local Mailpit): what a search
 * shows when saved is never announced; a job that arrives later is, once, in the app and
 * by email; unsubscribing stops the email but not the in-app alert.
 */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

type Row = { id: string };

/** A fictional verified listing that appears "now", as a search source would add it. */
async function addJob(tag: string, title: string): Promise<string> {
  const [row] = (await adminRest("POST", "jobs", {
    source: "jobicy",
    provider_key: `e2e:${tag}`,
    external_id: tag,
    title,
    company: "E2E Alerts Ltd",
    countries: ["CA"],
    country: "CA",
    remote: true,
    posted_at: new Date().toISOString(),
    apply_url: `https://jobs.example.com/e2e-alerts/${tag}`,
    verification_status: "verified",
    verified_at: new Date().toISOString(),
    description: `${title}. Build and ship web features with a small team.`,
  })) as Row[];
  return row.id;
}

/** Makes the user's saved searches due now, as if their scheduled hour had come. */
const makeDue = (userId: string) => adminRest("PATCH", `saved_searches?user_id=eq.${userId}`, { next_run_at: new Date(Date.now() - 60_000).toISOString() });

test("a saved search announces only new jobs, once, in the app and by email", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("alerts");
  await signIn(page, email, "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");
  const tags: string[] = [];

  try {
    // Turn email on, then save a search with email and daily alerts.
    await page.goto("/settings#notifications");
    await page.getByRole("checkbox", { name: /Allow alert emails/ }).check();
    await page.locator("#notifications").getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Notification settings saved.")).toBeVisible();

    // A title no other spec searches for: specs run in parallel against the same database.
    await page.goto("/jobs?q=Cartographer");
    await page.getByRole("button", { name: "Save this search" }).click();
    const form = page.getByRole("form", { name: "Save this search" });
    await form.getByLabel("Name").fill("E2E cartographer alerts");
    await form.getByRole("checkbox", { name: /Also email me/ }).check();
    await form.getByRole("button", { name: "Save search" }).click();
    await expect(toast(page, /Search saved\./)).toBeVisible({ timeout: 30_000 });

    const [search] = (await adminRest("GET", `saved_searches?select=id,user_id&name=eq.E2E%20cartographer%20alerts&order=created_at.desc&limit=1`)) as { id: string; user_id: string }[];
    const userId = search.user_id;

    // 1. Nothing new yet: the jobs shown when saving are the baseline.
    await makeDue(userId);
    await runCron("alerts");
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Nothing yet" })).toBeVisible();

    // 2. A new job arrives: one notification, and one email.
    const tag = `${Date.now()}`;
    tags.push(tag);
    await addJob(tag, "Junior Cartographer (E2E alert)");
    await makeDue(userId);
    await runCron("alerts");
    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: "1 new job for E2E cartographer alerts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Junior Cartographer (E2E alert)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();

    let mail: Awaited<ReturnType<typeof latestEmail>> = null;
    await expect.poll(async () => (mail = await latestEmail(email, /new job/)), { timeout: 20_000 }).not.toBeNull();
    expect(mail!.subject).toBe("1 new job for E2E cartographer alerts");
    expect(mail!.text).toContain("Junior Cartographer (E2E alert)");
    expect(mail!.text).not.toMatch(/resume/i);

    // 3. Running again announces nothing twice.
    await makeDue(userId);
    await runCron("alerts");
    await page.reload();
    await expect(page.getByText(/new jobs? for E2E cartographer alerts/)).toHaveCount(1);

    // 4. Unsubscribe from the email: confirm first, then it's off.
    const link = mail!.text.match(/Stop emails for this search: (\S+)/)![1];
    await page.goto(link);
    await page.getByRole("button", { name: /Stop emails for this saved search/ }).click();
    await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
    const [after] = (await adminRest("GET", `saved_searches?select=email_digest&id=eq.${search.id}`)) as { email_digest: boolean }[];
    expect(after.email_digest).toBe(false);

    // Another new job: in the app, but no second email.
    const tag2 = `${Date.now()}b`;
    tags.push(tag2);
    await addJob(tag2, "Junior Cartographer II (E2E alert)");
    await makeDue(userId);
    await runCron("alerts");
    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: "Junior Cartographer II (E2E alert)" })).toBeVisible();
    await page.waitForTimeout(1500);
    const mails = (await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"new job"`)}`)).json()) as { messages_count?: number; total?: number; messages?: unknown[] };
    expect(mails.messages?.length ?? 0).toBe(1);

    // 5. Mark everything read.
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("All read")).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  } finally {
    for (const t of tags) await adminRest("DELETE", `jobs?provider_key=eq.e2e:${t}`);
  }
});

test("alerts need the cron secret", async ({ request }) => {
  expect((await request.post("/api/cron/alerts")).status()).toBe(401);
  expect((await request.post("/api/cron/alerts", { headers: { Authorization: "Bearer wrong-secret-of-enough-length" } })).status()).toBe(401);
});
