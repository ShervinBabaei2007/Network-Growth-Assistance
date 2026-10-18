import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

const entry = (id: string, organization: string, title: string, bullets: string[]) => ({
  id,
  organization,
  title,
  start: null,
  end: null,
  location: null,
  bullets: bullets.map((text, i) => ({ id: `${id}-b${i + 1}`, text })),
  degree: null,
  major: null,
  graduation: null,
});

/** A user with a resume, a posting with requirements, and an application in interviewing with an interview booked. */
async function setUp(email: string, options: { resume?: boolean; job?: boolean } = {}) {
  const { resume = true, job = true } = options;
  const user_id = await userIdFor(email);
  if (resume) {
    await adminRest("POST", "resumes", [
      {
        user_id,
        label: "Main",
        raw_text: "Resume text",
        parsed_with: "heuristic",
        is_active: true,
        profile: {
          name: null, email: null, phone: null, location: null, links: [], summary: null, education: [], skills: [], certifications: [],
          experience: [entry("e1", "Acme", "Developer", ["Led a team of four to build a booking system in React and Node.js", "Reduced page load time by 40% by optimizing database queries"])],
          projects: [entry("p1", "Side project", "Builder", ["Learned Python in two weeks to automate weekly reports"])],
        },
      },
    ]);
  }
  let job_id: string | null = null;
  if (job) {
    const tag = `prep-${Date.now()}`;
    const [j] = (await adminRest("POST", "jobs", [{ user_id, source: "manual", external_id: tag, title: "Frontend Developer", company: "Northwind", apply_url: `https://jobs.example.com/${tag}`, posted_at: new Date().toISOString() }])) as { id: string }[];
    job_id = j.id;
    await adminRest("POST", "job_requirements", [
      { job_id, idx: 0, text: "Experience with React and TypeScript", kind: "must", category: "skill" },
      { job_id, idx: 1, text: "Kubernetes experience", kind: "must", category: "skill" },
      { job_id, idx: 2, text: "Bachelor's degree in computer science", kind: "nice", category: "education" },
    ]);
  }
  const [app] = (await adminRest("POST", "applications", [{ user_id, job_id, title: "Frontend Developer", company: "Northwind", stage: "interviewing", apply_url: job_id ? `https://jobs.example.com/x` : null }])) as { id: string }[];
  await adminRest("POST", "application_interviews", [{ user_id, application_id: app.id, starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), timezone: "America/Vancouver", kind: "video", duration_minutes: 45 }]);
  return app.id;
}

test("the prep pack matches the user's own resume lines to questions and never invents", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const email = uniqueEmail("prep");
  await signIn(page, email);
  const id = await setUp(email);

  // The application page offers it.
  await page.goto(`/applications/${id}`);
  await page.getByRole("link", { name: "Interview prep" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/prep`));
  await expect(page.getByRole("heading", { name: "Interview prep", level: 1 })).toBeVisible();

  // Likely topics come from the posting.
  await expect(page.getByText("Experience with React and TypeScript").first()).toBeVisible();

  // Stories are the user's own words, shown with where they came from.
  const team = page.getByTestId("prep-question").filter({ hasText: "worked in or led a team" });
  await expect(team.getByTestId("prep-story")).toContainText("Led a team of four to build a booking system");
  await expect(team).toContainText("From your resume: Developer, Acme");

  // A requirement with no matching line says so instead of making something up.
  const k8s = page.getByTestId("prep-question").filter({ hasText: "Kubernetes" });
  await expect(k8s.getByTestId("prep-story")).toHaveCount(0);
  await expect(k8s).toContainText("be honest about the gap");
  const react = page.getByTestId("prep-question").filter({ hasText: "React and TypeScript" });
  await expect(react.getByTestId("prep-story").first()).toContainText("React");

  // The day-of checklist uses the booked interview.
  await expect(page.getByText(/Confirm the time:/)).toBeVisible();

  // Every company link comes from the saved posting; nothing else is claimed.
  await expect(page.getByRole("link", { name: /The posting you saved/ })).toHaveAttribute("href", /jobs\.example\.com/);
  await expect(page.getByText("Nothing was added about the company")).toBeVisible();

  // Export: copy as Markdown, then save a copy to the timeline.
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("# Interview prep: Frontend Developer at Northwind");
  await page.getByRole("button", { name: "Save to timeline" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Saved to the timeline." })).toBeVisible();
  await page.goto(`/applications/${id}`);
  await expect(page.getByText("Saved an interview prep pack.")).toBeVisible();
  await page.goto(`/applications/${id}/prep`);
  await expect(page.getByText(/^Saved .*20\d\d|Saved /).first()).toBeVisible();
});

test("without a resume or a posting it says what is missing", async ({ page }) => {
  const email = uniqueEmail("prep-bare");
  await signIn(page, email);
  const id = await setUp(email, { resume: false, job: false });
  await page.goto(`/applications/${id}/prep`);
  await expect(page.getByText("You haven't added a resume")).toBeVisible();
  await expect(page.getByText("isn't linked to a saved posting")).toBeVisible();
  await expect(page.getByTestId("prep-story")).toHaveCount(0);
});

test("only the owner can open a prep pack", async ({ page, browser }) => {
  const owner = uniqueEmail("prep-owner");
  await signIn(page, owner);
  const id = await setUp(owner);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, uniqueEmail("prep-other"));
  await other.goto(`/applications/${id}/prep`);
  // The page streams, so the status is already 200; what matters is that nothing of the owner's is shown.
  await expect(other.getByRole("heading", { name: /not found|doesn.t exist|can.t find/i }).first()).toBeVisible();
  await expect(other.getByText("Northwind")).toHaveCount(0);
  await expect(other.getByTestId("prep-question")).toHaveCount(0);
  await ctx.close();
});

test("the prep page has no serious accessibility violations", async ({ page }) => {
  const email = uniqueEmail("prep-axe");
  await signIn(page, email);
  const id = await setUp(email);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/applications/${id}/prep`);
    await expect(page.getByTestId("prep-question").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`), scheme).toEqual([]);
  }
});
