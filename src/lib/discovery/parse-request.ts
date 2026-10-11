import { z } from "zod";
import { DISCIPLINE_ALIASES, UNIVERSITY_ALIASES } from "@/lib/classify";
import { UNIVERSITY_LABELS, type University } from "@/lib/domain";
import { clean, has, hasAny } from "@/lib/text/match";
import { DEFAULT_TARGET, knownInstitution, NetworkingCriteria } from "./criteria";
import type { LLMProvider } from "./llm";

/** What the model may return. Kept flat and permissive; `toCriteria` validates and clamps. */
const ParsedRequest = z.object({
  targetCount: z.number().nullable(),
  institution: z.string().nullable(),
  institutionAliases: z.array(z.string()),
  programs: z.array(z.string()),
  countEceAsMatch: z.boolean(),
  graduationYearMin: z.number().nullable(),
  graduationYearMax: z.number().nullable(),
  studentStatus: z.enum(["any", "alumni", "student"]),
  roles: z.array(z.string()),
  locations: z.array(z.string()),
  companies: z.array(z.string()),
  includeStartups: z.boolean(),
  excludeExistingConnections: z.boolean(),
  goal: z.string().nullable(),
});
type ParsedRequest = z.infer<typeof ParsedRequest>;

const SYSTEM = `You turn a networking research request into structured search criteria.

The user is looking for people to meet professionally. Extract only what the request says:
- targetCount: the number of people asked for, or null.
- institution: the school's full official name (e.g. "University of Toronto" for "UofT"), or null.
- institutionAliases: common short forms of that school (e.g. "UofT", "U of T").
- programs: academic programs named, spelled out in full (e.g. "Computer Engineering" for "CE" or "Comp Eng").
- countEceAsMatch: true only if the request explicitly accepts "ECE" / "Electrical and Computer Engineering" as a match. "ECE alumni" counts; "Computer Engineering" alone does not.
- graduationYearMin / Max: only if a graduation year or range is stated.
- studentStatus: "alumni" if the request asks for graduates or alumni only, "student" if it asks for current students only, otherwise "any" (including "students or alumni").
- roles: job titles asked for, plus close equivalents (e.g. "Software Engineer", "Software Developer", "Backend Engineer").
- locations: cities or regions asked for.
- companies: employers asked for, by their common names.
- includeStartups: true if startups are mentioned as acceptable employers.
- excludeExistingConnections: false only if the request says to include people the user already knows.
- goal: the user's stated reason or situation (e.g. "I'm a junior developer looking for internships"), or null.

Never add a school, program, company, role or location the request doesn't mention or clearly imply.`;

const trimList = (xs: string[], max: number, len: number) =>
  [...new Set(xs.map((x) => x.trim().replace(/\s+/g, " ")).filter((x) => x && x.length <= len))].slice(0, max);

const year = (y: number | null) => (y && Number.isInteger(y) && y >= 1950 && y <= 2100 ? y : null);

/** Validates and clamps model (or fallback) output into criteria. */
export function toCriteria(p: ParsedRequest, query: string): NetworkingCriteria {
  const requested = p.targetCount ?? countFromText(query);
  const institution = p.institution?.trim() ? p.institution.trim().slice(0, 120) : null;
  return NetworkingCriteria.parse({
    targetCount: Math.min(100, Math.max(1, Math.round(requested ?? DEFAULT_TARGET))),
    education: {
      institution,
      institutionAliases: trimList(p.institutionAliases, 12, 60),
      programs: trimList(p.programs, 8, 80),
      broadenEce: p.countEceAsMatch,
      graduationYearMin: year(p.graduationYearMin),
      graduationYearMax: year(p.graduationYearMax),
      status: p.studentStatus,
    },
    roles: trimList(p.roles, 12, 80),
    locations: trimList(p.locations, 10, 80),
    // Discovery looks for people in Canada only; a search can be changed under Modify.
    country: "Canada",
    companies: trimList(p.companies, 15, 80),
    includeStartups: p.includeStartups,
    excludeExistingConnections: p.excludeExistingConnections,
    goal: p.goal?.trim() ? p.goal.trim().slice(0, 300) : null,
  });
}

function countFromText(query: string): number | null {
  const m = query.match(/\b(?:find|show|get|list|give me)?\s*(\d{1,3})\b(?!\s*(?:k\b|years?|%))/i);
  return m ? Number(m[1]) : null;
}

const KNOWN_COMPANIES = ["NVIDIA", "AMD", "Microsoft", "Amazon", "Apple", "Google", "Meta", "Intel", "Qualcomm", "Shopify", "Tesla", "IBM", "Cisco", "Oracle", "Salesforce", "Uber", "Stripe", "Wealthsimple", "Cohere", "OpenAI", "Anthropic"];
const KNOWN_LOCATIONS = ["Toronto", "Vancouver", "Waterloo", "Montreal", "Ottawa", "Calgary", "Seattle", "San Francisco", "New York", "Bay Area", "Burnaby", "Mississauga"];
const PROGRAM_NAMES: Record<string, string> = { ce: "Computer Engineering", ee: "Electrical Engineering", mech: "Mechatronics Engineering", cs: "Computer Science" };

/** Understands common requests without a model: schools, programs, roles, companies, places, count. */
export function parseRequestDeterministic(query: string): NetworkingCriteria {
  const t = clean(query);
  let institution: string | null = null;
  let aliases: string[] = [];
  for (const [u, list] of Object.entries(UNIVERSITY_ALIASES) as [University, readonly string[]][]) {
    if (hasAny(t, list)) {
      institution = UNIVERSITY_LABELS[u];
      aliases = list.filter((a) => a.length <= 8).map((a) => (a === "uoft" ? "UofT" : a === "u of t" ? "U of T" : a.toUpperCase()));
      break;
    }
  }
  if (!institution) {
    // Other schools by their written name: "University of Ottawa", "McGill University", "Georgia Institute of Technology".
    const word = "[A-Z][\\p{L}'’.&-]*";
    const m =
      query.match(new RegExp(`\\b(?:University|Université) of (?:${word}\\s?)+`, "u")) ??
      query.match(new RegExp(`\\b(?:${word}\\s)+(?:University|Institute of Technology|Polytechnic(?: University)?|College)\\b`, "u"));
    const name = m?.[0].trim().replace(/\s+(?:who|working|and|in|at)$/i, "");
    if (name && !/^(Find|Show|Get|List)\b/.test(name)) institution = name;
  }
  const programs: string[] = [];
  for (const [d, list] of Object.entries(DISCIPLINE_ALIASES)) {
    // "cs" and "ce" alone are too short to trust inside free text unless written as words.
    if (hasAny(t, list) || (d === "ce" && has(t, "ce"))) programs.push(PROGRAM_NAMES[d]);
  }
  const ece = hasAny(t, ["ece", "electrical and computer engineering"]);
  if (ece && !programs.length) programs.push("Electrical and Computer Engineering");

  const roles: string[] = [];
  if (hasAny(t, ["software", "swe", "developer", "developers", "backend", "full stack", "fullstack"])) roles.push("Software Engineer", "Software Developer");
  if (hasAny(t, ["hardware", "asic", "fpga"])) roles.push("Hardware Engineer");
  if (hasAny(t, ["machine learning", "ml", "ai engineer"])) roles.push("Machine Learning Engineer");

  const companies = KNOWN_COMPANIES.filter((c) => has(t, clean(c).trim()));
  const locations = KNOWN_LOCATIONS.filter((l) => has(t, clean(l).trim()) && !(l === "Toronto" && institution === UNIVERSITY_LABELS.uoft && !/\bin\s+(?:\w+\s+or\s+)?toronto\b/i.test(query)));

  return toCriteria(
    {
      targetCount: countFromText(query),
      institution,
      institutionAliases: aliases,
      programs,
      countEceAsMatch: ece,
      graduationYearMin: null,
      graduationYearMax: null,
      studentStatus: statusFromText(t),
      roles,
      locations,
      companies,
      includeStartups: has(t, "startups") || has(t, "startup"),
      excludeExistingConnections: true,
      goal: null,
    },
    query,
  );
}

/** "alumni", "graduates" → alumni only; "students" → students only; both or neither → any. */
export function statusFromText(t: string): "any" | "alumni" | "student" {
  const alumni = hasAny(t, ["alumni", "alumnus", "alumna", "graduate", "graduates", "grads", "grad", "graduated"]);
  const students = hasAny(t, ["student", "students", "undergrads", "undergraduates"]);
  return alumni && !students ? "alumni" : students && !alumni ? "student" : "any";
}

export type ParseOutcome = { criteria: NetworkingCriteria; usedAi: boolean; note?: string };

/** The model's reading of the request, checked against the deterministic one so it can't drop the school. */
export async function parseRequest(llm: LLMProvider, query: string): Promise<ParseOutcome> {
  const fallback = parseRequestDeterministic(query);
  if (!llm.enabled) return { criteria: fallback, usedAi: false };

  const res = await llm.structured({ tier: "smart", system: SYSTEM, user: `Request:\n${query}`, schema: ParsedRequest, maxTokens: 4000 });
  if (!res.ok) return { criteria: fallback, usedAi: false, note: res.reason };

  let criteria: NetworkingCriteria;
  try {
    criteria = toCriteria(res.data, query);
  } catch {
    return { criteria: fallback, usedAi: false, note: "The AI reading didn't validate; used the built-in parser." };
  }
  // Keep explicit facts the deterministic parser is sure about.
  if (!criteria.education.institution && fallback.education.institution) criteria.education.institution = fallback.education.institution;
  if (knownInstitution(criteria.education.institution) && fallback.education.institutionAliases.length) {
    criteria.education.institutionAliases = [...new Set([...criteria.education.institutionAliases, ...fallback.education.institutionAliases])].slice(0, 12);
  }
  if (!criteria.education.programs.length) criteria.education.programs = fallback.education.programs;
  return { criteria, usedAi: true };
}
