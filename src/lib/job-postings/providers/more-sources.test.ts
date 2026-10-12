import { describe, expect, it, vi } from "vitest";
import { wantedScope } from "../ats/types";
import { linkRank, type DedupeItem } from "../dedupe";
import { alsoListedOn } from "../source";
import { checkJobLink } from "../verify-url";
import { ARBEITNOW_FEEDS, ArbeitnowProvider } from "./arbeitnow";
import { searchProviders } from "./registry";
import { USAJOBS_API, UsajobsProvider } from "./usajobs";

/** An Arbeitnow job as its API returns it (fields copied from a real response's shape). */
const arb = (over: Record<string, unknown> = {}) => ({
  slug: "full-stack-software-engineer-munich-hybrid-420771",
  company_name: "TWAICE",
  title: "Full-Stack Software Engineer (m/f/d)",
  description: "<p>Build our battery analytics platform with TypeScript and Python. You will own features end to end.</p>",
  remote: false,
  url: "https://www.arbeitnow.com/jobs/companies/twaice/full-stack-software-engineer-munich-hybrid-420771",
  tags: ["Software Development", "Energy"],
  job_types: ["Experienced", "Permanent", "Full time"],
  location: "München, Bayern, Germany",
  created_at: 1791770987,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ArbeitnowProvider", () => {
  const p = new ArbeitnowProvider();
  const de = wantedScope(["DE"]);

  it("keeps Arbeitnow's own link and credits Arbeitnow", () => {
    expect(p.normalizeJob(arb(), de)).toMatchObject({
      source: "arbeitnow",
      provider_key: "arbeitnow:full-stack-software-engineer-munich-hybrid-420771",
      apply_url: "https://www.arbeitnow.com/jobs/companies/twaice/full-stack-software-engineer-munich-hybrid-420771",
      company: "TWAICE",
      country: "DE",
      countries: ["DE"],
      city: "München",
      employment_type: "Full-time",
      posted_at: new Date(1791770987 * 1000).toISOString(),
      salary: null,
    });
    expect(alsoListedOn("arbeitnow")).toBe("Arbeitnow");
    // Never the employer's guessed site.
    expect(p.normalizeJob(arb({ url: "https://twaice.com/careers/420771" }), de)).toBeNull();
  });

  it("reads places in German too, and skips what it can't place or nobody searches", () => {
    expect(p.normalizeJob(arb({ location: "Osnabrück, Niedersachsen, Deutschland" }), de)).toMatchObject({ country: "DE" });
    expect(p.normalizeJob(arb({ location: "Munich, Hybrid" }), de)).toMatchObject({ country: "DE", workplace_type: "hybrid" });
    expect(p.normalizeJob(arb({ location: "Kleinstadt" }), de)).toBeNull();
    expect(p.normalizeJob(arb(), wantedScope(["CA"]))).toBeNull();
    expect(p.normalizeJob(arb({ created_at: null }), de)).toBeNull();
  });

  it("reads the newest pages of both feeds, follows only their own next links, and keeps one feed's jobs when the other fails", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      urls.push(url);
      if (url.startsWith(ARBEITNOW_FEEDS[1])) return json({}, 503);
      return url.includes("page=2")
        ? json({ data: [arb({ slug: "b-2", url: "https://www.arbeitnow.com/jobs/companies/x/b-2" })], links: { next: "https://evil.example.org/api?page=3" } })
        : json({ data: [arb()], links: { next: `${ARBEITNOW_FEEDS[0]}?page=2` } });
    }) as unknown as typeof fetch;
    const r = await new ArbeitnowProvider(fetchImpl).readFeed(AbortSignal.timeout(1000), wantedScope(["DE"]));
    expect(r).toMatchObject({ outcome: "ok", complete: false });
    expect(r.jobs.map((j) => j.external_id)).toEqual(["full-stack-software-engineer-munich-hybrid-420771", "b-2"]);
    expect(urls.some((u) => u.includes("evil.example.org"))).toBe(false);
  });

  it("reports a failure when every feed fails", async () => {
    const down = new ArbeitnowProvider((async () => json({}, 429)) as unknown as typeof fetch);
    await expect(down.readFeed(AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "rate_limited" });
  });
});

/** A USAJOBS search result item (shape from the USAJOBS Search API). */
const usa = (over: Record<string, unknown> = {}) => ({
  MatchedObjectId: "812345600",
  MatchedObjectDescriptor: {
    PositionTitle: "Registered Nurse (Medical/Surgical)",
    PositionURI: "https://www.usajobs.gov:443/job/812345600",
    PositionLocation: [{ LocationName: "Seattle, Washington", CountryCode: "United States", CountrySubDivisionCode: "Washington", CityName: "Seattle, Washington" }],
    OrganizationName: "Veterans Health Administration",
    DepartmentName: "Department of Veterans Affairs",
    PositionSchedule: [{ Name: "Full-time" }],
    PositionRemuneration: [{ MinimumRange: "84000", MaximumRange: "121000", RateIntervalCode: "PA" }],
    PublicationStartDate: "2026-10-09T00:00:00.0000",
    QualificationSummary: "Current, active, full and unrestricted RN license.",
    UserArea: { Details: { JobSummary: "Provide patient care on a medical/surgical unit.", RemoteIndicator: false } },
    ...over,
  },
});

describe("UsajobsProvider (optional)", () => {
  it("is used only with its key and email", () => {
    expect(searchProviders({ NODE_ENV: "production" }).providers.map((p) => p.name)).not.toContain("usajobs");
    expect(searchProviders({ NODE_ENV: "production", USAJOBS_API_KEY: "k", USAJOBS_EMAIL: "me@example.com" }).providers.map((p) => p.name)).toContain("usajobs");
  });

  it("maps an announcement, links to it, and states pay as given", () => {
    const j = new UsajobsProvider("k", "me@example.com").normalizeJob(usa())!;
    expect(j).toMatchObject({
      source: "usajobs",
      external_id: "812345600",
      apply_url: "https://www.usajobs.gov/job/812345600",
      company: "Veterans Health Administration",
      country: "US",
      countries: ["US"],
      city: "Seattle",
      province: "WA",
      salary: "US$84,000–US$121,000 per year",
      salary_currency: "USD",
      salary_period: "year",
      employment_type: "Full-time",
    });
    expect(j.description).toContain("RN license");
  });

  it("asks only for US (or Anywhere) searches, with its required headers, and never puts the key in the URL", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(u), headers: init?.headers as Record<string, string> });
      return json({ SearchResult: { SearchResultCountAll: 1, SearchResultItems: [usa()] } });
    }) as unknown as typeof fetch;
    const p = new UsajobsProvider("secret-key", "me@example.com", fetchImpl);
    const q = { what: "Nurse", country: "US", where: "Seattle", maxDaysOld: 7, page: 1 };
    expect(await p.searchJobs(q, AbortSignal.timeout(1000))).toMatchObject({ outcome: "ok", total: 1 });
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(USAJOBS_API);
    expect(Object.fromEntries(url.searchParams)).toEqual({ Keyword: "Nurse", ResultsPerPage: "50", Page: "1", DatePosted: "7", LocationName: "Seattle" });
    expect(calls[0].url).not.toContain("secret-key");
    expect(calls[0].headers).toMatchObject({ Host: "data.usajobs.gov", "User-Agent": "me@example.com", "Authorization-Key": "secret-key" });
    expect(await p.searchJobs({ ...q, country: "CA" }, AbortSignal.timeout(1000))).toMatchObject({ outcome: "empty", jobs: [] });
    expect(calls).toHaveLength(1);
  });

  it("reports a rejected key", async () => {
    const p = new UsajobsProvider("bad", "me@example.com", (async () => json({}, 401)) as unknown as typeof fetch);
    await expect(p.searchJobs({ what: "Nurse", country: "US", where: null, maxDaysOld: 7, page: 1 }, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "auth" });
  });
});

describe("links and priority for the new sources", () => {
  it("accepts only each site's own page for the job", () => {
    const off = { allowFixtureHosts: false };
    expect(checkJobLink("https://www.arbeitnow.co.uk/jobs/companies/x/data-analyst-london-1234", { source: "arbeitnow", externalId: "data-analyst-london-1234" }, off).ok).toBe(true);
    expect(checkJobLink("https://www.usajobs.gov/job/812345600", { source: "usajobs", externalId: "812345600" }, off).ok).toBe(true);
    expect(checkJobLink("https://www.usajobs.gov/job/999", { source: "usajobs", externalId: "812345600" }, off).ok).toBe(false);
    expect(checkJobLink("https://jobicy.com/jobs/812345600-x", { source: "usajobs", externalId: "812345600" }, off).ok).toBe(false);
  });

  it("treats a USAJOBS announcement as the employer's own posting, and Arbeitnow as a job site", () => {
    const item = (source: DedupeItem["source"]): DedupeItem => ({ id: source, source, dedupe_key: "k", desc_fingerprint: null, description_is_partial: false, canonical_url: null, apply_url: "https://x.org/1", posted_at: "2026-10-11T00:00:00Z", verification_status: "verified" });
    expect(linkRank(item("usajobs"))).toBe(linkRank(item("ats")));
    expect(linkRank(item("arbeitnow"))).toBeGreaterThan(linkRank(item("remotive")));
  });
});
