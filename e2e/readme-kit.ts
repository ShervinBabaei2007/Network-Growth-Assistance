import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { adminAuth, adminRest, setUpPlan, userIdFor } from "./helpers";

/**
 * Shared by the README pictures (readme-screenshots*.spec.ts) and the README tour (readme-video.spec.ts):
 * one set of fictional people, applications and plan, and the page clean-up both use. Not a test of behaviour.
 */

/** Raw captures land here; scripts/docs/frame-screenshots.mjs frames them into docs/images. */
export const RAW_SHOTS = "test-results/readme-shots";

export type ShotKind = "desktop" | "phone";

/**
 * Saves one raw picture and a note of the page it shows (for the address bar in its frame).
 * Desktop pictures are 1280x800 at 2x; phone pictures 390x844 at 3x.
 */
export async function shot(page: Page, name: string, kind: ShotKind = "desktop") {
  mkdirSync(RAW_SHOTS, { recursive: true });
  await page.screenshot({ path: `${RAW_SHOTS}/${name}.png` });
  const url = new URL(page.url());
  const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.classList.contains("dark"));
  writeFileSync(`${RAW_SHOTS}/${name}.json`, JSON.stringify({ kind, path: url.pathname + url.search, dark }));
}

/** What every captured page gets: no pop-ups and no development overlays. */
export const tidy = (context: BrowserContext) =>
  context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = '[data-testid="toast"], [data-slot="toast-region"] { opacity: 0 !important; pointer-events: none !important; } nextjs-portal { display: none !important; }';
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
  });

/**
 * A fresh account with a tidy fictional address (riley.park@example.com rather than a numbered test address), so the
 * address in the top bar reads cleanly: any earlier account with the address is deleted first, with all its rows.
 */
export async function freshAccount(name: string) {
  const email = `${name}@example.com`;
  const id = await userIdFor(email).catch(() => null);
  if (id) {
    // Deleting an invitation runs a trigger on follow-ups that Supabase's auth role may not run, so invitations go first.
    await adminRest("DELETE", `invitations?user_id=eq.${id}`);
    await adminAuth("DELETE", `users/${id}`);
  }
  // Old sign-in emails to the same address would be found first; clear them from local Mailpit.
  await fetch(`${process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { method: "DELETE" });
  return email;
}

/** Scrolls so the element sits at the top of the page, under the sticky header. */
export const toTop = (locator: Locator, offset = 96) =>
  locator.evaluate((el, o) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: "instant" }), offset);

/** Removes the line the fictional datasets add to say they are fictional; the frame and caption say so instead. */
export const dropFixtureNotes = (page: Page) =>
  page.evaluate(() => {
    document.querySelectorAll("p").forEach((p) => p.textContent?.includes("JOBS_FIXTURES") && p.remove());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(" (fixture: no canned answer)")) n.nodeValue = n.nodeValue.replace(" (fixture: no canned answer)", "");
  });

export const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = [name: string, school: number, program: number, state: "connected" | "pending" | "approved" | "review", role: string, ago: number];
export const SCHOOLS = ["University of British Columbia", "Simon Fraser University", "University of Waterloo"];
export const PROGRAMS = ["Computer Science", "Electrical Engineering", "Mechanical Engineering"];
const PEOPLE: Row[] = [
  ["Maya Chen", 0, 0, "connected", "Software Engineer at Shopify", 41],
  ["Daniel Okafor", 0, 0, "connected", "Backend Developer at Hootsuite", 38],
  ["Priya Nair", 0, 0, "connected", "ML Engineer at Microsoft", 33],
  ["Lucas Tremblay", 0, 0, "pending", "Student, 4th year", 0],
  ["Hannah Weiss", 0, 1, "connected", "Hardware Engineer at Tesla", 36],
  ["Omar Haddad", 0, 1, "connected", "Embedded Developer at Sierra Wireless", 3],
  ["Sophie Martin", 0, 1, "approved", "Student, 3rd year", 0],
  ["Ethan Brooks", 0, 2, "connected", "Design Engineer at Ballard Power", 29],
  ["Aisha Rahman", 0, 2, "pending", "Mechanical Intern at Bombardier", 4],
  ["Noah Kim", 1, 0, "connected", "Software Developer at Amazon", 40],
  ["Chloe Dubois", 1, 0, "connected", "Frontend Engineer at Clio", 35],
  ["Arjun Mehta", 1, 0, "connected", "Data Engineer at TELUS", 27],
  ["Emma Wilson", 1, 0, "connected", "QA Engineer at Absolute", 3],
  ["Liam Novak", 1, 0, "pending", "Student, 4th year", 0],
  ["Zoe Fraser", 1, 1, "connected", "Systems Engineer at MDA", 34],
  ["Mateo Silva", 1, 1, "connected", "Power Engineer at BC Hydro", 25],
  ["Grace Liu", 1, 1, "pending", "Student, 3rd year", 0],
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

/**
 * A signed-in account's whole fictional network: a plan (three schools, three disciplines, targets), 30 people at every
 * stage, invitations sent and accepted over two months (some today), connection counts and nine applications.
 */
export async function seedNetwork(page: Page, email: string) {
  await setUpPlan(page, {
    goal: 500,
    schools: SCHOOLS.map((name, i) => ({ name, aliases: ["UBC", "SFU", "UWaterloo, Waterloo"][i] })),
    disciplines: PROGRAMS.map((name) => ({ name })),
    targets: {
      "Computer Science": { total: 60, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 20])) },
      "Electrical Engineering": { total: 40, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 14])) },
      "Mechanical Engineering": { total: 30, schools: Object.fromEntries(SCHOOLS.map((s) => [s, 10])) },
    },
  });
  const stamp = Date.now();
  const user_id = await userIdFor(email);
  await adminRest("PATCH", `settings?user_id=eq.${user_id}`, { baseline_connections: 312, project_start_date: day(60).slice(0, 10) });
  const unis = (await adminRest("GET", `universities?user_id=eq.${user_id}&select=id,name`)) as { id: string; name: string }[];
  const discs = (await adminRest("GET", `disciplines?user_id=eq.${user_id}&select=id,name`)) as { id: string; name: string }[];
  const uni = (i: number) => unis.find((u) => u.name === SCHOOLS[i])!.id;
  const disc = (i: number) => discs.find((d) => d.name === PROGRAMS[i])!.id;
  const status = { connected: "connected", pending: "invitation_pending", approved: "approved", review: "awaiting_review" } as const;
  const key = (name: string) => `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp % 1000}`;
  const candidates = (await adminRest(
    "POST",
    "candidates",
    PEOPLE.map(([name, s, p, state, role]) => ({
      user_id,
      full_name: name,
      profile_url: `https://www.linkedin.com/in/${key(name)}`,
      profile_key: key(name),
      role,
      university: state === "review" ? null : uni(s),
      discipline: state === "review" ? null : disc(p),
      university_confidence: state === "review" ? "needs_review" : "confirmed",
      discipline_confidence: state === "review" ? "needs_review" : "confirmed",
      status: status[state],
    })),
  )) as { id: string; full_name: string }[];
  await adminRest(
    "POST",
    "invitations",
    PEOPLE.flatMap(([name, , , state, , ago]) => {
      if (state !== "connected" && state !== "pending") return [];
      const c = candidates.find((x) => x.full_name === name)!;
      return [{ user_id, candidate_id: c.id, sent_at: day(ago), outcome: state === "connected" ? "accepted" : "pending", resolved_at: state === "connected" ? day(Math.max(ago - 3, 0)) : null }];
    }),
  );
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
  return user_id;
}

/** The fictional job boards read in, and a resume imported, so Jobs shows postings with fit explained. */
export async function prepareJobs(page: Page) {
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  if (!(await page.getByText("Showing fictional sample employers").isVisible().catch(() => false))) return false;
  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/jobs/resume");
  await page.getByLabel("Your resume (PDF or Word)").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: readFileSync("e2e/fixtures/sample-resume.pdf") });
  await page.getByRole("button", { name: /^Import/ }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Sample", { timeout: 30_000 });
  return true;
}

/** A LinkedIn people-search page as someone would copy it (Ctrl+A, Ctrl+C), for Quick capture. */
export const PASTED_RESULTS = (() => {
  const rows = [
    ["Tara Singh", "tara-singh-a1", "Computer Science student at <strong>UBC</strong>"],
    ["Jonah Fisher", "jonah-fisher-b2", "Electrical Engineering | Simon Fraser University"],
    ["Amara Okoye", "amara-okoye-c3", "Mechanical Engineering student at <strong>University of Waterloo</strong>"],
    ["Felix Bauer", "felix-bauer-d4", "Computer Science | UBC | Software intern"],
    ["Nadia Ali", "nadia-ali-e5", "Computer Science at <strong>SFU</strong>, 3rd year"],
  ];
  return `<ul>${rows.map(([n, k, h]) => `<li><a href="https://www.linkedin.com/in/${k}/"><span aria-hidden="true">${n}</span><span>View ${n}’s profile</span></a><div>${h}</div></li>`).join("")}</ul>`;
})();

/** Puts the pasted page on the clipboard and pastes it into Quick capture. */
export async function pasteIntoQuickCapture(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async (h) => navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([h], { type: "text/html" }) })]), PASTED_RESULTS);
  await page.getByLabel("Paste a LinkedIn search results page here").click();
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("School for Tara Singh")).toBeVisible();
}
