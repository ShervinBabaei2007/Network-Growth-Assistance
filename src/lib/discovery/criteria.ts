import { z } from "zod";
import { clean, has, hasAny } from "@/lib/text/match";

/**
 * What the user is looking for, after the request has been understood. Everything
 * downstream (query planning, evidence checks, scoring) works from this object.
 */
export const NetworkingCriteria = z.object({
  targetCount: z.number().int().min(1).max(100),
  education: z.object({
    institution: z.string().max(120).nullable(),
    /** Extra spellings of the institution (short forms, campuses). Matched as whole words. */
    institutionAliases: z.array(z.string().max(60)).max(12),
    /** Spellings from the user's own school list: as good as the full name. */
    vettedAliases: z.array(z.string().max(100)).max(40).default([]),
    /** The school's own web domains, when known (for site: searches). */
    institutionDomains: z.array(z.string().max(100)).max(5).default([]),
    programs: z.array(z.string().max(80)).max(8),
    /** Other names for the requested programs (e.g. "BSN" for Nursing, "JD" for Law). */
    programAliases: z.array(z.string().max(80)).max(30).default([]),
    /** Older saved searches only; no longer used. */
    broadenEce: z.boolean().default(false),
    graduationYearMin: z.number().int().min(1950).max(2100).nullable(),
    graduationYearMax: z.number().int().min(1950).max(2100).nullable(),
    /** "alumni" excludes people who are still studying; "student" the reverse. Older searches default to "any". */
    status: z.enum(["any", "alumni", "student"]).default("any"),
  }),
  roles: z.array(z.string().max(80)).max(12),
  locations: z.array(z.string().max(80)).max(10),
  /** People must be located in this country (null = anywhere). Only when the request asks for one. */
  country: z.string().max(60).nullable().default(null),
  companies: z.array(z.string().max(80)).max(15),
  /** "or startups": a company we can't verify as a startup still counts as possible. */
  includeStartups: z.boolean(),
  excludeExistingConnections: z.boolean(),
  /** The user's networking goal for this search, if they stated one. */
  goal: z.string().max(300).nullable(),
});
export type NetworkingCriteria = z.infer<typeof NetworkingCriteria>;

export const DEFAULT_TARGET = 25;

// ------------------------------------------------------------- institutions
// Nothing is built in: a school is known by its name, the short forms the request (or the AI
// reading it) gave, and the spellings in the user's own school list (`vettedAliases`).

/** Words too generic to identify a school on their own. */
const GENERIC = new Set(["university", "college", "institute", "school", "polytechnic", "of", "the", "and", "at", "de", "la", "du", "technology"]);

export type InstitutionMatcher = {
  name: string;
  /** Full names and the user's own spellings: strong evidence on their own. */
  strong: string[];
  /** Short forms nobody vetted (often acronyms that also mean other things): weaker evidence. */
  acronyms: string[];
  /** The school's own web domains, when known (for site: searches). */
  domains: string[];
};

export function institutionMatcher(criteria: NetworkingCriteria): InstitutionMatcher | null {
  const name = criteria.education.institution?.trim();
  if (!name) return null;
  const vetted = new Set(criteria.education.vettedAliases.map((a) => clean(a).trim()).filter(Boolean));
  const all = new Set<string>([clean(name).trim(), ...criteria.education.institutionAliases.map((a) => clean(a).trim()), ...vetted]);
  const strong: string[] = [];
  const acronyms: string[] = [];
  for (const a of all) {
    if (!a || a.split(" ").every((w) => GENERIC.has(w))) continue;
    // The full name, the user's own spellings, and longer distinctive names ("mcgill",
    // "simon fraser") are strong; short unvetted forms (MIT, UBC) could mean something else.
    (vetted.has(a) || a === clean(name).trim() || a.length >= 6 ? strong : acronyms).push(a);
  }
  const domains = criteria.education.institutionDomains.map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
  return { name, strong, acronyms, domains };
}

/** Which kind of mention of the institution `text` contains, if any. */
export function matchInstitution(text: string, m: InstitutionMatcher): "strong" | "acronym" | null {
  const t = clean(text);
  if (hasAny(t, m.strong)) return "strong";
  if (hasAny(t, m.acronyms)) return "acronym";
  return null;
}

// ----------------------------------------------------------------- programs
// Any field: a program matches by its name or the other names given for it (the AI's reading
// of the request, e.g. "BSN" for Nursing, and the spellings in the user's own discipline list).

export type ProgramMatcher = { canonical: string; aliases: string[] };

export function programMatchers(criteria: NetworkingCriteria): ProgramMatcher[] {
  const extra = criteria.education.programAliases.map((a) => clean(a).trim()).filter((a) => a.length >= 2);
  return criteria.education.programs.map((p) => ({ canonical: p.trim(), aliases: [...new Set([clean(p).trim(), ...extra])].filter(Boolean) }));
}

/** Which requested program `text` names, if any. (`broadenEce` is kept for older saved searches; it no longer changes anything.) */
export function matchProgram(text: string, programs: ProgramMatcher[], _broadenEce?: boolean): { kind: "exact" | "ece"; program: string } | null {
  const t = clean(text);
  for (const p of programs) if (hasAny(t, p.aliases)) return { kind: "exact", program: p.canonical };
  return null;
}

// -------------------------------------------------------------------- roles

const ROLE_FAMILIES: { triggers: readonly string[]; aliases: readonly string[] }[] = [
  {
    triggers: ["software", "swe", "developer", "programmer", "backend", "frontend", "full stack", "fullstack"],
    aliases: [
      "software engineer", "software developer", "software development engineer", "sde", "swe",
      "backend engineer", "back end engineer", "backend developer", "frontend engineer", "front end engineer",
      "full stack engineer", "full stack developer", "fullstack engineer", "infrastructure engineer",
      "platform engineer", "systems software engineer", "firmware engineer", "web developer", "mobile developer",
    ],
  },
  { triggers: ["hardware", "asic", "fpga", "chip", "silicon"], aliases: ["hardware engineer", "asic engineer", "fpga engineer", "design verification engineer", "silicon engineer", "physical design engineer"] },
  { triggers: ["machine learning", "ml", "ai", "data scientist"], aliases: ["machine learning engineer", "ml engineer", "ai engineer", "research scientist", "data scientist", "applied scientist"] },
  { triggers: ["product manager", "pm"], aliases: ["product manager", "technical program manager"] },
  // Other fields: common equivalents people write on profiles.
  { triggers: ["nurse", "nursing", "rn"], aliases: ["registered nurse", "rn", "nurse practitioner", "np", "clinical nurse", "charge nurse", "staff nurse", "nurse"] },
  { triggers: ["physician", "doctor", "resident"], aliases: ["physician", "doctor", "resident physician", "medical resident", "attending physician", "family physician"] },
  { triggers: ["pharmacist", "pharmacy"], aliases: ["pharmacist", "clinical pharmacist", "pharmacy resident"] },
  { triggers: ["lawyer", "attorney", "associate lawyer", "litigation", "counsel"], aliases: ["lawyer", "attorney", "associate", "litigation associate", "legal counsel", "counsel", "barrister", "solicitor", "articling student"] },
  { triggers: ["paralegal", "law clerk"], aliases: ["paralegal", "law clerk", "legal assistant"] },
  { triggers: ["accountant", "accounting", "cpa", "auditor"], aliases: ["accountant", "cpa", "chartered professional accountant", "auditor", "staff accountant", "senior accountant"] },
  { triggers: ["financial analyst", "finance", "investment"], aliases: ["financial analyst", "investment analyst", "associate", "analyst", "portfolio manager"] },
  { triggers: ["teacher", "educator", "instructor"], aliases: ["teacher", "educator", "instructor", "lecturer", "professor", "teaching assistant"] },
  { triggers: ["designer", "design"], aliases: ["designer", "ux designer", "ui designer", "product designer", "graphic designer", "visual designer"] },
  { triggers: ["marketing", "marketer"], aliases: ["marketing manager", "marketing coordinator", "marketing specialist", "brand manager", "growth marketer"] },
  { triggers: ["social worker", "social work"], aliases: ["social worker", "msw", "case manager", "counsellor", "counselor"] },
  { triggers: ["electrician", "plumber", "carpenter", "trades", "technician"], aliases: ["electrician", "journeyman electrician", "plumber", "carpenter", "technician", "apprentice"] },
];

/** The requested roles plus their common equivalents, cleaned for matching. */
export function roleAliases(roles: string[]): string[] {
  const out = new Set<string>();
  for (const r of roles) {
    const t = clean(r);
    if (t.trim()) out.add(t.trim());
    for (const fam of ROLE_FAMILIES) if (hasAny(t, fam.triggers)) fam.aliases.forEach((a) => out.add(a));
  }
  return [...out];
}

export const matchRole = (text: string, aliases: string[]) => aliases.find((a) => has(clean(text), a)) ?? null;

// ---------------------------------------------------- companies, locations

/** Company groups: names that refer to the same employer or its well-known brands. */
export const COMPANY_ALIASES: Record<string, readonly string[]> = {
  amazon: ["amazon", "aws", "amazon web services"],
  google: ["google", "alphabet", "deepmind"],
  meta: ["meta", "facebook"],
  microsoft: ["microsoft", "msft"],
  nvidia: ["nvidia"],
  amd: ["amd", "advanced micro devices"],
  apple: ["apple"],
  intel: ["intel"],
};

export function companyAliases(companies: string[]): string[] {
  const out = new Set<string>();
  for (const c of companies) {
    const t = clean(c).trim();
    if (!t) continue;
    out.add(t);
    COMPANY_ALIASES[t]?.forEach((a) => out.add(a));
  }
  return [...out];
}

export const matchAlias = (text: string, aliases: string[]) => aliases.find((a) => has(clean(text), a)) ?? null;

/** Company names that are also ordinary words or other organizations' names ("Apple Valley Hospital", "Meta-analysis Lab"). */
const AMBIGUOUS_COMPANIES = new Set(["apple", "meta", "alphabet", "oracle", "target", "square", "block", "slack", "zoom", "stripe", "uber", "intel", "amd"]);
/** Words a company's registered or regional name adds to its brand: "Apple Inc.", "Microsoft Research (Canada)", "Meta Platforms". */
const COMPANY_SUFFIX = new Set(
  "inc incorporated corp corporation co company ltd limited llc plc lp group holdings global international technologies technology software platforms research labs lab cloud canada canadian usa us uk america american europe asia india china japan germany ireland australia".split(" "),
);

/**
 * Whether an employer name (as a person or record wrote it) is one of the requested companies. Most names match when they
 * contain the company as whole words. A name that is also an ordinary word must be the company itself, optionally with a
 * corporate or regional suffix, so "Apple Inc." matches Apple and "Apple Valley Hospital" does not.
 */
export function matchCompany(value: string, aliases: string[]): string | null {
  const hit = matchAlias(value, aliases);
  if (!hit || !AMBIGUOUS_COMPANIES.has(hit)) return hit;
  const words = clean(value.replace(/\([^)]*\)/g, " ")).trim().split(" ").filter(Boolean);
  const brand = hit.split(" ");
  const at = words.findIndex((_, i) => brand.every((b, j) => words[i + j] === b));
  if (at < 0) return null;
  const rest = [...words.slice(0, at), ...words.slice(at + brand.length)];
  return rest.every((w) => COMPANY_SUFFIX.has(w)) ? hit : null;
}

const LOCATION_ALIASES: Record<string, readonly string[]> = {
  toronto: ["toronto", "gta", "greater toronto area"],
  vancouver: ["vancouver", "greater vancouver", "burnaby"],
  "san francisco": ["san francisco", "bay area", "sf bay area", "silicon valley"],
  "new york": ["new york", "nyc"],
  seattle: ["seattle", "bellevue", "redmond"],
};

export function locationAliases(locations: string[]): string[] {
  const out = new Set<string>();
  for (const l of locations) {
    const t = clean(l).trim();
    if (!t) continue;
    out.add(t);
    LOCATION_ALIASES[t]?.forEach((a) => out.add(a));
  }
  return [...out];
}

/** A short human summary of the criteria, for history lists and empty states. */
export function describeCriteria(c: NetworkingCriteria): string {
  const parts = [
    c.education.institution,
    c.education.programs.join(" / "),
    c.roles.slice(0, 2).join(" or "),
    c.companies.length ? `at ${c.companies.slice(0, 4).join(", ")}${c.includeStartups ? " or startups" : ""}` : c.includeStartups ? "at startups" : "",
    c.locations.length ? `in ${c.locations.join(" or ")}` : "",
    c.country ? `located in ${c.country}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
