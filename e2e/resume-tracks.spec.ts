import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/** Two resume tracks: import each, see both fits on a job, switch, and download a base resume. Uses the fictional job fixtures. */

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

const MAIN = `Jamie Rivera
Vancouver, BC | jamie@example.test | 604-555-0123
SUMMARY
Developer who builds web apps.
EXPERIENCE
Maple Labs | Developer Intern    May 2024 – Aug 2024
• Built internal dashboards in React for the support team
EDUCATION
Simon Fraser University    2021 – 2025
Bachelor of Science in Computing Science
SKILLS
React, TypeScript, SQL`;

const DATA = `Jamie Rivera
Vancouver, BC | jamie@example.test | 604-555-0123
SUMMARY
Analyst who turns data into decisions.
EXPERIENCE
Maple Labs | Data Analyst Intern    May 2024 – Aug 2024
• Built reports in Python and SQL for the support team
EDUCATION
Simon Fraser University    2021 – 2025
Bachelor of Science in Computing Science
SKILLS
Python, SQL, Pandas, Statistics`;

async function importPasted(page: Page, text: string, track: string) {
  await page.goto("/jobs/resume");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Your resume, as text").fill(text);
  await page.getByLabel("Track (optional)").fill(track);
  await page.getByRole("button", { name: /Import (new version|resume)/ }).click();
  await expect(toast(page, /Resume imported/)).toBeVisible({ timeout: 30_000 });
}

test("keep two resume tracks, pick one per job and download a base resume", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, uniqueEmail("tracks"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  await importPasted(page, MAIN, "");
  await importPasted(page, DATA, "Data");

  // The resume page lists both tracks and each downloads as PDF and Word.
  await page.goto("/jobs/resume?track=Data");
  const tracks = page.getByRole("navigation", { name: "Resume tracks" });
  await expect(tracks.getByRole("link", { name: "Main" })).toBeVisible();
  await expect(tracks.getByRole("link", { name: "Data" })).toHaveAttribute("aria-current", "page");
  const pdf = await page.request.get((await page.getByRole("link", { name: "Download PDF" }).getAttribute("href"))!);
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const docx = await page.request.get((await page.getByRole("link", { name: "Download Word" }).getAttribute("href"))!);
  expect(docx.headers()["content-type"]).toContain("wordprocessingml");

  // A job shows both tracks, suggests one, and switching changes which is in use.
  await page.goto("/jobs?q=Developer&range=any");
  await page.getByRole("listitem").filter({ hasText: "Northwind Labs" }).first().getByRole("link").first().click();
  const card = page.getByRole("list", { name: "Resume tracks" });
  await expect(card).toBeVisible();
  await expect(card.getByText("In use for this job")).toHaveCount(1);
  await expect(card.getByText("Main", { exact: true })).toBeVisible();
  await expect(card.getByText("Data", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Use Data for this job" }).click();
  await expect(toast(page, "Using your Data resume for this job.")).toBeVisible();
  await expect(card.getByRole("listitem").filter({ hasText: "Data" }).getByText("In use for this job")).toBeVisible();
  await page.reload();
  await expect(card.getByRole("listitem").filter({ hasText: "Data" }).getByText("In use for this job")).toBeVisible();
});
