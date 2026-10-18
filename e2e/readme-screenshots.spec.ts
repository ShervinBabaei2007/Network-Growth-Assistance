import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { adminRest, setUpPlan, signIn, userIdFor } from "./helpers";

/**
 * Takes the pictures used in README.md, from the real app with fictional data:
 * `npm run docs:screenshots` (needs `npm run db:start`). Not part of the normal e2e run.
 * Nothing here is a test of behaviour; the other specs cover that.
 */

const OUT = "docs/images";
const shot = (page: Page, name: string, options: { fullPage?: boolean } = {}) => page.screenshot({ path: `${OUT}/${name}.png`, ...options });
const stamp = Date.now();
const tag = stamp % 10_000;
/** Scrolls so the element sits at the top of the page, under the sticky header. */
const toTop = async (locator: Locator, offset = 96) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await locator.page().evaluate((o) => window.scrollBy(0, -o), offset);
};
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = [name: string, school: number, program: number, state: "connected" | "pending" | "approved" | "review", role: string, ago: number];
const SCHOOLS = ["University of British Columbia", "Simon Fraser University", "University of Waterloo"];
const PROGRAMS = ["Computer Science", "Electrical Engineering", "Mechanical Engineering"];
const PEOPLE: Row[] = [
  ["Maya Chen", 0, 0, "connected", "Software Engineer at Shopify", 41],
  ["Daniel Okafor", 0, 0, "connected", "Backend Developer at Hootsuite", 38],
  ["Priya Nair", 0, 0, "connected", "ML Engineer at Microsoft", 33],
  ["Lucas Tremblay", 0, 0, "pending", "Student, 4th year", 6],
  ["Hannah Weiss", 0, 1, "connected", "Hardware Engineer at Tesla", 36],
  ["Omar Haddad", 0, 1, "connected", "Embedded Developer at Sierra Wireless", 30],
  ["Sophie Martin", 0, 1, "approved", "Student, 3rd year", 0],
  ["Ethan Brooks", 0, 2, "connected", "Design Engineer at Ballard Power", 29],
  ["Aisha Rahman", 0, 2, "pending", "Mechanical Intern at Bombardier", 4],
  ["Noah Kim", 1, 0, "connected", "Software Developer at Amazon", 40],
  ["Chloe Dubois", 1, 0, "connected", "Frontend Engineer at Clio", 35],
  ["Arjun Mehta", 1, 0, "connected", "Data Engineer at TELUS", 27],
  ["Emma Wilson", 1, 0, "connected", "QA Engineer at Absolute", 22],
  ["Liam Novak", 1, 0, "pending", "Student, 4th year", 5],
  ["Zoe Fraser", 1, 1, "connected", "Systems Engineer at MDA", 34],
  ["Mateo Silva", 1, 1, "connected", "Power Engineer at BC Hydro", 25],
  ["Grace Liu", 1, 1, "pending", "Student, 3rd year", 3],
  ["Isaac Grant", 1, 2, "connected", "Mechanical Designer at Westport", 31],
  ["Nina Petrova", 1, 2, "approved", "Student, 2nd year", 0],
  ["Owen Campbell", 2, 0, "connected", "Software Engineer at Google", 39],
  ["Fatima Khan", 2, 0, "connected", "SRE at Cloudflare", 37],
  ["Jack Murphy", 2, 0, "connected", "Full-Stack Developer at Wealthsimple", 32],
  ["Layla Ahmed", 2, 0, "connected", "Firmware Engineer at Apple", 28],
  ["Ben Carter", 2, 0, "pending", "Student, co-op", 7],
  ["Mei Tanaka", 2, 1, "connected", "Hardware Designer at AMD", 26],
  ["Sam Ortiz", 2, 1, "connected", "Controls Engineer at Magna", 21],
  ["Ruby Stewart", 2, 1, "review", "Engineering student", 0],
  ["Leo Santos", 2, 2, "connected", "Product Engineer at Bombardier", 24],
  ["Ivy Nguyen", 2, 2, "approved", "Student, 3rd year", 0],
  ["Kai Anderson", 0, 0, "approved", "Student, 4th year", 0],
];

const APPLICATIONS = [
  ["Frontend Developer", "Northwind Labs", "Vancouver, BC", "saved"],
  ["Platform Engineer", "Contoso Cloud", "Remote, Canada", "saved"],
  ["Junior Software Developer", "Maple Commerce", "Toronto, ON", "applied"],
  ["Full Stack Developer", "Fraser Robotics", "Burnaby, BC", "applied"],
  ["QA Automation Engineer", "Harbourview Software", "Remote, Canada", "screening"],
  ["Software Engineer, New Grad", "Pacific Data", "Vancouver, BC", "interviewing"],
  ["Backend Developer", "Aurora Health", "Calgary, AB", "interviewing"],
  ["Software Developer", "Tidewater Systems", "Victoria, BC", "offer"],
  ["Application Developer", "Cedar Insurance", "Ottawa, ON", "rejected"],
] as const;

/** Pictures show the page, not the "saved" and "found" pop-ups that appear while it loads. */
const hideToasts = (context: BrowserContext) =>
  context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = '[data-testid="toast"], [data-slot="toast-region"] { opacity: 0 !important; pointer-events: none !important; }';
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
  });

test.describe.configure({ mode: "serial" });

test("overview, analytics, candidates, applications and a phone", async ({ page, browser }) => {
  const email = `alex.morgan${tag}@example.test`;
  await hideToasts(page.context());
  await signIn(page, email);
  await setUpPlan(page, {
    goal: 500,
    schools: SCHOOLS.map((name) => ({ name })),
    disciplines: PROGRAMS.map((name) => ({ name })),
    targets: {
      "Computer Science": { total: 60, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 20])) },
      "Electrical Engineering": { total: 40, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 14])) },
      "Mechanical Engineering": { total: 30, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 10])) },
    },
  });

  const user_id = await userIdFor(email);
  await adminRest("PATCH", `settings?user_id=eq.${user_id}`, { baseline_connections: 312, project_start_date: day(60).slice(0, 10) });
  const unis = (await adminRest("GET", `universities?user_id=eq.${user_id}&select=id,name`)) as { id: string; name: string }[];
  const discs = (await adminRest("GET", `disciplines?user_id=eq.${user_id}&select=id,name`)) as { id: string; name: string }[];
  const uni = (i: number) => unis.find((u) => u.name === SCHOOLS[i])!.id;
  const disc = (i: number) => discs.find((d) => d.name === PROGRAMS[i])!.id;
  const status = { connected: "connected", pending: "invitation_pending", approved: "approved", review: "awaiting_review" } as const;
  const candidates = (await adminRest(
    "POST",
    "candidates",
    PEOPLE.map(([name, s, p, state, role]) => ({
      user_id,
      full_name: name,
      profile_url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\W+/g, "-")}-${stamp % 1000}`,
      profile_key: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp % 1000}`,
      role,
      university: state === "review" ? null : uni(s),
      discipline: state === "review" ? null : disc(p),
      university_confidence: state === "review" ? "needs_review" : "confirmed",
      discipline_confidence: state === "review" ? "needs_review" : "confirmed",
      status: status[state],
    })),
  )) as { id: string; full_name: string }[];
  const invitations = PEOPLE.flatMap(([name, , , state, , ago]) => {
    if (state !== "connected" && state !== "pending") return [];
    const c = candidates.find((x) => x.full_name === name)!;
    return [{ user_id, candidate_id: c.id, sent_at: day(ago), outcome: state === "connected" ? "accepted" : "pending", resolved_at: state === "connected" ? day(Math.max(ago - 3, 0)) : null }];
  });
  await adminRest("POST", "invitations", invitations);
  await adminRest("POST", "connection_snapshots", [
    { user_id, total_connections: 312, recorded_at: day(58) },
    { user_id, total_connections: 331, recorded_at: day(42) },
    { user_id, total_connections: 352, recorded_at: day(28) },
    { user_id, total_connections: 371, recorded_at: day(14) },
    { user_id, total_connections: 396, recorded_at: day(1) },
  ]);
  await adminRest(
    "POST",
    "applications",
    APPLICATIONS.map(([title, company, location, stage], i) => ({
      user_id,
      title,
      company,
      location,
      stage,
      source: "employer board",
      applied_on: stage === "saved" ? null : day(20 - i * 2).slice(0, 10),
      stage_changed_at: day(12 - i),
    })),
  );

  // The dashboard.
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /overview|progress/i }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "overview");
  // The detailed breakdown: pipeline, activity and each discipline against its target.
  await page.locator("[data-tour=breakdown]").evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await toTop(page.getByRole("heading", { name: "Pipeline" }), 120);
  await page.waitForTimeout(800);
  await shot(page, "overview-breakdown");
  // Each discipline against its own target; pending invitations are shown apart and never counted.
  await page.getByText("Discipline details").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 220));
  await page.waitForTimeout(800);
  await shot(page, "overview-disciplines");

  // Analytics (the charts load as they scroll into view).
  await page.goto("/analytics");
  await expect(() => page.getByRole("img", { name: "Recorded network total by date" }).scrollIntoViewIfNeeded()).toPass();
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await shot(page, "analytics");

  // Candidates, with Quick capture holding a pasted LinkedIn results page.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/candidates");
  const results = [
    ["Tara Singh", "tara-singh-a1", "Computer Science student at <strong>UBC</strong>"],
    ["Jonah Fisher", "jonah-fisher-b2", "Electrical Engineering | Simon Fraser University"],
    ["Amara Okoye", "amara-okoye-c3", "Mechanical Engineering student at <strong>University of Waterloo</strong>"],
    ["Felix Bauer", "felix-bauer-d4", "Computer Science | UBC | Software intern"],
    ["Nadia Ali", "nadia-ali-e5", "Computer Science at <strong>SFU</strong>, 3rd year"],
  ];
  const html = `<ul>${results.map(([n, k, h]) => `<li><a href="https://www.linkedin.com/in/${k}/"><span aria-hidden="true">${n}</span><span>View ${n}’s profile</span></a><div>${h}</div></li>`).join("")}</ul>`;
  await page.evaluate(async (h) => navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([h], { type: "text/html" }) })]), html);
  await page.getByLabel("Paste a LinkedIn search results page here").click();
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("School for Tara Singh")).toBeVisible();
  await page.waitForTimeout(1200);
  await toTop(page.getByText("Quick capture from LinkedIn search"), 100);
  await shot(page, "quick-capture");

  // The applications board.
  await page.goto("/applications");
  await expect(page.getByText("Northwind Labs").first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "applications");

  // Dark theme.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/overview");
  await page.waitForTimeout(1500);
  await shot(page, "overview-dark");
  await page.emulateMedia({ colorScheme: "light" });

  // A phone: the same account on a small screen.
  const state = await page.context().storageState();
  const phone = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
  await hideToasts(phone);
  const m = await phone.newPage();
  await m.goto("/overview");
  await m.waitForTimeout(1500);
  await shot(m, "mobile-overview");
  await m.goto("/candidates");
  await m.waitForTimeout(1000);
  await toTop(m.getByText(/^\d+ candidates?$/).first(), 76);
  await m.waitForTimeout(600);
  await shot(m, "mobile-candidates");
  await m.getByRole("button", { name: "Open menu" }).click();
  await expect(m.getByRole("dialog", { name: "Network Growth" })).toBeVisible();
  await m.waitForTimeout(600);
  await shot(m, "mobile-menu");
  await phone.close();
});

test("discover: people with quoted evidence", async ({ page, context }) => {
  await hideToasts(context);
  await signIn(page, `jordan.reyes${tag}@example.test`, "/discover");
  test.skip(!(await page.getByTestId("discovery-sources").textContent())?.includes("Fixture web"), "Run the dev server with DISCOVERY_FIXTURES=1");
  await setUpPlan(page, {
    schools: [{ name: "University of Toronto", aliases: "UofT, U of T" }],
    disciplines: [{ name: "Computer Engineering", aliases: "CompEng, comp eng" }],
  });
  await page.goto("/discover");
  await page.getByLabel("Who would you like to meet?").fill("Find 5 UofT Computer Engineering alumni working as software engineers in Canada");
  await page.getByRole("button", { name: "Find people" }).click();
  await page.waitForURL(/\/discover\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Research complete" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("article", { name: "Alex Chen" })).toBeVisible();
  // The test dataset labels itself; the picture shows the result.
  await page.evaluate(() => document.querySelectorAll("p").forEach((p) => (p.textContent = (p.textContent ?? "").replace(" (fixture: no canned answer)", ""))));
  await toTop(page.getByRole("heading", { name: /verified match/ }), 96);
  await page.waitForTimeout(1200);
  await shot(page, "discover");
  await page.getByRole("article", { name: "Alex Chen" }).getByRole("button", { name: "View evidence" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "discover-evidence");
});

test("jobs: verified postings with fit explained", async ({ page, browser }) => {
  await hideToasts(page.context());
  await signIn(page, `riley.park${tag}@example.test`, "/jobs");
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Run the dev server with JOBS_FIXTURES=1");
  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });
  await page.goto("/jobs/resume");
  await page.getByLabel("Your resume (PDF or Word)").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: readFileSync("e2e/fixtures/sample-resume.pdf") });
  await page.getByRole("button", { name: /^Import/ }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Sample", { timeout: 30_000 });
  await page.goto("/jobs?q=Developer");
  await expect(page.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await page.waitForTimeout(2500);
  // The test dataset labels itself; the picture shows the result.
  await page.evaluate(() => document.querySelectorAll("p").forEach((p) => p.textContent?.includes("JOBS_FIXTURES") && p.remove()));
  await toTop(page.getByRole("heading", { name: /jobs from/i }), 100);
  await page.waitForTimeout(600);
  await shot(page, "jobs");
  const phone = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
  await hideToasts(phone);
  const m = await phone.newPage();
  await m.goto("/jobs?q=Developer");
  await expect(m.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await toTop(m.getByRole("heading", { name: /jobs from/i }), 76);
  await m.waitForTimeout(800);
  await shot(m, "mobile-jobs");
  await phone.close();
  await page.goto("/jobs/resume");
  await page.waitForTimeout(1200);
  await shot(page, "resume");
});
