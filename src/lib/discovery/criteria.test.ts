import { describe, expect, it } from "vitest";
import { NURSING_CATALOG, TEST_CATALOG } from "@/test/catalog";
import { companyAliases, institutionMatcher, matchCompany, matchInstitution, matchProgram, programMatchers, roleAliases, type NetworkingCriteria } from "./criteria";
import { disabledLLM, type LLMProvider } from "./llm";
import { parseRequest, parseRequestDeterministic, toCriteria, withUserLists } from "./parse-request";

const base = (over: Partial<NetworkingCriteria["education"]> = {}): NetworkingCriteria => ({
  targetCount: 50,
  education: {
    institution: "University of Toronto",
    institutionAliases: ["UofT", "U of T"],
    vettedAliases: [],
    institutionDomains: [],
    programs: ["Computer Engineering"],
    programAliases: [],
    broadenEce: false,
    graduationYearMin: null,
    graduationYearMax: null,
    status: "any",
    ...over,
  },
  roles: ["Software Engineer"],
  locations: [],
  country: null,
  companies: [],
  includeStartups: false,
  excludeExistingConnections: true,
  goal: null,
});

const modelAnswer = (over: Record<string, unknown> = {}) => ({
  targetCount: 10,
  institution: null,
  institutionAliases: [],
  institutionDomains: [],
  programs: [],
  programAliases: [],
  graduationYearMin: null,
  graduationYearMax: null,
  studentStatus: "any",
  roles: [],
  locations: [],
  country: null,
  companies: [],
  includeStartups: false,
  excludeExistingConnections: true,
  goal: null,
  ...over,
});

describe("parseRequestDeterministic: nothing built in", () => {
  it("reads the user's own school and discipline from the request", () => {
    const c = parseRequestDeterministic("Find me 50 people who studied Computer Engineering at the University of Toronto who I am not already connected with.", TEST_CATALOG);
    expect(c.targetCount).toBe(50);
    expect(c.education.institution).toBe("University of Toronto");
    expect(c.education.programs).toEqual(["Computer Engineering"]);
    // The user's own spellings count as strongly as the full name.
    expect(c.education.vettedAliases).toEqual(expect.arrayContaining(["UofT", "U of T"]));
    expect(c.education.programAliases).toEqual(expect.arrayContaining(["cpen"]));
    expect(c.excludeExistingConnections).toBe(true);
    expect(c.country).toBeNull();
  });

  it("works for any field", () => {
    const c = parseRequestDeterministic("Find 20 McGill BScN alumni working as registered nurses in Montreal", NURSING_CATALOG);
    expect(c.education.institution).toBe("McGill University");
    expect(c.education.programs).toEqual(["Nursing"]);
    expect(c.roles).toEqual(["registered nurses"]);
    expect(c.locations).toEqual(["Montreal"]);
    expect(c.education.status).toBe("alumni");
  });

  it("finds schools by their written name and employers after “at”, with no lists", () => {
    const c = parseRequestDeterministic("Find graduates of Humber College working at Sunnybrook Hospital or startups");
    expect(c.education.institution).toBe("Humber College");
    expect(c.companies).toEqual(["Sunnybrook Hospital"]);
    expect(c.includeStartups).toBe(true);
    expect(c.targetCount).toBe(25);
  });

  it("reads a country only when the request names one", () => {
    expect(parseRequestDeterministic("Find 5 nurses in Canada").country).toBe("Canada");
    expect(parseRequestDeterministic("Find 5 lawyers in the United Kingdom").country).toBe("United Kingdom");
    const city = parseRequestDeterministic("Find 5 nurses in Vancouver");
    expect(city.country).toBeNull();
    expect(city.locations).toEqual(["Vancouver"]);
  });

  it("assumes no school, program or country it wasn't told", () => {
    const c = parseRequestDeterministic("Find 10 people I could learn from");
    expect(c.education.institution).toBeNull();
    expect(c.education.programs).toEqual([]);
    expect(c.roles).toEqual([]);
    expect(c.country).toBeNull();
  });
});

describe("toCriteria", () => {
  it("clamps and cleans model output", () => {
    const c = toCriteria(
      modelAnswer({
        targetCount: 5000,
        institution: "  University of Toronto ",
        institutionAliases: ["UofT", "UofT", ""],
        programs: ["Computer Engineering", "x".repeat(200)],
        graduationYearMin: 1800,
        graduationYearMax: 2024,
        country: "  Canada ",
      }) as never,
      "",
    );
    expect(c.targetCount).toBe(100);
    expect(c.education.institutionAliases).toEqual(["UofT"]);
    expect(c.education.programs).toEqual(["Computer Engineering"]);
    expect(c.education.graduationYearMin).toBeNull();
    expect(c.education.graduationYearMax).toBe(2024);
    expect(c.country).toBe("Canada");
  });
});

describe("parseRequest", () => {
  it("falls back to the deterministic parser without AI", async () => {
    const r = await parseRequest(disabledLLM, "Find 20 UBC Computer Science students", TEST_CATALOG);
    expect(r.usedAi).toBe(false);
    expect(r.criteria.education.institution).toBe("UBC");
    expect(r.criteria.education.programs).toEqual(["Computer Science"]);
  });

  it("keeps the school if the model drops it, and adds the user's own spellings", async () => {
    const llm: LLMProvider = {
      enabled: true,
      async structured() {
        return { ok: true, data: modelAnswer({ roles: ["Software Engineer"], goal: "internships" }) } as never;
      },
    };
    const r = await parseRequest(llm, "Find 10 UofT Computer Engineering grads", TEST_CATALOG);
    expect(r.usedAi).toBe(true);
    expect(r.criteria.education.institution).toBe("University of Toronto");
    expect(r.criteria.education.programs).toEqual(["Computer Engineering"]);
    expect(r.criteria.education.vettedAliases).toContain("UofT");
    expect(r.criteria.goal).toBe("internships");
  });

  it("falls back when the model fails", async () => {
    const llm: LLMProvider = { enabled: true, structured: async () => ({ ok: false, reason: "busy" }) };
    const r = await parseRequest(llm, "Find 10 UofT Computer Engineering grads", TEST_CATALOG);
    expect(r).toMatchObject({ usedAi: false, note: "busy" });
  });
});

describe("withUserLists", () => {
  it("adds nothing for a school or program the user hasn't listed", () => {
    const c = withUserLists(base({ institution: "Harvard University", programs: ["Law"] }), TEST_CATALOG);
    expect(c.education.vettedAliases).toEqual([]);
    expect(c.education.programAliases).toEqual([]);
  });
});

describe("matching", () => {
  it("matches the school by its full name and longer short forms; short unvetted ones are weaker", () => {
    const m = institutionMatcher(base())!;
    expect(matchInstitution("BASc, University of Toronto", m)).toBe("strong");
    expect(matchInstitution("U of T Engineering", m)).toBe("strong");
    expect(matchInstitution("UofT '24", m)).toBe("acronym");
    expect(matchInstitution("Toronto Metropolitan University", m)).toBeNull();
  });

  it("trusts the user's own spellings fully", () => {
    const m = institutionMatcher(base({ vettedAliases: ["UofT"] }))!;
    expect(matchInstitution("UofT '24", m)).toBe("strong");
  });

  it("matches programs by their name and the other names given for them", () => {
    const programs = programMatchers(base({ programs: ["Nursing"], programAliases: ["BScN", "BSN"] }));
    expect(matchProgram("Nursing graduate", programs)).toEqual({ kind: "exact", program: "Nursing" });
    expect(matchProgram("BScN 2022", programs)?.program).toBe("Nursing");
    expect(matchProgram("Computer Engineering", programs)).toBeNull();
  });

  it("expands roles to common equivalents, in any field", () => {
    expect(roleAliases(["Software Engineer"])).toEqual(expect.arrayContaining(["software developer", "backend engineer", "sde"]));
    expect(roleAliases(["Nurse"])).toEqual(expect.arrayContaining(["registered nurse", "rn"]));
    expect(roleAliases(["Lawyer"])).toEqual(expect.arrayContaining(["associate", "barrister"]));
  });
});

describe("matchCompany", () => {
  const apple = companyAliases(["Apple"]);
  it("accepts the company with a corporate or regional suffix", () => {
    for (const v of ["Apple", "Apple Inc.", "Apple Canada", "Apple (United States)"]) expect(matchCompany(v, apple), v).toBe("apple");
  });
  it("rejects other organizations that contain a common word", () => {
    for (const v of ["Apple Valley Hospital", "Big Apple Bagels", "Pineapple Labs"]) expect(matchCompany(v, apple), v).toBeNull();
  });
  it("still finds units of an unambiguous company", () => {
    const ms = companyAliases(["Microsoft"]);
    for (const v of ["Microsoft Research (United Kingdom)", "Microsoft Corp", "Microsoft (India)"]) expect(matchCompany(v, ms), v).toBe("microsoft");
    expect(matchCompany("Amazon Lab126", companyAliases(["Amazon"]))).toBe("amazon");
  });
});
