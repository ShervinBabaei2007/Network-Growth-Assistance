import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/**
 * Jobs end to end against fictional employer boards and a stand-in embedder: no keys,
 * no network. The dev server must run with JOBS_FIXTURES=1 (the Playwright config sets
 * it when it starts the server); otherwise this test is skipped.
 */

test("read employer boards, upload a resume, tailor anyway for free, download, and add an employer", async ({ page }) => {
  await signIn(page, uniqueEmail("jobs"), "/jobs");
  await expect(page.getByText("Postings from the last 24 hours", { exact: true })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  // 1. The crawler reads the employers' boards (here, on demand).
  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./)).toBeVisible({ timeout: 45_000 });
  await page.goto("/jobs/employers?q=Northwind");
  await expect(page.getByRole("cell", { name: "Northwind Labs" })).toBeVisible();

  // 2. Upload the resume: read for free, without AI.
  await page.goto("/jobs/resume");
  await page.getByLabel("Your resume (PDF)").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: readFileSync("e2e/fixtures/sample-resume.pdf") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("What your resume shows")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex Sample");

  // 3. The feed: recent Canadian jobs only, BC first, checked against the resume as you browse.
  await page.goto("/jobs");
  const feed = page.getByRole("region", { name: "Postings" });
  await expect(feed.getByRole("link", { name: "Junior Software Developer" })).toBeVisible();
  await expect(feed.getByText("Data Analyst")).toHaveCount(0);
  await expect(page.getByText("Cascade Cloud")).toHaveCount(0);
  const headings = await feed.getByRole("heading", { level: 3 }).allTextContents();
  expect(headings[0]).toMatch(/^British Columbia/);
  // Each posting says where it came from.
  await expect(feed.getByRole("listitem").filter({ hasText: "Junior Software Developer" }).getByText("Northwind Labs' job board")).toBeVisible();

  // Switching the time range shows older postings too (the 30-hour-old Data Analyst job).
  const count = async () => Number((await page.getByText(/^\d+ in British Columbia/).innerText()).match(/^\d+/)![0]);
  const dayCount = await count();
  await page.getByRole("navigation", { name: "Posted within" }).getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("heading", { name: "Postings from the past week" })).toBeVisible();
  expect(await count()).toBe(dayCount + 1);
  const tabs = page.getByRole("navigation", { name: "Fit" }).getByRole("link");
  let found = false;
  for (const name of await tabs.allInnerTexts()) {
    if (/Saved/.test(name)) continue;
    await tabs.filter({ hasText: name.split("(")[0].trim() }).first().click();
    if (await page.getByRole("link", { name: "Data Analyst" }).isVisible()) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  await page.getByRole("navigation", { name: "Posted within" }).getByRole("link", { name: "24 hours" }).click();
  await expect(page.getByRole("heading", { name: "Postings from the last 24 hours" })).toBeVisible();

  // 4. A job the resume doesn't meet is set aside, with reasons.
  await page.getByRole("link", { name: /Doesn't qualify/ }).click();
  await page.getByRole("link", { name: "Senior Embedded Software Engineer" }).click();
  await expect(page.getByText("Why it was set aside")).toBeVisible();
  await expect(page.getByText(/Asks for 7 years/).first()).toBeVisible();

  // 5. Tailor anyway, free: the person's own lines, and an honest gap in the letter.
  await page.getByRole("button", { name: "Tailor anyway" }).click();
  await expect(page.getByText(/Nothing you don't have will be added/)).toBeVisible();
  await page.getByRole("button", { name: "Tailor them anyway" }).click();
  // Wait for the documents themselves (the section heading above them is always there).
  await expect(page.getByRole("textbox", { name: /^Bullet \d+ for/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Free tailoring", { exact: true }).first()).toBeVisible();
  const bullets = await page.getByRole("textbox", { name: /^Bullet \d+ for/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  expect(bullets).toContain("Built REST APIs in Python and Flask used by 3 internal teams");
  expect(bullets.join(" ")).not.toMatch(/C\+\+|RTOS|P\.Eng/);
  const letter = await page.getByRole("textbox", { name: /^Paragraph \d+$/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value).join(" "));
  expect(letter).toContain("I haven't yet worked with");

  // 6. Edit a line, save, and download both formats.
  await page.getByRole("textbox", { name: /^Bullet 1 for Harbour Software/ }).fill("Built REST APIs in Python and Flask for 3 internal teams");
  await page.getByRole("button", { name: "Save edits" }).first().click();
  await expect(page.getByText("Saved your edits.")).toBeVisible();
  for (const [label, magic] of [
    ["PDF", "%PDF-"],
    ["Word (DOCX)", "PK"],
  ] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: label }).first().click()]);
    expect(download.suggestedFilename()).toMatch(/^Alex-Sample-Resume-Fraser-Robotics\.(pdf|docx)$/);
    expect(readFileSync((await download.path())!).subarray(0, magic.length).toString()).toBe(magic);
  }

  // 7. Optional AI rewording (canned answers here) still can't add what the resume lacks.
  await page.getByRole("button", { name: "Rewrite with AI" }).click();
  await expect(page.getByText("Reworded with AI").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/The accuracy check changed \d+ lines?/).first()).toBeVisible();
  const aiBullets = await page.getByRole("textbox", { name: /^Bullet \d+ for/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value).join(" "));
  expect(aiBullets).not.toContain("Kubernetes");

  // 8. Track it.
  await page.getByRole("button", { name: "I applied" }).click();
  await expect(page.getByText("Marked as applied.")).toBeVisible();
  await page.goto("/jobs?tab=saved");
  await expect(page.getByRole("link", { name: "Senior Embedded Software Engineer" })).toBeVisible();

  // 9. Anyone can add an employer by its board link; the directory is shared.
  await page.goto("/jobs/employers");
  const token = `e2e-${Date.now()}`;
  await page.getByLabel("Employer").fill("E2E Robotics");
  await page.getByLabel("Careers page or job board").fill(`https://jobs.lever.co/${token}`);
  await page.getByRole("button", { name: "Add employer" }).click();
  await expect(page.getByText(/^Added\./)).toBeVisible();
  await page.getByLabel("Employer").fill("E2E Robotics");
  await page.getByLabel("Careers page or job board").fill(`https://jobs.lever.co/${token}/some-job`);
  await page.getByRole("button", { name: "Add employer" }).click();
  await expect(page.getByText("E2E Robotics is already in the directory.")).toBeVisible();
});
