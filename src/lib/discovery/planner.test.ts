import { describe, expect, it } from "vitest";
import { parseRequestDeterministic } from "./parse-request";
import { LINKEDIN_EXCLUSION, normalizeQuery, planQueries } from "./planner";

describe("planQueries", () => {
  const criteria = parseRequestDeterministic("Find 50 UofT Computer Engineering alumni working as software engineers at NVIDIA or AMD in Toronto");
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

describe("provider rotation", () => {
  it("every early batch tries each source", () => {
    const plan = planQueries(parseRequestDeterministic("Find 50 UofT Computer Engineering alumni working as software engineers"));
    expect(plan.slice(0, 3).map((p) => p.provider).sort()).toEqual(["github", "orcid", "web"]);
    expect(plan.slice(3, 6).map((p) => p.provider).sort()).toEqual(["github", "orcid", "web"]);
  });
});
