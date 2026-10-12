import { afterEach, describe, expect, it, vi } from "vitest";
import { ashby, greenhouse, lever, recruitee, smartrecruiters, workable } from "./adapters";
import { detectBoard } from "./detect";
import { boardHtmlToText, canadianPlace, retryAfterSeconds } from "./types";

/**
 * Response shapes recorded from live boards (trimmed, with fictional jobs). If an ATS
 * changes its API, these tests show which fields moved.
 */

function serve(responses: Record<string, unknown>, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const key = Object.keys(responses).find((k) => u.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const body = responses[key];
    if (body === 304) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("adapters", () => {
  it("Greenhouse: lists jobs, then fetches the escaped HTML description on request", async () => {
    serve(
      {
        "/boards/acme/jobs/111": { id: 111, title: "Developer", absolute_url: "https://acme.com/jobs?gh_jid=111", content: "&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;" },
        "/boards/acme/jobs": {
          jobs: [
            { id: 111, title: "Developer", absolute_url: "https://acme.com/jobs?gh_jid=111", first_published: "2026-10-11T09:00:00-04:00", location: { name: "Toronto, Canada" }, company_name: "Acme" },
            { id: 112, title: "Bad", location: null },
          ],
          meta: { total: 2 },
        },
      },
      { etag: 'W/"abc"' },
    );
    const r = await greenhouse.fetchBoard("acme", {});
    expect(r.notModified).toBe(false);
    if (r.notModified) return;
    expect(r.etag).toBe('W/"abc"');
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({ externalId: "111", title: "Developer", company: "Acme", postedAt: "2026-10-11T09:00:00-04:00", description: null });
    expect(await greenhouse.fetchDetail!("acme", "111", {})).toEqual({ description: "Requirements\n• Python" });
  });

  it("returns not-modified on 304 and sends the ETag", async () => {
    const calls = serve({ "/v0/postings/acme": 304 });
    expect(await lever.fetchBoard("acme", { etag: 'W/"x"' })).toEqual({ notModified: true });
    expect((calls[0].init?.headers as Record<string, string>)["If-None-Match"]).toBe('W/"x"');
  });

  it("Lever: createdAt in milliseconds, all locations, lists as sections", async () => {
    serve({
      "/v0/postings/acme": [
        {
          id: "l1",
          text: "Firmware Engineer",
          hostedUrl: "https://jobs.lever.co/acme/l1",
          createdAt: Date.parse("2026-10-11T12:00:00Z"),
          country: "CA",
          workplaceType: "hybrid",
          categories: { location: "Burnaby, BC", allLocations: ["Burnaby, BC"], commitment: "Full-time", team: "Hardware" },
          descriptionPlain: "Build firmware.",
          lists: [{ text: "What you'll need", content: "<li>C programming</li><li>RTOS</li>" }],
        },
      ],
    });
    const r = await lever.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs[0]).toMatchObject({ postedAt: "2026-10-11T12:00:00.000Z", places: [{ text: "Burnaby, BC", country: "CA" }], employmentType: "Full-time" });
    expect(r.jobs[0].description).toBe("Build firmware.\nWhat you'll need\n• C programming\n• RTOS");
  });

  it("Ashby: structured addresses, secondary locations, unlisted jobs skipped", async () => {
    serve({
      "/job-board/acme": {
        jobs: [
          {
            id: "a1",
            title: "Data Engineer",
            jobUrl: "https://jobs.ashbyhq.com/acme/a1",
            publishedAt: "2026-10-11T10:00:00.000+00:00",
            isListed: true,
            location: "San Francisco",
            address: { postalAddress: { addressLocality: "San Francisco", addressRegion: "California", addressCountry: "United States" } },
            secondaryLocations: [{ location: "Vancouver", address: { postalAddress: { addressLocality: "Vancouver", addressRegion: "British Columbia", addressCountry: "Canada" } } }],
            descriptionPlain: "Requirements\n- SQL",
          },
          { id: "a2", title: "Hidden", jobUrl: "https://x", isListed: false },
        ],
      },
    });
    const r = await ashby.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs).toHaveLength(1);
    expect(canadianPlace(r.jobs[0].places, r.jobs[0].remote)).toMatchObject({ province: "BC", city: "Vancouver" });
  });

  it("SmartRecruiters: filters to the searched country in the request; description and link come from the posting itself", async () => {
    const calls = serve({
      "/postings/s1": { postingUrl: "https://jobs.smartrecruiters.com/acme/s1", jobAd: { sections: { qualifications: { title: "Qualifications", text: "<ul><li>AutoCAD</li></ul>" } } } },
      "/companies/acme/postings?": { totalFound: 1, content: [{ id: "s1", name: "Designer", releasedDate: "2026-10-11T08:00:00Z", location: { city: "Toronto", region: "ON", country: "ca" } }] },
    });
    const r = await smartrecruiters.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(calls[0].url).toContain("country=ca");
    expect(canadianPlace(r.jobs[0].places, false)).toMatchObject({ province: "ON" });
    // The list has no link, and none is guessed from a URL pattern.
    expect(r.jobs[0].applyUrl).toBeNull();
    // A country-filtered read doesn't show the rest of the board, so it never closes jobs by absence.
    expect(r.partial).toBe(true);
    expect(await smartrecruiters.fetchDetail!("acme", "s1", {})).toEqual({ description: "Qualifications\n• AutoCAD", applyUrl: "https://jobs.smartrecruiters.com/acme/s1" });
  });

  it("SmartRecruiters: asks for each searched country, and a job listed in two of them once", async () => {
    const calls = serve({
      "/companies/acme/postings?": { totalFound: 1, content: [{ id: "s1", name: "Designer", releasedDate: "2026-10-11T08:00:00Z", location: { city: "Berlin", country: "de" } }] },
    });
    const r = await smartrecruiters.fetchBoard("acme", { countries: ["CA", "DE"] });
    if (r.notModified) throw new Error("unexpected");
    expect(calls.map((c) => c.url).filter((u) => u.includes("/postings?"))).toEqual([expect.stringContaining("country=ca&"), expect.stringContaining("country=de&")]);
    expect(r.jobs).toHaveLength(1);
  });

  it("SmartRecruiters: a board longer than the page cap is marked partial, so missing jobs aren't closed", async () => {
    const content = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: "Designer", location: { city: "Toronto", region: "ON", country: "ca" } }));
    serve({ "/companies/acme/postings?": { totalFound: 450, content } });
    const r = await smartrecruiters.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.partial).toBe(true);
  });

  it("SmartRecruiters: a posting without its own link stays without one", async () => {
    serve({ "/postings/s2": { jobAd: { sections: {} } } });
    expect(await smartrecruiters.fetchDetail!("acme", "s2", {})).toEqual({ description: null, applyUrl: null });
  });

  it("Workable: a job without its own link isn't given one", async () => {
    serve({ "/widget/accounts/acme": { name: "Acme", jobs: [{ shortcode: "W2", title: "QA", published_on: "2026-10-11", country: "Canada", city: "Victoria", state: "BC" }] } });
    const r = await workable.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs[0].applyUrl).toBeNull();
  });

  it("Lever: dates are creation times, workplace and pay are structured", async () => {
    serve({
      "api.lever.co": [
        { id: "L1", text: "Dev", hostedUrl: "https://jobs.lever.co/acme/L1", createdAt: 1760000000000, workplaceType: "hybrid", categories: { location: "Toronto, ON" }, salaryRange: { min: 80000, max: 95000, currency: "cad", interval: "per-year-salary" } },
      ],
    });
    const r = await lever.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs[0]).toMatchObject({ dateNote: "created", workplace: "hybrid", salaryRange: { min: 80000, max: 95000, currency: "CAD", period: "year" }, salary: "$80,000–$95,000 per year" });
  });

  it("a 429 waits for Retry-After instead of counting as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429, headers: { "retry-after": "120" } })));
    await expect(greenhouse.fetchBoard("acme", {})).rejects.toMatchObject({ retryAfterSeconds: 120 });
    expect(retryAfterSeconds("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:27:00 GMT"))).toBe(60);
    expect(retryAfterSeconds("soon")).toBeNull();
  });

  it("Workable: date-only postings are marked so", async () => {
    serve({
      "/widget/accounts/acme": {
        name: "Acme",
        jobs: [{ shortcode: "W1", title: "QA Analyst", url: "https://apply.workable.com/j/W1", published_on: "2026-10-11", locations: [{ country: "Canada", countryCode: "CA", city: "Victoria", region: "British Columbia" }], description: "<p>Selenium</p>" }],
      },
    });
    const r = await workable.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs[0]).toMatchObject({ precision: "day", company: "Acme", description: "Selenium" });
    expect(canadianPlace(r.jobs[0].places, false)).toMatchObject({ province: "BC", city: "Victoria" });
  });

  it("Recruitee: parses its date format", async () => {
    serve({
      "acme.recruitee.com/api/offers": { offers: [{ id: 9, title: "IT Support", careers_url: "https://acme.recruitee.com/o/it", published_at: "2026-10-11 16:05:18 UTC", city: "Ottawa", state_code: "ON", country_code: "CA", description: "<p>Help desk</p>" }] },
    });
    const r = await recruitee.fetchBoard("acme", {});
    if (r.notModified) throw new Error("unexpected");
    expect(r.jobs[0].postedAt).toBe("2026-10-11T16:05:18Z");
  });

  it("reports a missing board as gone", async () => {
    serve({});
    await expect(greenhouse.fetchBoard("nope", {})).rejects.toMatchObject({ gone: true });
  });
});

describe("canadianPlace", () => {
  it("finds the Canadian place among several, preferring BC then Ontario", () => {
    expect(canadianPlace([{ text: "New York, NY; Toronto, ON; Vancouver, BC" }], false)).toMatchObject({ province: "BC" });
    expect(canadianPlace([{ text: "San Francisco, CA" }, { text: "Toronto, Ontario, Canada" }], false)).toMatchObject({ province: "ON", city: "Toronto" });
  });
  it("counts remote only when it says Canada", () => {
    expect(canadianPlace([{ text: "Remote - Canada" }], false)).toMatchObject({ remote: true, province: null });
    expect(canadianPlace([{ text: "Remote" }], true)).toBeNull();
    expect(canadianPlace([{ text: "Remote - US" }], true)).toBeNull();
  });
  it("doesn't split a place inside parentheses, and keeps the board's wording", () => {
    expect(canadianPlace([{ text: "Toronto, ON (Remote / Canada)" }], false)).toEqual({ province: "ON", city: "Toronto", locationText: "Toronto, ON (Remote / Canada)", remote: true });
    expect(canadianPlace([{ text: "Seattle, WA / Vancouver, BC" }], false)).toMatchObject({ province: "BC", locationText: "Seattle, WA / Vancouver, BC" });
  });
  it("trusts a structured country over the text", () => {
    expect(canadianPlace([{ text: "London", country: "GB" }], false)).toBeNull();
    expect(canadianPlace([{ text: "London", region: "ON", country: "CA" }], false)).toMatchObject({ province: "ON" });
    expect(canadianPlace([{ text: "Vancouver, WA", country: "US" }], false)).toBeNull();
  });
});

describe("detectBoard", () => {
  it("recognizes each ATS's board links", () => {
    expect(detectBoard("https://boards.greenhouse.io/acme/jobs/123")).toEqual({ ats: "greenhouse", token: "acme" });
    expect(detectBoard("https://job-boards.greenhouse.io/acme")).toEqual({ ats: "greenhouse", token: "acme" });
    expect(detectBoard("https://boards.greenhouse.io/embed/job_board?for=acme")).toEqual({ ats: "greenhouse", token: "acme" });
    expect(detectBoard("https://jobs.lever.co/acme-inc/abc")).toEqual({ ats: "lever", token: "acme-inc" });
    expect(detectBoard("https://jobs.ashbyhq.com/Acme")).toEqual({ ats: "ashby", token: "Acme" });
    expect(detectBoard("https://careers.smartrecruiters.com/AcmeCorp")).toEqual({ ats: "smartrecruiters", token: "AcmeCorp" });
    expect(detectBoard("https://apply.workable.com/acme/")).toEqual({ ats: "workable", token: "acme" });
    expect(detectBoard("https://acme.recruitee.com/o/dev")).toEqual({ ats: "recruitee", token: "acme" });
  });
  it("ignores other links", () => {
    expect(detectBoard("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(detectBoard("https://apply.workable.com/j/ABC")).toBeNull();
    expect(detectBoard("https://acme.com/careers")).toBeNull();
  });
});

describe("boardHtmlToText", () => {
  it("keeps list items as bullet lines", () => {
    expect(boardHtmlToText("<p>Requirements</p><ul><li>Python</li><li>SQL</li></ul>")).toBe("Requirements\n• Python\n• SQL");
  });
});
