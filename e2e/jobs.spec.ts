import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestRows, signIn, uniqueEmail } from "./helpers";

/**
 * Jobs end to end against fictional employer boards, a fictional Jobicy feed, a stand-in
 * embedder and canned AI answers: no keys, no network. The dev server must run with
 * JOBS_FIXTURES=1 (the Playwright config sets it when it starts the server); otherwise
 * this test is skipped.
 */

/** A resume with two email addresses, so one field needs the user's check. */
const AMBIGUOUS = `Jamie Rivera
Vancouver, BC | jamie@example.test | jamie.rivera@school.example.test | 604-555-0123
EXPERIENCE
Maple Labs | Developer Intern    May 2024 – Aug 2024
• Built internal dashboards in React for the support team
EDUCATION
Simon Fraser University    2021 – 2025
Bachelor of Science in Computing Science
SKILLS
React, Python, SQL`;

const toast = (page: Page, text: string | RegExp) => page.getByTestId("toast").filter({ hasText: text });

test("import, review, search verified jobs, improvement notes, AI tailoring and its honest fallbacks", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, uniqueEmail("jobs"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  // 1. The crawler reads the employers' boards (here, on demand).
  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  // 2. A pasted resume with an uncertain field: it's marked, and stays marked until checked.
  await page.goto("/jobs/resume");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Your resume, as text").fill(AMBIGUOUS);
  await page.getByRole("button", { name: "Import resume" }).click();
  await expect(toast(page, "Resume imported, but 1 field needs verification.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Resume imported successfully." })).toBeVisible();
  await expect(page.getByText("1 field needs your attention.")).toBeVisible();
  const email = page.locator("#field-email");
  await expect(email.getByText("Needs review")).toBeVisible();
  await expect(email.getByText(/We found 2 email addresses/)).toBeVisible();
  await email.getByRole("button", { name: "Looks right" }).click();
  // Toasts can be dismissed (before this one times out on its own).
  const marked = toast(page, "Marked as checked.");
  await expect(marked).toBeVisible();
  // Hovering (or F6 for keyboard users) expands the stack and exposes each toast's close button.
  await marked.hover();
  await marked.getByRole("button", { name: "Dismiss notification" }).click({ timeout: 4000 });
  await expect(marked).toHaveCount(0);
  await expect(email.getByText("Needs review")).toHaveCount(0);

  // 3. A PDF: read without AI, missing LinkedIn said plainly, the original kept to download.
  await page.getByRole("tab", { name: "Upload a file" }).click();
  await page.getByLabel("A new version (PDF or Word)").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: readFileSync("e2e/fixtures/sample-resume.pdf") });
  await page.getByRole("button", { name: "Import new version" }).click();
  await expect(toast(page, "Resume imported successfully. We filled 19 profile fields.")).toBeVisible({ timeout: 30_000 });
  await expect(toast(page, "We couldn't find a LinkedIn profile in your resume. You can add it manually.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Sample");
  await expect(page.locator("#field-contact-linkedin").getByText("Not found in your resume.")).toBeVisible();
  await expect(page.getByText("Profile completeness")).toBeVisible();
  const [original] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).first().click()]);
  expect(readFileSync((await original.path())!).subarray(0, 5).toString()).toBe("%PDF-");

  // 4. Search: verified listings only, the date range widens to every open posting (and says so), duplicates merged.
  await page.goto("/jobs?q=Developer");
  await expect(page.getByText(/Only \d+ verified jobs? (was|were) found in the last 7 days, so the search was expanded to any date\./).first()).toBeVisible();
  await expect(toast(page, /\d+ verified Developer jobs? found\./)).toBeVisible();
  // Sites the app can't read are one click away, with the same search.
  const elsewhere = page.getByRole("navigation", { name: "Search other job sites" });
  await expect(elsewhere.getByRole("link", { name: /^LinkedIn/ })).toHaveAttribute("href", /linkedin\.com\/jobs\/search\/\?keywords=Developer/);
  await expect(elsewhere.getByRole("link", { name: /^Indeed/ })).toHaveAttribute("href", /ca\.indeed\.com\/jobs\?q=Developer/);
  const results = page.getByRole("region", { name: /jobs from/i });
  const junior = results.getByRole("listitem").filter({ hasText: "Junior Software Developer" });
  // The card shows title, company and fit at a glance; source and verification are one click away under Details.
  await expect(junior.getByRole("link", { name: "Junior Software Developer" })).toBeVisible();
  await expect(junior.getByText("Northwind Labs", { exact: true })).toBeVisible();
  await expect(junior.getByText("Verified", { exact: true })).toBeHidden();
  await junior.getByText("Details", { exact: true }).click();
  await expect(junior.getByText("Verified", { exact: true })).toBeVisible();
  await expect(junior.getByText("Northwind Labs' job board")).toBeVisible();
  await expect(junior.locator('a[href="https://jobs.example.com/northwind-labs/jr-dev"]')).toBeVisible();
  // The "More" menu loads on first use, then lists what can be done with the posting.
  await junior.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: "Tailor Resume" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "View details" })).toHaveAttribute("href", /\/jobs\/[0-9a-f-]+$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Tailor Resume" })).toBeHidden();
  // A Jobicy listing isn't shown until its link is verified…
  await expect(results.getByText("Harbourview Software")).toHaveCount(0);
  await page.getByRole("link", { name: "Include listings not yet verified" }).click();
  const harbour = results.getByRole("listitem").filter({ hasText: "Harbourview Software" });
  // …and when included, Apply stays off and only its stated pay is shown.
  await expect(harbour.getByText("Not yet verified", { exact: true })).toBeVisible();
  await expect(harbour.locator('[aria-disabled="true"]', { hasText: "Apply" })).toBeVisible();
  await expect(harbour.locator('a[href*="jobs.example.com"]')).toHaveCount(0);
  await expect(harbour.getByText("CA$70,000–CA$85,000 per year")).toBeVisible();
  // It says where it came from, and links nowhere until verified (never to a guessed employer page).
  await harbour.getByText("Details", { exact: true }).click();
  await expect(harbour.getByText("Jobicy", { exact: true })).toBeVisible();
  // The same Northwind job relisted on Jobicy is merged into the board's listing, whose link wins.
  await expect(junior.getByText("Also listed on Jobicy")).toBeVisible();
  await expect(junior.locator('a[href*="/jobicy/"]')).toHaveCount(0);

  // 5. A job the resume doesn't meet is set aside, with reasons.
  await page.goto("/jobs?q=Engineer&level=&tab=excluded");
  await page.getByRole("link", { name: "Senior Embedded Software Engineer" }).click();
  await expect(page.getByText("Why it was set aside")).toBeVisible();
  await expect(page.getByText(/Asks for 7 years/).first()).toBeVisible();

  // 6. Improvement Notes: advice only, with the gaps named honestly (AI use 1 of 3).
  await page.getByRole("button", { name: "Get Resume Improvement Notes" }).click();
  await expect(toast(page, /resume improvement suggestions? found|already a strong match/)).toBeVisible({ timeout: 30_000 });
  const notes = page.locator("#notes");
  await expect(notes.getByText("Not found in resume", { exact: true })).toBeVisible();
  await expect(notes.getByText("C++ is listed as a required qualification, but it was not found in your resume. Do not add it unless you genuinely have that experience.")).toBeVisible();
  await expect(notes.getByText(/Analysis only: your resume was not changed/)).toBeVisible();
  // The canned AI note that suggests adding Kubernetes was rejected.
  await expect(notes.getByText("Add Kubernetes to your skills.")).toHaveCount(0);

  // 7. Tailor anyway with AI (use 2 of 3): rewritten, checked, compared; nothing invented.
  await page.getByRole("button", { name: "Tailor anyway" }).click();
  await expect(page.getByText(/Nothing you don't have will be/)).toBeVisible();
  await page.getByRole("button", { name: "Tailor Resume" }).click();
  await expect(toast(page, /Your resume was tailored, but \d+ job requirements? (was|were) not found in your experience\.|Your tailored resume is ready\./)).toBeVisible({ timeout: 60_000 });
  const docs = page.locator("#documents");
  await expect(docs.getByText("AI Tailored").first()).toBeVisible();
  await expect(docs.getByText("Keyword match").first()).toBeVisible();
  await expect(docs.getByText(/^Missing requirement: /).first()).toBeVisible();
  await expect(docs.getByText(/The accuracy check changed \d+ lines?/).first()).toBeVisible();
  const bullets = await page.getByRole("textbox", { name: /^Bullet \d+ for/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value).join("\n"));
  expect(bullets).toContain("as Software Developer Co-op at Harbour Software");
  expect(bullets).not.toMatch(/Kubernetes|C\+\+|RTOS|P\.Eng/);

  // 8. Edit a line, save, and download both formats.
  await page.getByRole("textbox", { name: /^Bullet 1 for Harbour Software/ }).fill("Built REST APIs in Python and Flask for 3 internal teams");
  await page.getByRole("button", { name: "Save edits" }).first().click();
  await expect(toast(page, "Saved your edits.")).toBeVisible();
  for (const [label, magic] of [
    ["PDF", "%PDF-"],
    ["Word (DOCX)", "PK"],
  ] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), docs.getByRole("link", { name: label }).first().click()]);
    expect(download.suggestedFilename()).toMatch(/^Alex-Sample-Resume-Fraser-Robotics\.(pdf|docx)$/);
    expect(readFileSync((await download.path())!).subarray(0, magic.length).toString()).toBe(magic);
  }

  // 9. Track it, with Undo.
  await page.getByRole("button", { name: "I applied" }).click();
  await expect(toast(page, "Application marked as applied.")).toBeVisible();

  // 10. A rewrite the AI can't make meaningful without inventing details: nothing is saved (use 3 of 3).
  await page.goto("/jobs?q=Firmware&level=");
  await page.getByRole("link", { name: "Firmware Developer Co-op" }).click();
  if (await page.getByRole("button", { name: "Tailor anyway" }).isVisible()) await page.getByRole("button", { name: "Tailor anyway" }).click();
  await page.getByRole("button", { name: "Tailor Resume" }).click();
  await expect(toast(page, "We couldn't produce a meaningful rewrite without inventing details. Your original resume was not changed.")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#notes").getByText(/no tailored version was saved/)).toBeVisible();
  await expect(page.locator("#documents").getByText("AI Tailored")).toHaveCount(0);

  // 11. Today's free AI uses are spent: Improvement Notes instead, with the ways forward.
  await page.goto("/jobs?q=Full+Stack&level=");
  await results.getByRole("link", { name: "Full Stack Developer" }).first().click();
  if (await page.getByRole("button", { name: "Tailor anyway" }).isVisible()) await page.getByRole("button", { name: "Tailor anyway" }).click();
  await page.getByRole("button", { name: "Tailor Resume" }).click();
  await expect(toast(page, "Your free AI tailoring limit has been reached for today. We haven't modified your resume.")).toBeVisible({ timeout: 60_000 });
  const banner = page.locator("#notes").getByRole("note");
  for (const action of ["View Improvement Notes", "Try AI Tailoring Again Later", "Keep Original Resume"]) await expect(banner.getByRole("button", { name: action })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Use My Own AI Key" })).toHaveAttribute("href", "/settings#ai-key");
  await expect(page.locator("#documents").getByText("AI Tailored")).toHaveCount(0);

  // 12. Versions: the tailored resume sits beside the original; compare, delete with Undo.
  await page.goto("/jobs/resume");
  const version = page.getByRole("listitem").filter({ hasText: "Tailored Resume — Fraser Robotics" });
  await expect(version).toBeVisible();
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByRole("list", { name: "Differences" })).toBeVisible();
  await version.getByRole("button", { name: /^Delete/ }).click();
  await toast(page, "Version deleted.").getByRole("button", { name: "Undo" }).click();
  await expect(toast(page, "Version restored.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Tailored Resume — Fraser Robotics" })).toBeVisible();

  // 13. Anyone can add an employer by its board link; the directory is shared.
  await page.goto("/jobs/employers");
  const token = `e2e-${Date.now()}`;
  await page.getByLabel("Employer").fill("E2E Robotics");
  await page.getByLabel("Careers page or job board").fill(`https://jobs.lever.co/${token}`);
  await page.getByRole("button", { name: "Add employer" }).click();
  await expect(page.getByTestId("form-status").filter({ hasText: /^Added\./ })).toBeVisible();
  await page.getByLabel("Employer").fill("E2E Robotics");
  await page.getByLabel("Careers page or job board").fill(`https://jobs.lever.co/${token}/some-job`);
  await page.getByRole("button", { name: "Add employer" }).click();
  await expect(page.getByTestId("form-status").filter({ hasText: "E2E Robotics is already in the directory." })).toBeVisible();
  // The directory is shared: leave no test employer behind.
  await deleteTestRows("employers", { board_token: `eq.${token}` });
});

test("pasting a whole job page fills the posting form", async ({ page }) => {
  await signIn(page, uniqueEmail("paste"), "/jobs/add");
  const pageText = ["Home", "Jobs", "Harbourview Health", "Registered Nurse - Emergency", "Vancouver, BC · 3 days ago · 48 applicants", "About the job", "We're hiring a Registered Nurse for our emergency department.", "• BLS and ACLS certification", "Show more"].join("\n");
  await page.getByLabel("Quick fill: paste the whole job page (optional)").fill(pageText);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Filled job title, company, city, Canada, posting text/ })).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveValue("Registered Nurse - Emergency");
  await expect(page.getByLabel("Company")).toHaveValue("Harbourview Health");
  await expect(page.getByLabel("City")).toHaveValue("Vancouver");
  // Country and province are select controls (a button on desktop, a native select on phones): check what they show.
  await expect(page.getByLabel("Country")).toContainText("Canada");
  await expect(page.getByLabel("Province (jobs in Canada)")).toContainText("British Columbia");
  await expect(page.getByLabel("Posting text")).toHaveValue(/BLS and ACLS certification/);
});
