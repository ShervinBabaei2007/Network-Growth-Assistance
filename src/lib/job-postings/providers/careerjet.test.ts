import { describe, expect, it } from "vitest";
import { searchProviders } from "./registry";
import { CareerjetProvider, careerjetId } from "./careerjet";
import type { SearchQuery } from "./types";

/** Careerjet's search API, with a trimmed answer in its documented shape (fictional jobs). */

const query: SearchQuery = { what: "Nurse", country: "CA", where: "Vancouver", maxDaysOld: 30, page: 1, client: { ip: "203.0.113.7", userAgent: "Mozilla/5.0 Test" } };
const job = (over: Record<string, unknown> = {}) => ({
  url: "https://jobviewer.careerjet.ca/a1b2c3d4e5f6.html?affid=x",
  title: "Registered Nurse - Emergency",
  company: "Coastal Health",
  date: "Mon, 12 Oct 2026 08:00:00 GMT",
  description: "<b>Registered Nurse</b> for our emergency department…",
  locations: "Vancouver, BC",
  salary: "$45 - $55 per hour",
  salary_min: 45,
  salary_max: 55,
  salary_type: "H",
  salary_currency_code: "CAD",
  ...over,
});

function fake(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

describe("Careerjet", () => {
  it("asks for the country's site, with the searching person's IP and browser, by publisher key", async () => {
    const { f, calls } = fake({ type: "JOBS", hits: 1, jobs: [job()] });
    const r = await new CareerjetProvider("pub-key", f).searchJobs(query, AbortSignal.timeout(1000));
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://search.api.careerjet.net/v4/query");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ locale_code: "en_CA", keywords: "Nurse", location: "Vancouver", user_ip: "203.0.113.7", user_agent: "Mozilla/5.0 Test", page_size: "50" });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("pub-key:").toString("base64")}`);
    expect(r).toMatchObject({ outcome: "ok", total: 1, skipped: 0 });
    expect(r.jobs[0]).toMatchObject({
      source: "careerjet",
      provider_key: "careerjet:a1b2c3d4e5f6",
      external_id: "a1b2c3d4e5f6",
      title: "Registered Nurse - Emergency",
      company: "Coastal Health",
      city: "Vancouver",
      province: "BC",
      country: "CA",
      apply_url: "https://jobviewer.careerjet.ca/a1b2c3d4e5f6.html?affid=x",
      description_is_partial: true,
      salary_min: 45,
      salary_max: 55,
      salary_period: "hour",
      salary_currency: "CAD",
      verification_status: "pending_validation",
    });
  });

  it("isn't asked without a person searching, or for a country it doesn't serve", async () => {
    const { f, calls } = fake({ type: "JOBS", jobs: [job()] });
    const p = new CareerjetProvider("k", f);
    expect((await p.searchJobs({ ...query, client: null }, AbortSignal.timeout(1000))).outcome).toBe("empty");
    expect((await p.searchJobs({ ...query, country: "JP" }, AbortSignal.timeout(1000))).outcome).toBe("empty");
    expect(calls).toHaveLength(0);
  });

  it("drops results that don't link to Careerjet's own listing", async () => {
    const { f } = fake({ type: "JOBS", jobs: [job({ url: "https://jobs.example-scam.com/a1b2c3d4e5f6" }), job({ url: "https://www.careerjet.evil.com/a1b2c3d4e5f6.html" }), job({ date: "not a date" })] });
    const r = await new CareerjetProvider("k", f).searchJobs(query, AbortSignal.timeout(1000));
    expect(r.jobs).toHaveLength(0);
    expect(r.skipped).toBe(3);
  });

  it("reports an ambiguous place, a rejected key and a busy service plainly", async () => {
    expect((await new CareerjetProvider("k", fake({ type: "LOCATIONS", locations: ["Vancouver, BC", "Vancouver, WA"] }).f).searchJobs(query, AbortSignal.timeout(1000))).outcome).toBe("empty");
    await expect(new CareerjetProvider("k", fake({}, 403).f).searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "auth" });
    await expect(new CareerjetProvider("k", fake({}, 429).f).searchJobs(query, AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "rate_limited" });
  });

  it("takes the listing's id from its link", () => {
    expect(careerjetId(new URL("https://jobviewer.careerjet.ca/a1b2c3d4e5f6.html"))).toBe("a1b2c3d4e5f6");
    expect(careerjetId(new URL("https://www.careerjet.ca/"))).toBeNull();
  });

  it("is on only with a publisher key", () => {
    expect(searchProviders({ CAREERJET_API_KEY: "k" }).providers.map((p) => p.name)).toContain("careerjet");
    expect(searchProviders({}).providers.map((p) => p.name)).not.toContain("careerjet");
  });
});
