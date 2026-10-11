import { describe, expect, it } from "vitest";
import { institutionMatcher, matchInstitution, matchProgram, programMatchers, roleAliases, type NetworkingCriteria } from "./criteria";
import { disabledLLM, type LLMProvider } from "./llm";
import { parseRequest, parseRequestDeterministic, toCriteria } from "./parse-request";

const base = (over: Partial<NetworkingCriteria["education"]> = {}): NetworkingCriteria => ({
  targetCount: 50,
  education: { institution: "University of Toronto", institutionAliases: ["UofT", "U of T"], programs: ["Computer Engineering"], broadenEce: false, graduationYearMin: null, graduationYearMax: null, status: "any", ...over },
  roles: ["Software Engineer"],
  locations: [],
  country: "Canada",
  companies: [],
  includeStartups: false,
  excludeExistingConnections: true,
  goal: null,
});

describe("parseRequestDeterministic", () => {
  it("understands the headline example", () => {
    const c = parseRequestDeterministic("Find me 50 people who studied Computer Engineering at the University of Toronto who I am not already connected with.");
    expect(c.targetCount).toBe(50);
    expect(c.education.institution).toBe("University of Toronto");
    expect(c.education.programs).toEqual(["Computer Engineering"]);
    expect(c.excludeExistingConnections).toBe(true);
    expect(c.locations).toEqual([]);
  });

  it("reads aliases, roles and two cities", () => {
    const c = parseRequestDeterministic("Find me 30 UofT ECE alumni working in software engineering in Vancouver or Toronto");
    expect(c.targetCount).toBe(30);
    expect(c.education.institution).toBe("University of Toronto");
    expect(c.education.programs).toEqual(["Electrical and Computer Engineering"]);
    expect(c.education.broadenEce).toBe(true);
    expect(c.roles).toContain("Software Engineer");
    expect(c.locations.sort()).toEqual(["Toronto", "Vancouver"]);
  });

  it("reads companies and startups", () => {
    const c = parseRequestDeterministic("Find me UofT Computer Engineering graduates working at NVIDIA, AMD, Microsoft, Amazon, Apple, or startups.");
    expect(c.companies).toEqual(["NVIDIA", "AMD", "Microsoft", "Amazon", "Apple"]);
    expect(c.includeStartups).toBe(true);
    expect(c.targetCount).toBe(25);
  });

  it("doesn't treat Computer Engineering as ECE", () => {
    const c = parseRequestDeterministic("UofT Computer Engineering software engineers");
    expect(c.education.broadenEce).toBe(false);
  });
});

describe("toCriteria", () => {
  it("clamps and cleans model output", () => {
    const c = toCriteria(
      {
        targetCount: 5000,
        institution: "  University of Toronto ",
        institutionAliases: ["UofT", "UofT", ""],
        programs: ["Computer Engineering", "x".repeat(200)],
        countEceAsMatch: false,
        graduationYearMin: 1800,
        graduationYearMax: 2024,
        studentStatus: "any",
        roles: [],
        locations: [],
        companies: [],
        includeStartups: false,
        excludeExistingConnections: true,
        goal: null,
      },
      "",
    );
    expect(c.targetCount).toBe(100);
    expect(c.education.institutionAliases).toEqual(["UofT"]);
    expect(c.education.programs).toEqual(["Computer Engineering"]);
    expect(c.education.graduationYearMin).toBeNull();
    expect(c.education.graduationYearMax).toBe(2024);
  });
});

describe("parseRequest", () => {
  it("falls back to the deterministic parser without AI", async () => {
    const r = await parseRequest(disabledLLM, "Find 20 UBC Computer Science students");
    expect(r.usedAi).toBe(false);
    expect(r.criteria.education.institution).toBe("University of British Columbia");
  });

  it("keeps the school if the model drops it", async () => {
    const llm: LLMProvider = {
      enabled: true,
      async structured() {
        return {
          ok: true,
          data: { targetCount: 10, institution: null, institutionAliases: [], programs: [], countEceAsMatch: false, graduationYearMin: null, graduationYearMax: null, studentStatus: "any", roles: ["Software Engineer"], locations: [], companies: [], includeStartups: false, excludeExistingConnections: true, goal: "internships" },
        } as never;
      },
    };
    const r = await parseRequest(llm, "Find 10 UofT Computer Engineering grads");
    expect(r.usedAi).toBe(true);
    expect(r.criteria.education.institution).toBe("University of Toronto");
    expect(r.criteria.education.programs).toEqual(["Computer Engineering"]);
    expect(r.criteria.goal).toBe("internships");
  });

  it("falls back when the model fails", async () => {
    const llm: LLMProvider = { enabled: true, structured: async () => ({ ok: false, reason: "busy" }) };
    const r = await parseRequest(llm, "Find 10 UofT Computer Engineering grads");
    expect(r).toMatchObject({ usedAi: false, note: "busy" });
  });
});

describe("matching", () => {
  it("matches the school by full name and its known short forms, but not lookalikes", () => {
    const m = institutionMatcher(base())!;
    expect(matchInstitution("BASc, University of Toronto", m)).toBe("strong");
    expect(matchInstitution("UofT '24", m)).toBe("strong");
    expect(matchInstitution("U of T Engineering", m)).toBe("strong");
    expect(matchInstitution("Toronto Metropolitan University", m)).toBeNull();
    expect(matchInstitution("UTM Malaysia", m)).toBeNull();
  });

  it("never reads ECE as Computer Engineering unless broadened", () => {
    const programs = programMatchers(base());
    expect(matchProgram("Computer Engineering", programs, false)).toEqual({ kind: "exact", program: "Computer Engineering" });
    expect(matchProgram("Comp Eng 2T4", programs, false)?.kind).toBe("exact");
    expect(matchProgram("Electrical and Computer Engineering", programs, false)?.kind).toBe("ece");
    expect(matchProgram("ECE", programs, true)?.kind).toBe("exact");
    expect(matchProgram("Electrical Engineering", programs, false)).toBeNull();
  });

  it("expands roles to common equivalents", () => {
    expect(roleAliases(["Software Engineer"])).toEqual(expect.arrayContaining(["software developer", "backend engineer", "sde"]));
  });
});
