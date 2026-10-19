import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { evaluateCriteria } from "./evidence";
import { draftFromOrcid, staleRecord } from "./extract";
import type { OrcidAffiliation, OrcidProfile } from "./providers/types";
import { scorePerson } from "./score";

// Shapes taken from real ORCID records for "SFU alumni at Microsoft", with invented names.
const base = testCriteria("Find 20 Computer Science alumni working at Microsoft");
const criteria = { ...base, country: null, locations: [], education: { ...base.education, institution: "Simon Fraser University", institutionAliases: ["SFU"], programs: [], programAliases: [] } };

const aff = (organization: string, city: string, country: string, startYear: number | null, endYear: number | null, role: string | null = null): OrcidAffiliation => ({ organization, city, country, department: null, role, startYear, endYear });
const person = (over: Partial<OrcidProfile>): OrcidProfile => ({ orcidId: "0000-0000-0000-0001", name: "Test Person", biography: null, urls: [], countries: [], educations: [], employments: [], htmlUrl: "https://orcid.org/0000-0000-0000-0001", lastModified: null, ...over });

const NOW = new Date("2026-10-18T00:00:00Z");
const msc = aff("Simon Fraser University", "Burnaby", "CA", 2010, 2012);
const evaluate = (p: OrcidProfile) => {
  const d = draftFromOrcid(p, criteria, NOW);
  return d ? { d, ev: evaluateCriteria(d.facts, criteria, NOW) } : null;
};

describe("ORCID current employment", () => {
  it("is high confidence on a record edited recently", () => {
    const r = evaluate(person({ educations: [msc], employments: [aff("Microsoft Corp", "Redmond", "US", 2013, null)], lastModified: "2026-03-01T00:00:00Z" }));
    expect(r?.ev.company.confidence).toBe("high");
    expect(scorePerson(r!.ev, r!.d.facts).tier).toBe("verified");
  });

  it("drops to low, so the person is only possible, when the record hasn't been edited for over two years", () => {
    const r = evaluate(person({ educations: [msc], employments: [aff("Microsoft Corp", "Redmond", "US", 2013, null)], lastModified: "2022-06-01T00:00:00Z" }));
    expect(r?.ev.company.confidence).toBe("low");
    expect(r?.d.facts.find((f) => f.field === "company")?.extractedText).toContain("record last updated 2022");
    const scored = scorePerson(r!.ev, r!.d.facts);
    expect(scored.tier).toBe("possible");
    expect(scored.tierReason).toContain("company (profile last updated 2022)");
  });

  it("counts a job that ends this year as current, and one that ended earlier as past", () => {
    const intern = evaluate(person({ educations: [msc], employments: [aff("Microsoft", "Vancouver", "CA", 2026, 2026, "Research Intern")], lastModified: "2026-09-01T00:00:00Z" }));
    expect(intern?.ev.company.confidence).toBe("high");
    const past = evaluate(person({ educations: [msc], employments: [aff("Microsoft (India)", "Hyderabad", "IN", 2020, 2022)], lastModified: "2026-09-01T00:00:00Z" }));
    expect(past?.ev.company.confidence).toBeNull();
  });

  it("treats an unknown edit date as fresh (nothing to hold against the person)", () => {
    expect(staleRecord(null, NOW)).toBeNull();
    expect(staleRecord("2025-01-01T00:00:00Z", NOW)).toBeNull();
    expect(staleRecord("2023-01-01T00:00:00Z", NOW)).toBe(2023);
  });
});

describe("ORCID school", () => {
  it("never counts working at the school as studying there", () => {
    const r = evaluate(person({ educations: [aff("The University of British Columbia", "Vancouver", "CA", 2017, 2022)], employments: [aff("Simon Fraser University", "Burnaby", "CA", 2016, 2017, "Research Assistant"), aff("Microsoft", "Redmond", "US", 2022, null)], lastModified: "2026-03-01T00:00:00Z" }));
    expect(r).toBeNull();
  });
});

describe("people from the right school with no sign of the company", () => {
  it("are not matches when specific companies were named", () => {
    const r = evaluate(person({ educations: [msc], lastModified: "2026-03-01T00:00:00Z" }));
    const scored = scorePerson(r!.ev, r!.d.facts);
    expect(scored.tier).toBe("rejected");
    expect(scored.tierReason).toBe("No evidence they work at a company you named");
  });

  it("stay possible when the request only asked for startups", () => {
    const startups = { ...criteria, companies: [], includeStartups: true };
    const d = draftFromOrcid(person({ educations: [msc], lastModified: "2026-03-01T00:00:00Z" }), startups, NOW)!;
    expect(scorePerson(evaluateCriteria(d.facts, startups, NOW), d.facts).tier).toBe("possible");
  });
});
