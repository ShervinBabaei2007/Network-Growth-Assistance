import { expect, test } from "@playwright/test";
import { adminRest, signIn, userIdFor } from "./helpers";
import { day, dropFixtureNotes, freshAccount, shot, tidy, toTop } from "./readme-kit";

/**
 * More README pictures, for the pages added after the first set: the home page, the sign-in tabs, Follow-ups, Interview prep,
 * Compare jobs and Resume tracks. Same rules as readme-screenshots.spec.ts: `npm run docs:screenshots`, fictional data only,
 * not a test of behaviour.
 */

const tag = Date.now() % 10_000;

test.describe.configure({ mode: "serial" });

test("home page and sign-in tabs", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, baseURL: test.info().project.use.baseURL });
  await tidy(context);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "home");
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("tab", { name: "Sign in" }).first()).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "login");
  await context.close();
});

test("follow-ups and interview prep", async ({ page }) => {
  await tidy(page.context());
  const email = await freshAccount("casey.lin");
  await signIn(page, email);
  const user_id = await userIdFor(email);

  // Two people who accepted an invitation: one today, one ten days ago.
  for (const [name, ago] of [["Maya Chen", 0], ["Daniel Okafor", 10]] as const) {
    const key = `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${tag}`;
    const [c] = (await adminRest("POST", "candidates", [{ user_id, full_name: name, profile_url: `https://www.linkedin.com/in/${key}`, profile_key: key, status: "connected" }])) as { id: string }[];
    await adminRest("POST", "invitations", [{ user_id, candidate_id: c.id, sent_at: day(ago + 3), outcome: "accepted", resolved_at: day(ago) }]);
  }
  await page.goto("/follow-ups");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "follow-ups");

  // An application in interviewing, with the resume lines and posting requirements the prep pack is built from.
  const line = (id: string, org: string, title: string, bullets: string[]) => ({
    id, organization: org, title, start: null, end: null, location: null, degree: null, major: null, graduation: null,
    bullets: bullets.map((text, i) => ({ id: `${id}-b${i + 1}`, text })),
  });
  await adminRest("POST", "resumes", [
    {
      user_id, label: "Main", raw_text: "Resume text", parsed_with: "heuristic", is_active: true,
      profile: {
        name: null, email: null, phone: null, location: null, links: [], summary: null, education: [], skills: [], certifications: [],
        experience: [line("e1", "Harbourview Software", "Developer", ["Led a team of four to build a booking system in React and Node.js", "Reduced page load time by 40% by tuning database queries"])],
        projects: [line("p1", "Side project", "Builder", ["Learned Python in two weeks to automate weekly reports"])],
      },
    },
  ]);
  const jobTag = `prep-${Date.now()}`;
  const [job] = (await adminRest("POST", "jobs", [{ user_id, source: "manual", external_id: jobTag, title: "Frontend Developer", company: "Northwind Labs", apply_url: `https://jobs.example.com/${jobTag}`, posted_at: new Date().toISOString() }])) as { id: string }[];
  await adminRest("POST", "job_requirements", [
    { job_id: job.id, idx: 0, text: "Experience with React and TypeScript", kind: "must", category: "skill" },
    { job_id: job.id, idx: 1, text: "Kubernetes experience", kind: "must", category: "skill" },
    { job_id: job.id, idx: 2, text: "Bachelor's degree in computer science", kind: "nice", category: "education" },
  ]);
  const [app] = (await adminRest("POST", "applications", [{ user_id, job_id: job.id, title: "Frontend Developer", company: "Northwind Labs", stage: "interviewing", apply_url: "https://jobs.example.com/x" }])) as { id: string }[];
  await adminRest("POST", "application_interviews", [{ user_id, application_id: app.id, starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), timezone: "America/Vancouver", kind: "video", duration_minutes: 45 }]);
  await page.goto(`/applications/${app.id}/prep`);
  await expect(page.getByRole("heading", { name: "Interview prep", level: 1 })).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "interview-prep");
});

const MAIN = `Jamie Rivera
Vancouver, BC | jamie@example.com | 604-555-0123
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
Vancouver, BC | jamie@example.com | 604-555-0123
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

test("jobs: compare two jobs and keep a resume per kind of role", async ({ page }) => {
  test.setTimeout(240_000);
  await tidy(page.context());
  await signIn(page, await freshAccount("riley.stone"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Run the dev server with JOBS_FIXTURES=1");
  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  // Compare two jobs side by side (before a resume is imported, so the list isn't narrowed to one level).
  await page.goto("/jobs?q=Developer&range=any");
  const items = page.getByRole("region", { name: /jobs from/i }).getByRole("listitem");
  await expect(items.first()).toBeVisible();
  await dropFixtureNotes(page);
  await items.nth(0).getByLabel(/^Compare /).check();
  await items.nth(1).getByLabel(/^Compare /).check();
  await page.getByTestId("compare-bar").getByRole("link", { name: "Compare" }).click();
  await expect(page.getByRole("table", { name: "Jobs compared side by side" })).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "jobs-compare");

  const importPasted = async (text: string, track: string) => {
    await page.goto("/jobs/resume");
    await page.getByRole("tab", { name: "Paste text" }).click();
    await page.getByLabel("Your resume, as text").fill(text);
    await page.getByLabel("Track (optional)").fill(track);
    await page.getByRole("button", { name: /Import (new version|resume)/ }).click();
    await expect(page.getByTestId("toast").filter({ hasText: /Resume imported/ })).toBeVisible({ timeout: 30_000 });
  };
  await importPasted(MAIN, "");
  await importPasted(DATA, "Data");

  // Resume tracks: a job shows how each resume fits and which to use.
  await page.goto("/jobs?q=Developer&range=any");
  await page.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first().getByRole("link").first().click();
  const card = page.getByRole("list", { name: "Resume tracks" });
  await expect(card).toBeVisible();
  await toTop(card, 270);
  await page.waitForTimeout(1200);
  await shot(page, "resume-tracks");
});
