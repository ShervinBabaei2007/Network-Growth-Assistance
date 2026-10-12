import { z } from "zod";
import { AMBIGUOUS_PROGRAMS, DISCIPLINE_ALIASES, LOOKALIKES, UNIVERSITY_ALIASES } from "@/lib/classify";
import { UNIVERSITY_LABELS, type University } from "@/lib/domain";
import { clean, has, hasAny } from "@/lib/text/match";

/**
 * What the user is looking for, after the request has been understood. Everything
 * downstream (query planning, evidence checks, scoring) works from this object.
 */
export const NetworkingCriteria = z.object({
  targetCount: z.number().int().min(1).max(100),
  education: z.object({
    institution: z.string().max(120).nullable(),
    /** Extra spellings of the institution (UofT, U of T). Matched as whole words. */
    institutionAliases: z.array(z.string().max(60)).max(12),
    programs: z.array(z.string().max(80)).max(8),
    /** Count "Electrical and Computer Engineering" / ECE as a match for CE or EE. */
    broadenEce: z.boolean(),
    graduationYearMin: z.number().int().min(1950).max(2100).nullable(),
    graduationYearMax: z.number().int().min(1950).max(2100).nullable(),
    /** "alumni" excludes people who are still studying; "student" the reverse. Older searches default to "any". */
    status: z.enum(["any", "alumni", "student"]).default("any"),
  }),
  roles: z.array(z.string().max(80)).max(12),
  locations: z.array(z.string().max(80)).max(10),
  /** People must be located in this country (null = anywhere). Canada unless changed. */
  country: z.string().max(60).nullable().default("Canada"),
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

const KNOWN_INSTITUTIONS: Record<University, { name: string; aliases: readonly string[]; domains: readonly string[] }> = {
  uoft: { name: UNIVERSITY_LABELS.uoft, aliases: UNIVERSITY_ALIASES.uoft, domains: ["utoronto.ca"] },
  ubc: { name: UNIVERSITY_LABELS.ubc, aliases: UNIVERSITY_ALIASES.ubc, domains: ["ubc.ca"] },
  sfu: { name: UNIVERSITY_LABELS.sfu, aliases: UNIVERSITY_ALIASES.sfu, domains: ["sfu.ca"] },
  waterloo: { name: UNIVERSITY_LABELS.waterloo, aliases: UNIVERSITY_ALIASES.waterloo, domains: ["uwaterloo.ca"] },
};

// Short campus codes that also mean other things on the open web (UTM is also a Malaysian university).
const WEAK_ALIASES = new Set(["utm", "utsc", "uw waterloo"]);

/** The known institution a free-text name refers to, if any. */
export function knownInstitution(name: string | null | undefined): University | null {
  const t = clean(name);
  for (const [key, info] of Object.entries(KNOWN_INSTITUTIONS) as [University, (typeof KNOWN_INSTITUTIONS)[University]][]) {
    if (hasAny(t, info.aliases) || clean(info.name) === t) return key;
  }
  return null;
}

export type InstitutionMatcher = {
  name: string;
  /** Full names: strong evidence on their own. */
  strong: string[];
  /** Acronyms: weaker evidence (medium confidence at best). */
  acronyms: string[];
  domains: string[];
  known: University | null;
};

export function institutionMatcher(criteria: NetworkingCriteria): InstitutionMatcher | null {
  const name = criteria.education.institution?.trim();
  if (!name) return null;
  const known = knownInstitution(name);
  const vetted = new Set<string>(known ? KNOWN_INSTITUTIONS[known].aliases : []);
  const all = new Set<string>([clean(name).trim(), ...criteria.education.institutionAliases.map((a) => clean(a).trim()), ...vetted]);
  const strong: string[] = [];
  const acronyms: string[] = [];
  for (const a of all) {
    if (!a || WEAK_ALIASES.has(a)) continue;
    // A known school's own short forms (UofT, U of T, UBC) are as good as its full name.
    // Other short forms (for example ones the model suggested for an unfamiliar school) are weaker.
    (vetted.has(a) || a.length >= 12 ? strong : acronyms).push(a);
  }
  return { name: known ? KNOWN_INSTITUTIONS[known].name : name, strong, acronyms, domains: known ? [...KNOWN_INSTITUTIONS[known].domains] : [], known };
}

/** Which kind of mention of the institution `text` contains, if any. Lookalike schools don't count. */
export function matchInstitution(text: string, m: InstitutionMatcher): "strong" | "acronym" | null {
  let t = clean(text);
  for (const look of LOOKALIKES) t = t.split(` ${look} `).join(" ");
  if (hasAny(t, m.strong)) return "strong";
  if (hasAny(t, m.acronyms)) return "acronym";
  return null;
}

// ----------------------------------------------------------------- programs

const PROGRAM_CATALOG: { canonical: string; aliases: readonly string[]; eceFamily: boolean }[] = [
  { canonical: "Computer Engineering", aliases: [...DISCIPLINE_ALIASES.ce, "compeng", "comp engineering"], eceFamily: true },
  { canonical: "Electrical Engineering", aliases: DISCIPLINE_ALIASES.ee.filter((a) => a !== "electrical"), eceFamily: true },
  { canonical: "Computer Science", aliases: DISCIPLINE_ALIASES.cs.filter((a) => a !== "cs"), eceFamily: false },
  { canonical: "Mechatronics Engineering", aliases: DISCIPLINE_ALIASES.mech, eceFamily: false },
  { canonical: "Software Engineering", aliases: ["software engineering", "softeng"], eceFamily: false },
  { canonical: "Engineering Science", aliases: ["engineering science", "engsci"], eceFamily: false },
  { canonical: "Electrical and Computer Engineering", aliases: ["electrical and computer engineering", "ece", "e and ce", "electrical computer engineering"], eceFamily: false },
];

export type ProgramMatcher = { canonical: string; aliases: string[]; eceFamily: boolean };

export function programMatchers(criteria: NetworkingCriteria): ProgramMatcher[] {
  return criteria.education.programs.map((p) => {
    const t = clean(p);
    const entry = PROGRAM_CATALOG.find((e) => clean(e.canonical) === t || hasAny(t, e.aliases.filter((a) => a.length > 3)));
    if (entry) return { canonical: entry.canonical, aliases: [...entry.aliases], eceFamily: entry.eceFamily };
    return { canonical: p.trim(), aliases: [t.trim()], eceFamily: false };
  });
}

/**
 * How `text` supports one of the requested programs:
 * - "exact": names the program itself (Computer Engineering, Comp Eng).
 * - "ece": names only the combined ECE program while CE or EE was asked for. This is
 *   not proof of Computer Engineering, so it counts as a medium-confidence match
 *   unless the user broadened the search to ECE.
 */
export function matchProgram(text: string, programs: ProgramMatcher[], broadenEce: boolean): { kind: "exact" | "ece"; program: string } | null {
  const raw = clean(text);
  let t = raw;
  // Remove the combined-program phrases before looking for the specific program, so
  // "Electrical and Computer Engineering" never reads as "Computer Engineering".
  for (const phrase of AMBIGUOUS_PROGRAMS) {
    // Repeat until gone: back-to-back occurrences share the space between them.
    while (t.includes(` ${phrase} `)) t = t.split(` ${phrase} `).join(" ");
  }
  for (const p of programs) {
    if (p.canonical === "Electrical and Computer Engineering") {
      if (hasAny(raw, p.aliases)) return { kind: "exact", program: p.canonical };
      continue;
    }
    if (hasAny(t, p.aliases)) return { kind: "exact", program: p.canonical };
  }
  const mentionsEce = hasAny(raw, ["electrical and computer engineering", "electrical computer engineering", "ece", "e and ce"]);
  const ecePrograms = programs.filter((p) => p.eceFamily);
  if (mentionsEce && ecePrograms.length) return { kind: broadenEce ? "exact" : "ece", program: ecePrograms[0].canonical };
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
