import { describe, expect, it } from "vitest";
import { cacheKey, planRefresh, runProviders } from "../search";
import { AdzunaProvider } from "./adzuna";
import { JobicyProvider } from "./jobicy";
import { searchProviders } from "./registry";
import { ProviderError, type JobProvider, type SearchQuery } from "./types";

const query: SearchQuery = { what: "Full Stack Developer", country: "CA", where: null, maxDaysOld: 7, page: 1 };

const raw = (over: Record<string, unknown> = {}) => ({
  id: 4512,
  title: "<strong>Full Stack</strong> Developer",
  company: { display_name: "Harbourview Software Inc." },
  location: { display_name: "Vancouver, British Columbia", area: ["Canada", "British Columbia", "Vancouver"] },
  created: "2026-10-11T08:00:00Z",
  description: "Build React and TypeScript interfaces…",
  redirect_url: "https://www.adzuna.ca/land/ad/4512?se=abc&utm_medium=api",
  salary_min: 70000,
  salary_max: 85000,
  salary_is_predicted: "0",
  contract_time: "full_time",
  ...over,
});

const adzuna = (body: unknown, status = 200) => new AdzunaProvider("id", "key", async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("AdzunaProvider.normalizeJob", () => {
  const p = adzuna({});

  it("maps a result into the job model with its own link and stated pay", () => {
    expect(p.normalizeJob(raw())).toMatchObject({
      source: "adzuna",
      provider_key: "adzuna:4512",
      external_id: "4512",
      title: "Full Stack Developer",
      company: "Harbourview Software Inc.",
      city: "Vancouver",
      province: "BC",
      posted_at: "2026-10-11T08:00:00.000Z",
      date_source: "source",
      apply_url: "https://www.adzuna.ca/land/ad/4512?se=abc&utm_medium=api",
      salary: "$70,000–$85,000 per year",
      salary_min: 70000,
      employment_type: "Full-time",
      description_is_partial: true,
      verification_status: "pending_validation",
    });
  });

  it("never shows a salary Adzuna estimated", () => {
    expect(p.normalizeJob(raw({ salary_is_predicted: "1" }))).toMatchObject({ salary: null, salary_min: null, salary_max: null });
  });

  it("drops a result without its own link, with a foreign link, an unreadable country, or without a date", () => {
    expect(p.normalizeJob(raw({ redirect_url: null }))).toBeNull();
    expect(p.normalizeJob(raw({ redirect_url: "https://phish.example.net/land/ad/4512" }))).toBeNull();
    // Outside Canada is kept, with its own country (and no Canadian province).
    expect(p.normalizeJob(raw({ location: { display_name: "Seattle", area: ["US", "Washington", "Seattle"] } }))).toMatchObject({ country: "US", countries: ["US"], province: null });
    expect(p.normalizeJob(raw({ location: { display_name: "Somewhere", area: ["Atlantis"] } }))).toBeNull();
    expect(p.normalizeJob(raw({ created: null }))).toBeNull();
    expect(p.normalizeJob({ nonsense: true })).toBeNull();
  });
});

describe("AdzunaProvider.searchJobs", () => {
  it("returns normalized jobs and counts skipped ones", async () => {
    const r = await adzuna({ count: 132, results: [raw(), raw({ id: 5, redirect_url: null })] }).searchJobs(query, AbortSignal.timeout(1000));
    expect(r).toMatchObject({ outcome: "ok", total: 132, skipped: 1 });
    expect(r.jobs).toHaveLength(1);
  });

  it.each([
    [401, "auth"],
    [429, "rate_limited"],
    [500, "outage"],
  ])("turns HTTP %s into %s", async (status, outcome) => {
    await expect(adzuna({}, status).searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome });
  });

  it("reports a malformed answer", async () => {
    await expect(adzuna({ unexpected: 1 }).searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "malformed" });
  });
});

describe("runProviders: one failing source doesn't break the search", () => {
  const working: JobProvider = { name: "b", label: "B", normalizeJob: () => null, searchJobs: async () => ({ provider: "b", outcome: "ok", jobs: [adzuna({}).normalizeJob(raw())!], total: 1, skipped: 0 }) };
  const failing = (outcome: ProviderError["outcome"]): JobProvider => ({ name: `a-${outcome}`, label: "A", normalizeJob: () => null, searchJobs: async () => Promise.reject(new ProviderError(outcome)) });
  const throwing: JobProvider = { name: "c", label: "C", normalizeJob: () => null, searchJobs: async () => Promise.reject(new TypeError("boom")) };
  const slow: JobProvider = {
    name: "d",
    label: "D",
    normalizeJob: () => null,
    searchJobs: (_, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ProviderError("timeout")))),
  };

  it("returns the working providers' results with a notice for each failure", async () => {
    const { results, notices } = await runProviders([failing("auth"), working, failing("rate_limited"), throwing, failing("malformed"), slow], query, 50);
    expect(results.map((r) => r.provider)).toEqual(["b"]);
    expect(results[0].jobs).toHaveLength(1);
    expect(notices.map((n) => n.outcome)).toEqual(["auth", "ok", "rate_limited", "outage", "malformed", "timeout"]);
  });

  it("returns nothing (not stand-in data) when every source fails", async () => {
    const { results, notices } = await runProviders([failing("outage"), throwing], query, 50);
    expect(results).toEqual([]);
    expect(notices.every((n) => n.count === 0)).toBe(true);
  });
});

describe("searchProviders", () => {
  it("searches Jobicy with no keys at all, and adds Adzuna only with its optional keys", () => {
    expect(searchProviders({ NODE_ENV: "production" }).providers.map((p) => p.name)).toEqual(["jobicy"]);
    expect(searchProviders({ NODE_ENV: "production", ADZUNA_APP_ID: "x" }).providers.map((p) => p.name)).toEqual(["jobicy"]);
    expect(searchProviders({ NODE_ENV: "production", ADZUNA_APP_ID: "x", ADZUNA_APP_KEY: "y" }).providers.map((p) => p.name)).toEqual(["jobicy", "adzuna"]);
  });

  it("never uses fixture data in production, even with the fixture flag set", async () => {
    for (const env of [{ NODE_ENV: "production", JOBS_FIXTURES: "1" }, { NODE_ENV: "development", VERCEL_ENV: "production", JOBS_FIXTURES: "1" }]) {
      const [p] = searchProviders(env).providers;
      // The real Jobicy provider: it would accept only jobicy.com links, never the test host.
      expect(p.normalizeJob({ id: 1, url: "https://jobs.example.com/jobicy/1-x", jobTitle: "Developer", pubDate: "2026-10-11T00:00:00Z" })).toBeNull();
    }
    const fixture = searchProviders({ NODE_ENV: "development", JOBS_FIXTURES: "1" }).providers;
    expect(fixture).toHaveLength(1);
    expect((await fixture[0].searchJobs(query, AbortSignal.timeout(1000))).jobs.map((j) => j.company)).toEqual(["Harbourview Software", "Northwind Labs"]);
  });
});

describe("planRefresh: caching and cursor pages", () => {
  const jobicy = new JobicyProvider(async () => new Response("{}"));
  const pageProvider = adzuna({});
  const row = (minutesAgo: number, next_cursor: string | null = null) => ({ query_key: "", status: "ok", result_count: 3, fetched_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), next_cursor });

  it("reuses Jobicy's answer for an hour and a 30-minute provider's for 30 minutes", () => {
    const cache = new Map([
      [cacheKey("jobicy", query), row(45)],
      [cacheKey("adzuna", query), row(45)],
    ]);
    const plan = planRefresh([jobicy, pageProvider], query, cache);
    expect(plan.fresh.map((f) => f.provider.name)).toEqual(["jobicy"]);
    expect(plan.due.map((d) => d.provider.name)).toEqual(["adzuna"]);
  });

  it("asks Jobicy for page 2 only with page 1's cursor", () => {
    const page2 = { ...query, page: 2 };
    expect(planRefresh([jobicy], page2, new Map()).due).toEqual([]);
    expect(planRefresh([jobicy], page2, new Map([[cacheKey("jobicy", query), row(90, null)]])).due).toEqual([]);
    expect(planRefresh([jobicy], page2, new Map([[cacheKey("jobicy", query), row(90, "CUR")]])).due).toEqual([{ provider: jobicy, cursor: "CUR" }]);
    // Page-numbered providers don't need a cursor.
    expect(planRefresh([pageProvider], page2, new Map()).due).toEqual([{ provider: pageProvider, cursor: null }]);
  });

  it("keeps ATS-style results when Jobicy fails and another source works", async () => {
    const down = new JobicyProvider((async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    const { results, notices } = await runProviders([down, adzuna({ count: 1, results: [raw()] })], query, 1000);
    expect(results.map((r) => r.provider)).toEqual(["adzuna"]);
    expect(notices.map((n) => [n.label, n.outcome])).toEqual([
      ["Jobicy", "outage"],
      ["Adzuna", "ok"],
    ]);
  });
});
