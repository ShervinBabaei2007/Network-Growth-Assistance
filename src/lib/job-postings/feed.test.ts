import { describe, expect, it } from "vitest";
import { chooseRange, ENOUGH_RESULTS, expansionNotice, parseRange, RANGES, titleQuery, titleSimilarity, type Range } from "./feed";
import { rankScore } from "./rank";

const byKey = (k: string) => RANGES.find((r) => r.key === k)!;
const counts = (c: Record<string, number>) => (r: Range) => c[r.key] ?? 0;

describe("chooseRange: freshness first, widening only when needed", () => {
  it("keeps 24 hours when there are enough verified jobs", () => {
    expect(chooseRange(counts({ "1d": ENOUGH_RESULTS, "3d": 30, "7d": 60 }), null)).toEqual({ range: byKey("1d"), expandedFrom: null, firstCount: ENOUGH_RESULTS });
  });

  it("widens to 3 days, then 7, and says so", () => {
    expect(chooseRange(counts({ "1d": 3, "3d": 12, "7d": 40 }), null)).toMatchObject({ range: byKey("3d"), expandedFrom: byKey("1d"), firstCount: 3 });
    const r = chooseRange(counts({ "1d": 4, "3d": 6, "7d": 9 }), null);
    expect(r).toMatchObject({ range: byKey("7d"), expandedFrom: byKey("1d") });
    expect(expansionNotice(r.firstCount, r.expandedFrom!, r.range)).toBe("Only 4 verified jobs were found in the last 24 hours, so the search was expanded to the last 7 days.");
  });

  it("never changes a range the user chose", () => {
    expect(chooseRange(counts({ "1d": 0 }), parseRange("1d"))).toEqual({ range: byKey("1d"), expandedFrom: null, firstCount: 0 });
    expect(chooseRange(counts({ "14d": 2 }), parseRange("14d")).range.key).toBe("14d");
  });
});

describe("titleQuery: any field, seniority not required", () => {
  it("doesn't require seniority words, and reads 'software development' as the developer role", () => {
    const q = titleQuery(["Junior software development"])!;
    expect(q).not.toContain("junior");
    expect(q).toContain("software:A & (developer:A | engineer:A | programmer:A)");
    // A title that is only a level word is kept as it is.
    expect(titleQuery(["Senior"])).toBe("(senior:A)");
  });

  it("finds close variants outside tech", () => {
    expect(titleQuery(["UX Designer"])).toContain("product:A & (designer:A | design:A)");
    expect(titleQuery(["Retail Associate"])).toContain("cashier:A");
    expect(titleQuery(["Customer Service Representative"])).toContain("(support:A | service:A)");
    expect(titleQuery(["Registered Nurse"])).toContain("practical:A");
    // "Business development" isn't a developer job.
    expect(titleQuery(["Business Development Representative"])).toContain("development:A");
    expect(titleQuery(["Business Development Representative"])).not.toContain("programmer");
  });

  it("scores a junior search against a plain title as an exact match", () => {
    expect(titleSimilarity("Software Developer", ["Junior Software Developer"])).toBe(1);
    expect(titleSimilarity("Sales Associate", ["Retail Associate"])).toBe(0.8);
  });
});

describe("titleSimilarity", () => {
  it("ranks exact titles above close variants, and those above broader ones", () => {
    const s = ["Full Stack Developer"];
    expect(titleSimilarity("Full-Stack Engineer", s)).toBe(1);
    expect(titleSimilarity("Software Engineer — Full Stack", s)).toBe(1);
    expect(titleSimilarity("Web Application Developer", s)).toBe(0.8);
    expect(titleSimilarity("Software Developer", s)).toBe(0.5);
    expect(titleSimilarity("Payroll Clerk", s)).toBeLessThan(0.3);
  });
});

describe("rankScore", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const base = { title: "Full Stack Developer", posted_at: "2026-10-11T08:00:00Z", date_source: "source", province: "BC", remote: false, source: "ats", verification_status: "verified" };
  const ctx = { searched: ["Full Stack Developer"], provinces: ["BC", "ON"], now };

  it("is deterministic and prefers better fit, closer titles, newer posts and verified links", () => {
    const a = rankScore(base, { score: 80, tier: "strong" }, null, ctx);
    expect(rankScore(base, { score: 80, tier: "strong" }, null, ctx)).toBe(a);
    expect(rankScore(base, { score: 50, tier: "stretch" }, null, ctx)).toBeLessThan(a);
    expect(rankScore({ ...base, title: "Software Developer" }, { score: 80, tier: "strong" }, null, ctx)).toBeLessThan(a);
    expect(rankScore({ ...base, posted_at: "2026-10-01T08:00:00Z" }, { score: 80, tier: "strong" }, null, ctx)).toBeLessThan(a);
    expect(rankScore({ ...base, verification_status: "pending_validation" }, { score: 80, tier: "strong" }, null, ctx)).toBeLessThan(a);
    expect(rankScore({ ...base, province: "ON" }, { score: 80, tier: "strong" }, null, ctx)).toBeLessThan(a);
  });

  it("gives a job the user doesn't qualify for no fit credit", () => {
    expect(rankScore(base, { score: 90, tier: "excluded" }, null, ctx)).toBeLessThan(rankScore(base, { score: 30, tier: "stretch" }, null, ctx));
  });
});

describe("filters", async () => {
  const { parseFilters, matchesFilters, employmentKind, annualMax } = await import("./filters");
  const job = { workplace_type: "hybrid", experience_level: "junior", employment_type: "Full-time", salary: "$70,000–$85,000 per year", salary_min: 70000, salary_max: 85000, salary_currency: "CAD", salary_period: "year", company: "Harbourview Software", source: "adzuna" };

  it("compares pay only in the searched country's currency, never converting", () => {
    expect(matchesFilters(job, parseFilters({ minpay: "80000" }), "CAD")).toBe(true);
    expect(matchesFilters({ ...job, salary_currency: "USD" }, parseFilters({ minpay: "80000" }), "CAD")).toBe(false);
    expect(matchesFilters({ ...job, salary_currency: null }, parseFilters({ minpay: "80000" }), "CAD")).toBe(false);
    expect(matchesFilters({ ...job, salary_currency: "USD" }, parseFilters({ minpay: "80000" }), "USD")).toBe(true);
    // No known currency for the country: the amount filter doesn't apply.
    expect(matchesFilters({ ...job, salary_currency: null }, parseFilters({ minpay: "80000" }), null)).toBe(true);
  });

  it("matches only stated data", () => {
    expect(matchesFilters(job, parseFilters({ wp: "hybrid", level: "junior,entry", type: "full", pay: "1", minpay: "80000", company: "harbour", src: "adzuna" }))).toBe(true);
    expect(matchesFilters({ ...job, workplace_type: null }, parseFilters({ wp: "hybrid" }))).toBe(false);
    expect(matchesFilters({ ...job, workplace_type: null }, parseFilters({ wp: "hybrid", wpu: "1" }))).toBe(true);
    expect(matchesFilters({ ...job, salary: null, salary_min: null, salary_max: null }, parseFilters({ pay: "1" }))).toBe(false);
    expect(matchesFilters(job, parseFilters({ minpay: "90000" }))).toBe(false);
    expect(matchesFilters({ ...job, employment_type: null }, parseFilters({ type: "full" }))).toBe(false);
    expect(matchesFilters(job, parseFilters({ level: "senior" }))).toBe(false);
    // The default level (from Settings) keeps jobs that don't state one; a chosen level doesn't.
    expect(matchesFilters({ ...job, experience_level: null }, { ...parseFilters({ level: "junior" }), levelStrict: false })).toBe(true);
    expect(matchesFilters({ ...job, experience_level: null }, parseFilters({ level: "junior" }))).toBe(false);
    expect(matchesFilters({ ...job, experience_level: "senior" }, { ...parseFilters({ level: "junior" }), levelStrict: false })).toBe(false);
  });

  it("reads employment types and yearly pay", () => {
    expect(["Full-time", "full_time", "Permanent", "Contract", "Part time", "Co-op", "Whatever"].map(employmentKind)).toEqual(["full", "full", "full", "contract", "part", "internship", null]);
    expect(annualMax({ salary_min: 30, salary_max: 40, salary_period: "hour" })).toBe(83200);
    expect(annualMax({ salary_min: null, salary_max: null, salary_period: null })).toBeNull();
  });

  it("ignores filter values it doesn't know", () => {
    expect(parseFilters({ wp: "moon,remote", level: "wizard", src: "linkedin" })).toMatchObject({ workplace: ["remote"], levels: [], sources: [] });
  });
});
