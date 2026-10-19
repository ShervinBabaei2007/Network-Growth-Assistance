import { beforeEach, describe, expect, it } from "vitest";
import { NURSING_CATALOG, TEST_CATALOG } from "@/test/catalog";
import { companyAliases, institutionMatcher, matchCompany, matchInstitution, matchProgram, programMatchers, roleAliases, type NetworkingCriteria } from "./criteria";
import { disabledLLM, type LLMProvider } from "./llm";
import { clearReadCache, parseRequest, parseRequestDeterministic, toCriteria, withUserLists } from "./parse-request";

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
  beforeEach(() => clearReadCache());
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

describe("a school named only by its short name", () => {
  const rorAnswer = { items: [{ names: [{ value: "Simon Fraser University", types: ["ror_display", "label"] }, { value: "SFU", types: ["acronym"] }], links: [{ type: "website", value: "https://www.sfu.ca/" }] }] };

  it("is looked up when the AI is unavailable, so the school is not lost", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(rorAnswer))) as typeof fetch;
    try {
      const down: LLMProvider = { enabled: true, structured: async () => ({ ok: false, reason: "The AI service returned an error (503)." }) };
      const r = await parseRequest(down, "Find 20 SFU alumni in Vancouver working at Microsoft");
      expect(r.usedAi).toBe(false);
      expect(r.criteria.education.institution).toBe("Simon Fraser University");
      expect(r.criteria.education.institutionAliases).toContain("SFU");
      expect(r.criteria.education.institutionDomains).toEqual(["sfu.ca"]);
      expect(r.criteria.companies).toContain("Microsoft");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("a school written in full, with its program right after", () => {
  it("keeps the school and the program apart", () => {
    const a = parseRequestDeterministic("Find 10 University of Waterloo Computer Science alumni working at Google");
    expect(a.education.institution).toBe("University of Waterloo");
    expect(a.education.programs).toEqual(["Computer Science"]);
    const b = parseRequestDeterministic("Find 10 University of Alberta Law alumni working as lawyers in Calgary");
    expect(b.education.institution).toBe("University of Alberta");
    expect(b.education.programs).toEqual(["Law"]);
  });
  it("leaves a plain school name alone", () => {
    expect(parseRequestDeterministic("Find 10 Queen's University Commerce alumni working at RBC in Toronto").education.institution).toBe("Queen's University");
    expect(parseRequestDeterministic("Find 5 McGill University alumni").education.institution).toBe("McGill University");
  });
});

describe("a school is not another school with a longer name", () => {
  const york = institutionMatcher({ ...base(), education: { ...base().education, institution: "York University", institutionAliases: [] } })!;
  it("rejects New York University for York University", () => {
    expect(matchInstitution("Education: New York University — Applied Psychology — PhD", york)).toBeNull();
    expect(matchInstitution("Institute of Human Development & Social Change, New York University", york)).toBeNull();
  });
  it("still accepts York University in any ordinary sentence", () => {
    expect(matchInstitution("Education: York University — Psychology — PhD (2020–present)", york)).toBe("strong");
    expect(matchInstitution("I studied at the York University campus in Toronto", york)).toBe("strong");
    expect(matchInstitution("BA, New York University; PhD, York University", york)).toBe("strong");
  });
});

describe("roles in a request the AI did not read", () => {
  it("takes the role from 'Find N <role> at/in…'", () => {
    const c = parseRequestDeterministic("Find 10 software engineers at startups in Vancouver");
    expect(c.roles).toEqual(["software engineers"]);
    expect(c.includeStartups).toBe(true);
    expect(c.locations).toEqual(["Vancouver"]);
  });
  it("does not mistake people, alumni or a school for a role", () => {
    expect(parseRequestDeterministic("Find 10 alumni at Shopify").roles).toEqual([]);
    expect(parseRequestDeterministic("Find 20 people in Toronto").roles).toEqual([]);
  });
  it("matches a plural request to the singular a person writes", () => {
    const aliases = roleAliases(["software engineers", "secretaries"]);
    expect(aliases).toContain("software engineer");
    expect(aliases).toContain("secretary");
  });
});

describe("startups", () => {
  const ai = (over: object): LLMProvider => ({
    enabled: true,
    structured: (async () => ({
      ok: true,
      data: { targetCount: 10, institution: "University of Toronto", institutionAliases: [], institutionDomains: [], programs: [], programAliases: [], graduationYearMin: null, graduationYearMax: null, studentStatus: "alumni", roles: ["Data Scientist"], locations: ["Toronto"], country: null, companies: [], includeStartups: false, excludeExistingConnections: true, goal: null, ...over },
    })) as LLMProvider["structured"],
  });

  it("is only believed when the request mentions startups", async () => {
    clearReadCache();
    const invented = await parseRequest(ai({ includeStartups: true }), "Find 10 University of Toronto alumni working as data scientists in Toronto");
    expect(invented.criteria.includeStartups).toBe(false);
    clearReadCache();
    const asked = await parseRequest(ai({ includeStartups: true }), "Find 10 University of Toronto alumni working at startups");
    expect(asked.criteria.includeStartups).toBe(true);
  });
});
