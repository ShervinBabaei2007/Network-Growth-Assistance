import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { LINKEDIN_EXCLUSION, normalizeQuery, planQueries } from "./planner";

describe("planQueries", () => {
  const base = testCriteria("Find 50 UofT Computer Engineering alumni working as software engineers at NVIDIA or AMD in Toronto");
  // The school's website, as the AI reading of a request (or the user) supplies it.
  const criteria = { ...base, education: { ...base.education, institutionDomains: ["utoronto.ca"] } };
  const plan = planQueries(criteria);

  it("plans many targeted searches across families", () => {
    expect(plan.length).toBeGreaterThan(8);
    const families = new Set(plan.map((p) => p.family));
    for (const f of ["core", "company", "location", "alumni", "github", "university_site"]) expect(families).toContain(f);
  });

  it("excludes LinkedIn from every web query", () => {
    for (const p of plan.filter((p) => p.provider === "web")) expect(p.query).toContain(LINKEDIN_EXCLUSION);
  });

  it("never plans the same query twice", () => {
    const keys = plan.map((p) => `${p.provider}:${normalizeQuery(p.query)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("starts with different kinds of sources", () => {
    expect(new Set(plan.slice(0, 4).map((p) => p.family)).size).toBeGreaterThanOrEqual(3);
  });

  it("respects the maximum", () => {
    expect(planQueries(criteria, 5)).toHaveLength(5);
  });

  it("uses the school's site when known", () => {
    expect(plan.some((p) => p.query.startsWith("site:utoronto.ca"))).toBe(true);
  });
});

describe("any field", () => {
  it("doesn't search GitHub or assume a role for a field without public code", () => {
    const base = testCriteria("Find 20 McGill University Nursing alumni");
    const nursing = { ...base, education: { ...base.education, programs: ["Nursing"], programAliases: ["BScN"] } };
    const plan = planQueries(nursing);
    expect(plan.some((p) => p.provider === "github")).toBe(false);
    expect(plan.some((p) => /engineer/i.test(p.query))).toBe(false);
    expect(plan.some((p) => p.query.includes('"McGill University"') && p.query.includes('"Nursing"'))).toBe(true);
  });
});

describe("provider rotation", () => {
  it("every early batch tries each source", () => {
    const plan = planQueries(testCriteria("Find 50 UofT Computer Engineering alumni working as software engineers"));
    expect(plan.slice(0, 3).map((p) => p.provider).sort()).toEqual(["github", "orcid", "web"]);
    expect(plan.slice(3, 6).map((p) => p.provider).sort()).toEqual(["github", "orcid", "web"]);
  });
});

describe("a request that names no school", () => {
  const base = testCriteria("Find 20 Computer Science alumni working as software engineers at startups in Vancouver");
  const criteria = { ...base, education: { ...base.education, institution: null, institutionAliases: [] }, includeStartups: true, locations: ["Vancouver"] };
  const plan = planQueries(criteria);

  it("still plans GitHub and ORCID searches from the program, role, startups and place", () => {
    const github = plan.filter((p) => p.provider === "github").map((p) => p.query);
    expect(github.length).toBeGreaterThan(2);
    expect(github.some((g) => g.includes('"Computer Science"') && g.includes('location:"Vancouver"'))).toBe(true);
    expect(github.some((g) => g.startsWith("startup ") && g.includes("Software Engineer"))).toBe(true);
    expect(plan.some((p) => p.provider === "orcid")).toBe(true);
  });

  it("never plans the same query twice", () => {
    const keys = plan.map((p) => `${p.provider}:${normalizeQuery(p.query)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("plans nothing from GitHub for a field without public code", () => {
    const nursing = { ...criteria, roles: ["Registered Nurse"], education: { ...criteria.education, programs: ["Nursing"], programAliases: [] } };
    expect(planQueries(nursing).some((p) => p.provider === "github")).toBe(false);
  });
});

describe("ORCID searches", () => {
  const base = testCriteria("Find 20 SFU Computer Science alumni working at Microsoft");
  const c = { ...base, companies: ["Microsoft"], education: { ...base.education, institution: "Simon Fraser University", institutionAliases: ["SFU"] } };
  const orcid = planQueries(c).filter((p) => p.provider === "orcid");

  it("also searches the school's short form, under the same label", () => {
    const full = orcid.find((p) => p.query.includes('"Simon Fraser University"') && p.query.includes('"Microsoft"'));
    const short = orcid.find((p) => p.query.startsWith('affiliation-org-name:"SFU"') && p.query.includes('"Microsoft"'));
    expect(full?.label).toBeTruthy();
    expect(short?.label).toBe(full?.label);
  });
});
