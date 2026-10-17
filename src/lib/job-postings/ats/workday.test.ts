import { afterEach, describe, expect, it, vi } from "vitest";
import { bestPlace } from "../crawler";
import { checkJobLink } from "../verify-url";
import { WD_PAGES, workday, workdayCountryFacet, workdayParts, workdayPostedOn } from "./adapters";
import { detectBoard } from "./detect";
import { jobPlace, wantedScope } from "./types";

/**
 * Workday's public careers API, with response shapes recorded from a live site (trimmed,
 * fictional jobs). Every list page is a POST to the same URL, so the stub answers by body.
 */

const BASE = "https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/External";
const TOKEN = "acme.wd3.External";

// A country facet nested in a location group, as Workday returns it.
const FACETS = [
  { facetParameter: "timeType", descriptor: "Time Type", values: [{ id: "ft", descriptor: "Full time" }] },
  {
    facetParameter: "locationMainGroup",
    values: [
      { facetParameter: "locationHierarchy2", descriptor: "Location Type", values: [{ id: "rem", descriptor: "Remote" }, { id: "off", descriptor: "Office" }] },
      { facetParameter: "locationHierarchy1", descriptor: "Locations", values: [{ id: "ca-id", descriptor: "Canada" }, { id: "us-id", descriptor: "United States of America" }, { id: "de-id", descriptor: "Germany" }] },
      { facetParameter: "locations", descriptor: "Sites", values: [{ id: "tor", descriptor: "Canada, Toronto" }] },
    ],
  },
];

const posting = (n: number, where = "Toronto, ON", posted = "Posted 2 Days Ago") => ({ title: `Analyst ${n}`, externalPath: `/job/Toronto/Analyst_R${n}`, locationsText: where, postedOn: posted, bulletFields: [`R${n}`] });

type Body = { appliedFacets: Record<string, string[]>; limit: number; offset: number };
function serveWorkday(answer: (body: Body | null, url: string) => unknown) {
  const calls: { url: string; body: Body | null; method: string }[] = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Body) : null;
    calls.push({ url: String(url), body, method: init?.method ?? "GET" });
    const out = answer(body, String(url));
    if (typeof out === "number") return new Response("", { status: out, headers: out === 429 ? { "retry-after": "120" } : {} });
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("Workday", () => {
  it("reads the token as tenant, server and site", () => {
    expect(workdayParts(TOKEN)).toMatchObject({ tenant: "acme", pod: "wd3", site: "External", base: BASE });
    expect(() => workdayParts("acme")).toThrow();
    expect(workday.boardUrl(TOKEN)).toBe("https://acme.wd3.myworkdayjobs.com/External");
  });

  it("finds the country facet by its values, wherever it sits", () => {
    const f = workdayCountryFacet(FACETS, ["CA", "US"]);
    expect(f?.param).toBe("locationHierarchy1");
    expect([...f!.ids]).toEqual([["CA", "ca-id"], ["US", "us-id"]]);
    expect(workdayCountryFacet([{ facetParameter: "timeType", values: [{ id: "x", descriptor: "Full time" }] }], ["CA"])).toBeNull();
  });

  it("dates postings from 'Posted N Days Ago'", () => {
    const now = Date.parse("2026-10-12T15:00:00Z");
    expect(workdayPostedOn("Posted Today", now)).toBe("2026-10-12");
    expect(workdayPostedOn("Posted Yesterday", now)).toBe("2026-10-11");
    expect(workdayPostedOn("Posted 3 Days Ago", now)).toBe("2026-10-09");
    expect(workdayPostedOn("Posted 30+ Days Ago", now)).toBe("2026-09-12");
    expect(workdayPostedOn(null, now)).toBeNull();
  });

  it("reads each searched country with its own filter, by POST, 20 at a time", async () => {
    const calls = serveWorkday((body) => {
      if (!body?.appliedFacets.locationHierarchy1) return { total: 900, jobPostings: [posting(1)], facets: FACETS };
      return { total: 2, jobPostings: [posting(10), posting(11, "2 Locations", "Posted Today")], facets: [] };
    });
    const r = await workday.fetchBoard(TOKEN, { countries: ["CA"] });
    expect(r.notModified).toBe(false);
    if (r.notModified) return;
    expect(calls[0]).toMatchObject({ url: `${BASE}/jobs`, method: "POST", body: { appliedFacets: {}, limit: 20, offset: 0 } });
    expect(calls[1].body).toMatchObject({ appliedFacets: { locationHierarchy1: ["ca-id"] }, offset: 0 });
    expect(r.jobs.map((j) => j.externalId)).toEqual(["job/Toronto/Analyst_R10", "job/Toronto/Analyst_R11"]);
    expect(r.jobs[0]).toMatchObject({ applyUrl: null, description: null, precision: "day", places: [{ text: "Toronto, ON, Canada", country: "CA" }] });
    // "2 Locations" says nothing: the country from the filter is all that's known until the detail is read.
    expect(r.jobs[1].places).toEqual([{ text: "Canada", country: "CA" }]);
    // Read by country, so what's missing can't be called closed.
    expect(r.partial).toBe(true);
    expect(jobPlace(r.jobs[0].places, r.jobs[0].remote, wantedScope(["CA"]))).toMatchObject({ country: "CA", province: "ON", city: "Toronto" });
  });

  it("stops at the page cap and says the read was partial", async () => {
    // As on live sites, only a series' first page carries the total.
    const calls = serveWorkday((body) => ({ total: body?.offset ? 0 : 5000, jobPostings: [posting(body?.offset ?? 0)], facets: [] }));
    const r = await workday.fetchBoard(TOKEN, { countries: ["CA"] });
    if (r.notModified) throw new Error("unexpected");
    expect(calls).toHaveLength(WD_PAGES);
    expect(r.partial).toBe(true);
  });

  it("reads a posting's link, description and exact places from its detail", async () => {
    const calls = serveWorkday(() => ({
      jobPostingInfo: {
        jobDescription: "<p>About the role</p><ul><li>SQL</li></ul>",
        location: "Vancouver, British Columbia",
        additionalLocations: ["Toronto, Ontario"],
        externalUrl: "https://acme.wd3.myworkdayjobs.com/External/job/Toronto/Analyst_R11",
        jobRequisitionLocation: { country: { alpha2Code: "CA" } },
      },
    }));
    const d = await workday.fetchDetail!(TOKEN, "job/Toronto/Analyst_R11", {});
    expect(calls[0]).toMatchObject({ url: `${BASE}/job/Toronto/Analyst_R11`, method: "GET" });
    expect(d).toMatchObject({ applyUrl: "https://acme.wd3.myworkdayjobs.com/External/job/Toronto/Analyst_R11", description: "About the role\n• SQL" });
    expect(d!.places).toEqual([{ text: "Vancouver, British Columbia", country: "CA" }, { text: "Toronto, Ontario", country: null }]);
  });

  it("treats a missing site as gone and honours Retry-After", async () => {
    serveWorkday(() => 404);
    await expect(workday.fetchBoard(TOKEN, {})).rejects.toMatchObject({ gone: true });
    serveWorkday(() => 429);
    await expect(workday.fetchBoard(TOKEN, {})).rejects.toMatchObject({ retryAfterSeconds: 120 });
  });

  it("recognizes Workday career site links", () => {
    expect(detectBoard("https://acme.wd3.myworkdayjobs.com/External")).toEqual({ ats: "workday", token: "acme.wd3.External" });
    expect(detectBoard("https://Acme.WD3.myworkdayjobs.com/en-US/External/job/Toronto/Analyst_R1")).toEqual({ ats: "workday", token: "acme.wd3.External" });
    expect(detectBoard("https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/External/jobs")).toEqual({ ats: "workday", token: "acme.wd3.External" });
    expect(detectBoard("https://acme.wd3.myworkdayjobs.com/job/x")).toBeNull();
  });

  it("verifies a posting's link only on its own tenant's site", () => {
    const ctx = { source: "ats" as const, ats: "workday" as const, boardToken: TOKEN, externalId: "job/Toronto/Analyst_R11", careersUrl: null, company: "Acme" };
    expect(checkJobLink("https://acme.wd3.myworkdayjobs.com/External/job/Toronto/Analyst_R11", ctx).ok).toBe(true);
    expect(checkJobLink("https://other.wd3.myworkdayjobs.com/External/job/Toronto/Analyst_R99", ctx).ok).toBe(false);
  });
});

describe("bestPlace", () => {
  const listed = { country: "CA", province: null, city: null, locationText: "Canada", remote: false, countries: ["CA"] };
  const known = { country: "CA", province: "BC", city: "Vancouver", location_text: "Vancouver, BC", remote: false, countries: ["CA"] };
  it("prefers the detail, then keeps an earlier exact place over a vague list entry", () => {
    const detail = { ...listed, province: "ON", city: "Toronto", locationText: "Toronto, Ontario" };
    expect(bestPlace(listed, detail, known)).toBe(detail);
    expect(bestPlace(listed, null, known)).toMatchObject({ province: "BC", city: "Vancouver" });
    expect(bestPlace({ ...listed, province: "AB", city: "Calgary" }, null, known)).toMatchObject({ province: "AB" });
    expect(bestPlace(listed, null, null)).toBe(listed);
  });
});
