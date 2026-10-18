import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { chooseOption, signIn, uniqueEmail } from "./helpers";

/**
 * The application tracker end to end, on the fictional employer boards (JOBS_FIXTURES=1):
 * save → open the verified Apply link → confirm "Mark as applied" → move by keyboard on the
 * board → interview with a calendar file → offer → close and reopen, with Undo.
 */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

test("track an application from save to offer", async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page, uniqueEmail("apps"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  // An empty tracker explains itself.
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "No applications yet" })).toBeVisible();

  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  // 1. Save, then open the verified Apply link. Opening it alone records nothing.
  await page.goto("/jobs?q=Developer");
  const card = page.getByRole("region", { name: /jobs from/i }).getByRole("listitem").filter({ hasText: "Junior Software Developer" });
  await card.getByRole("button", { name: "Save" }).click();
  await expect(toast(page, "Job saved.")).toBeVisible();
  const popup = context.waitForEvent("page");
  await card.getByRole("link", { name: "Apply" }).click();
  await (await popup).close();
  const ask = card.getByRole("dialog", { name: "Mark as applied?" });
  await expect(ask).toBeVisible();
  // In a job card the question is in the top layer, so the card's containment can't clip it.
  await expect.poll(() => ask.evaluate((el) => el.matches(":popover-open"))).toBe(true);
  await ask.getByRole("button", { name: "Mark as applied" }).click();
  await expect(toast(page, "Marked as applied.")).toBeVisible();

  // 2. One application, not two, after saving and applying.
  await page.goto("/applications");
  const board = page.getByRole("region", { name: "Applied" });
  await expect(board.getByRole("link", { name: "Junior Software Developer" })).toHaveCount(1);
  await expect(page.getByText("1 application, 1 open")).toBeVisible();

  // 3. Move it by keyboard: the stage control is a labelled select.
  const stage = page.getByLabel("Stage of Junior Software Developer");
  await stage.focus();
  await expect(stage).toBeFocused();
  await chooseOption(stage, "Screening");
  await expect(toast(page, "Applied → Screening")).toBeVisible();
  await expect(page.getByRole("region", { name: "Screening" }).getByRole("link", { name: "Junior Software Developer" })).toBeVisible();

  // Undo puts it back.
  const moved = toast(page, "Applied → Screening");
  await moved.hover();
  await moved.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Applied" }).getByRole("link", { name: "Junior Software Developer" })).toBeVisible();
  await chooseOption(page.getByLabel("Stage of Junior Software Developer"), "Screening");
  await expect(page.getByRole("region", { name: "Screening" }).getByRole("link", { name: "Junior Software Developer" })).toBeVisible();

  // The list view sorts and shows the same application.
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /Stage/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Junior Software Developer" })).toHaveCount(1);

  // 4. The detail page: an interview, its calendar file, and the stage moving on.
  await page.getByRole("link", { name: "Junior Software Developer" }).click();
  await expect(page.getByRole("heading", { name: "Junior Software Developer", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Add an interview" }).click();
  await page.getByLabel("Date and time").fill("2030-01-15T10:00");
  await page.getByLabel("Where").fill("Video call, link by email");
  await page.getByRole("button", { name: "Add interview" }).click();
  await expect(toast(page, "Interview added.")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Add to calendar/ }).click()]);
  const ics = readFileSync((await download.path())!, "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toMatch(/DTSTART:20300115T100000Z/);
  expect(ics).toContain("LOCATION:Video call\\, link by email");

  for (const [to, message] of [
    ["interviewing", "Screening → Interviewing"],
    ["offer", "Interviewing → Offer"],
    ["rejected", "Offer → Rejected"],
  ] as const) {
    await chooseOption(page.getByLabel("Stage", { exact: true }), to[0].toUpperCase() + to.slice(1));
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect(toast(page, message)).toBeVisible();
  }
  // Reopening a closed application is allowed, and recorded as such.
  await chooseOption(page.getByLabel("Stage", { exact: true }), "Interviewing");
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(toast(page, "Reopened: Rejected → Interviewing")).toBeVisible();
  await expect(page.getByText("Reopened: Rejected → Interviewing").last()).toBeVisible();

  // 5. A note on the timeline, and offered pay kept as entered.
  await page.getByLabel("Note", { exact: true }).fill("Asked about the team's on-call rotation");
  await page.getByRole("button", { name: "Add to timeline" }).click();
  await expect(toast(page, "Note added.")).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("85000");
  await page.getByLabel("Currency", { exact: true }).fill("CAD");
  await chooseOption(page.getByLabel("Per", { exact: true }), "year");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(toast(page, "Saved.")).toBeVisible();
  await expect(page.getByText("Offered CAD 85,000 / year")).toBeVisible();

  // 6. A reminder shows on the Overview.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T09:00`;
  await page.getByLabel("Remind me to").fill("Send a thank-you note");
  await page.getByLabel("When", { exact: true }).fill(local);
  await page.getByRole("button", { name: "Add reminder" }).click();
  await expect(toast(page, "Reminder added.")).toBeVisible();
  await page.goto("/overview");
  const due = page.getByRole("region", { name: "Reminders due this week" });
  await expect(due.getByText("Send a thank-you note")).toBeVisible();
  await due.getByRole("button", { name: "Mark done: Send a thank-you note" }).click();
  await expect(toast(page, "Reminder done.")).toBeVisible();
});

test("the tracker needs sign-in, and other users' applications aren't reachable", async ({ page, request }) => {
  const res = await request.get("/api/applications/00000000-0000-4000-8000-000000000000/interviews");
  expect(res.status()).toBe(401);
  await signIn(page, uniqueEmail("apps-other"), "/applications");
  await page.goto("/applications/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
