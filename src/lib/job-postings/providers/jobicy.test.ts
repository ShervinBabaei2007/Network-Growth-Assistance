import { describe, expect, it, vi } from "vitest";
import { jobicyStatusEffect } from "../verify-job";
import { JOBICY_API, JobicyProvider } from "./jobicy";
import type { SearchQuery } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const query: SearchQuery = { what: "Full Stack Developer", country: "CA", where: "Vancouver", maxDaysOld: 7, page: 1 };

/** A Jobicy job as the public API returns it (fields copied from a real response's shape). */
const raw = (over: Record<string, unknown> = {}) => ({
  id: 154987,
  url: "https://jobicy.com/jobs/154987-senior-full-stack-engineer-6",
  jobSlug: "154987-senior-full-stack-engineer-6",
  jobTitle: "Senior Full Stack Engineer",
  companyName: "Mattermost",
  companyLogo: "https://jobicy.com/data/logo.webp",
  jobIndustry: ["Software Engineering"],
  jobType: ["Full-Time"],
  jobGeo: "Canada,  USA",
  jobLevel: "Senior",
  jobExcerpt: "Build our collaboration platform…",
  jobDescription:
    "<p>Mattermost is hiring a Senior Full Stack Engineer to build our collaboration platform with React, TypeScript and Go.</p><ul><li>5+ years of experience</li><li>PostgreSQL</li></ul>",
  pubDate: "2026-10-11T05:59:13+00:00",
  salaryMin: 162591,
  salaryMax: 195000,
  salaryCurrency: "CAD",
  salaryPeriod: "yearly",
  ...over,
});

/** A provider whose fetch returns `body` (or the status) and records each requested URL. */
function provider(body: unknown, status = 200) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { p: new JobicyProvider(fetchImpl), urls, fetchImpl };
}

describe("JobicyProvider.normalizeJob", () => {
  const { p } = provider({});

  it("maps a Jobicy job into the app's job model, credited to Jobicy", () => {
    const j = p.normalizeJob(raw())!;
    expect(j).toMatchObject({
      source: "jobicy",
      provider_key: "jobicy:154987",
      external_id: "154987",
      title: "Senior Full Stack Engineer",
      company: "Mattermost",
      remote: true,
      workplace_type: "remote",
      city: null,
      province: null,
      country: null,
      countries: ["CA", "US"],
      location_text: "Remote (Canada, USA)",
      experience_level: "senior",
      level_source: "provider",
      posted_at: "2026-10-11T05:59:13.000Z",
      date_source: "source",
      salary: "CA$162,591–CA$195,000 per year",
      salary_min: 162591,
      salary_max: 195000,
      salary_currency: "CAD",
      salary_period: "year",
      employment_type: "Full-Time",
      department: "Software Engineering",
      description_is_partial: false,
      verification_status: "pending_validation",
    });
    expect(j.description).toContain("React, TypeScript and Go");
  });

  it("keeps Jobicy's link exactly and never builds an employer or ATS link", () => {
    const j = p.normalizeJob(raw())!;
    expect(j.apply_url).toBe("https://jobicy.com/jobs/154987-senior-full-stack-engineer-6");
    expect(j.source_url).toBe(j.apply_url);
    expect(j.apply_url).not.toMatch(/mattermost|greenhouse|lever|workday|linkedin|indeed/);
  });

  it("drops jobs without a usable Jobicy link", () => {
    expect(p.normalizeJob(raw({ url: null }))).toBeNull();
    // A link that isn't on jobicy.com isn't Jobicy's listing.
    expect(p.normalizeJob(raw({ url: "https://mattermost.com/careers/154987" }))).toBeNull();
    // Jobicy's link must be for this job.
    expect(p.normalizeJob(raw({ url: "https://jobicy.com/jobs/999-other-job" }))).toBeNull();
    expect(p.normalizeJob(raw({ url: "http://jobicy.com/jobs/154987-x" }))).toBeNull();
  });

  it("leaves missing pay, level and type missing", () => {
    const j = p.normalizeJob(raw({ salaryMin: undefined, salaryMax: undefined, salaryCurrency: undefined, salaryPeriod: undefined, jobLevel: "Any", jobType: undefined, jobIndustry: undefined, jobGeo: undefined }), query)!;
    expect(j).toMatchObject({ salary: null, salary_min: null, salary_max: null, salary_currency: null, salary_period: null, employment_type: null, department: null, location_text: "Remote" });
    // No geo from Jobicy: it's open to the place that was searched (Jobicy matched it), and nothing more.
    expect(j).toMatchObject({ countries: ["CA"], country: "CA" });
    // Without a geo or a search to go by, where it can be done is unknown: skipped.
    expect(p.normalizeJob(raw({ jobGeo: undefined }))).toBeNull();
    // "Any" isn't a level; the title still says Senior.
    expect(j).toMatchObject({ experience_level: "senior", level_source: "title" });
    expect(p.normalizeJob(raw({ jobTitle: "Software Engineer", jobLevel: "Any" }))).toMatchObject({ experience_level: null, level_source: null });
  });

  it("keeps pay in the currency Jobicy states, never converted", () => {
    const j = p.normalizeJob(raw({ salaryMin: 158300, salaryMax: 237500, salaryCurrency: "USD" }))!;
    expect(j).toMatchObject({ salary: "US$158,300–US$237,500 per year", salary_min: 158300, salary_max: 237500, salary_currency: "USD" });
    expect(p.normalizeJob(raw({ salaryCurrency: "SEK" }))).toMatchObject({ salary: "SEK 162,591–SEK 195,000 per year", salary_currency: "SEK" });
  });

  it("reads where a job can be done from Jobicy's geo", () => {
    expect(p.normalizeJob(raw({ jobGeo: "Anywhere" }))).toMatchObject({ countries: ["*"], location_text: "Remote (Anywhere)" });
    expect(p.normalizeJob(raw({ jobGeo: "EMEA" }))).toMatchObject({ countries: ["emea"], country: null });
    expect(p.normalizeJob(raw({ jobGeo: "UK" }))).toMatchObject({ countries: ["GB"], country: "GB" });
    expect(p.normalizeJob(raw({ jobGeo: "APAC,  EMEA,  LATAM,  Canada,  USA" }))!.countries).toEqual(["CA", "US", "apac", "emea", "latam"]);
  });

  it("marks a job with only an excerpt as partial", () => {
    expect(p.normalizeJob(raw({ jobDescription: "" }))).toMatchObject({ description_is_partial: true, description: "Build our collaboration platform…" });
  });

  it("skips malformed records and jobs without a date, never inventing one", () => {
    expect(p.normalizeJob({ nothing: true })).toBeNull();
    expect(p.normalizeJob(raw({ jobTitle: "" }))).toBeNull();
    expect(p.normalizeJob(raw({ pubDate: null }))).toBeNull();
    expect(p.normalizeJob(raw({ pubDate: "yesterday" }))).toBeNull();
  });
});

describe("JobicyProvider.searchJobs", () => {
  it("needs no API key and sends only the filters Jobicy supports", async () => {
    const { p, urls } = provider({ jobs: [raw()], nextCursor: "abc", hasMore: true });
    const r = await p.searchJobs(query, AbortSignal.timeout(1000));
    const url = new URL(urls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(JOBICY_API);
    // The words name a field, so Jobicy's matching industry is added.
    expect(Object.fromEntries(url.searchParams)).toEqual({ count: "50", geo: "canada", tag: "Full Stack Developer", industry: "engineering" });
    expect(url.search).not.toMatch(/key|token|Vancouver/i);
    expect(r).toMatchObject({ provider: "jobicy", outcome: "ok", skipped: 0, nextCursor: "abc" });
    expect(r.jobs).toHaveLength(1);
  });

  it("follows Jobicy's cursor for the next page, and has nothing honest to ask for without one", async () => {
    const { p, urls, fetchImpl } = provider({ jobs: [], nextCursor: null, hasMore: false });
    const r = await p.searchJobs({ ...query, page: 2, cursor: "AgAAAA" }, AbortSignal.timeout(1000));
    expect(new URL(urls[0]).searchParams.get("cursor")).toBe("AgAAAA");
    expect(r).toMatchObject({ outcome: "empty", nextCursor: null });
    vi.mocked(fetchImpl).mockClear();
    expect(await p.searchJobs({ ...query, page: 3 }, AbortSignal.timeout(1000))).toMatchObject({ outcome: "empty", jobs: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("counts malformed records as skipped and keeps the rest", async () => {
    const { p } = provider({ jobs: [raw(), { id: 2 }, raw({ id: 3, url: "https://evil.example.org/jobs/3" })], hasMore: false });
    expect(await p.searchJobs(query, AbortSignal.timeout(1000))).toMatchObject({ outcome: "ok", skipped: 2, nextCursor: null });
  });

  it.each([
    [429, "rate_limited"],
    [403, "auth"],
    [500, "outage"],
    [503, "outage"],
  ])("reports HTTP %i as %s", async (status, outcome) => {
    await expect(provider({}, status).p.searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome });
  });

  it("reports an unreadable answer as malformed and a network failure as an outage", async () => {
    await expect(provider({ unexpected: 1 }).p.searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "malformed" });
    const down = new JobicyProvider((async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch);
    await expect(down.searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "outage" });
  });
});

describe("Jobicy job status", () => {
  it("asks Jobicy's free status endpoint and reads active, closed and unknown", async () => {
    const { p, urls } = provider({ jobs: [{ id: 1, status: "active" }, { id: 2, status: "closed" }, { id: 3, status: "unknown" }, { id: 4, status: "weird" }] });
    const m = await p.jobStatus(["1", "2", "3", "4", "5", "not-an-id"], AbortSignal.timeout(1000));
    expect(urls[0]).toBe(`${JOBICY_API}/status?ids=1,2,3,4,5`);
    expect(Object.fromEntries(m)).toEqual({ 1: "active", 2: "closed", 3: "unknown", 4: "unknown", 5: "unknown" });
  });

  it("maps statuses onto verification honestly: unknown is never verified", () => {
    expect(jobicyStatusEffect("closed")).toEqual({ status: "expired", note: "Jobicy says this job is closed" });
    expect(jobicyStatusEffect("active")).toBe("check_link");
    expect(jobicyStatusEffect("unknown")).toMatchObject({ status: "pending_validation" });
  });
});
