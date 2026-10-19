import { z } from "zod";
import { phrasesFor } from "@/lib/classify";
import type { Catalog } from "@/lib/domain";
import { countryCode, countryName } from "@/lib/geo/countries";
import { discoveryFixturesEnabled } from "@/lib/runtime-mode";
import { clean, has, hasAny } from "@/lib/text/match";
import { DEFAULT_TARGET, NetworkingCriteria } from "./criteria";
import type { LLMProvider } from "./llm";
import { findSchoolByAcronym, schoolAcronymCandidates } from "./ror";

/** What the model may return. Kept flat and permissive; `toCriteria` validates and clamps. */
const ParsedRequest = z.object({
  targetCount: z.number().nullable(),
  institution: z.string().nullable(),
  institutionAliases: z.array(z.string()),
  institutionDomains: z.array(z.string()),
  programs: z.array(z.string()),
  programAliases: z.array(z.string()),
  graduationYearMin: z.number().nullable(),
  graduationYearMax: z.number().nullable(),
  studentStatus: z.enum(["any", "alumni", "student"]),
  roles: z.array(z.string()),
  locations: z.array(z.string()),
  country: z.string().nullable(),
  companies: z.array(z.string()),
  includeStartups: z.boolean(),
  excludeExistingConnections: z.boolean(),
  goal: z.string().nullable(),
});
type ParsedRequest = z.infer<typeof ParsedRequest>;

const SYSTEM = `You turn a networking research request into structured search criteria. The request can be about any field: health care, law, business, the arts, education, trades, science, technology or anything else.

The user is looking for people to meet professionally. Extract only what the request says:
- targetCount: the number of people asked for, or null.
- institution: the school's full official name (e.g. "McGill University" for "McGill", "University of Toronto" for "UofT"), or null.
- institutionAliases: common short forms of that school, as people write them on profiles.
- institutionDomains: the school's official website domain (e.g. "mcgill.ca"), only if you are sure of it; otherwise empty.
- programs: academic programs or fields named, spelled out in full (e.g. "Nursing", "Law", "Mechanical Engineering", "Business Administration").
- programAliases: other names people use for those programs on profiles (e.g. "BSN", "BScN" for Nursing; "JD" for Law; "BBA" for Business Administration).
- graduationYearMin / Max: only if a graduation year or range is stated.
- studentStatus: "alumni" if the request asks for graduates or alumni only, "student" if it asks for current students only, otherwise "any".
- roles: job titles asked for, plus close equivalents in that field (e.g. "Registered Nurse", "RN"; "Associate Lawyer", "Litigation Associate"; "Software Engineer", "Software Developer").
- locations: cities or regions asked for.
- country: the country people must be in, only if the request names or clearly implies one (e.g. "in Toronto" implies Canada); otherwise null.
- companies: employers asked for, by their common names (hospitals, firms, agencies and companies alike).
- includeStartups: true if startups are mentioned as acceptable employers.
- excludeExistingConnections: false only if the request says to include people the user already knows.
- goal: the user's stated reason or situation, or null.

Never add a school, program, company, role, location or country the request doesn't mention or clearly imply.`;

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
      vettedAliases: [],
      institutionDomains: trimList(p.institutionDomains, 5, 100),
      programs: trimList(p.programs, 8, 80),
      programAliases: trimList(p.programAliases, 30, 80),
      broadenEce: false,
      graduationYearMin: year(p.graduationYearMin),
      graduationYearMax: year(p.graduationYearMax),
      status: p.studentStatus,
    },
    roles: trimList(p.roles, 12, 80),
    locations: trimList(p.locations, 10, 80),
    country: p.country?.trim() ? p.country.trim().slice(0, 60) : null,
    companies: trimList(p.companies, 15, 80),
    // A smaller model sometimes adds "startups" on its own: only believe it when the request says so.
    includeStartups: p.includeStartups && /start[- ]?ups?/i.test(query),
    excludeExistingConnections: p.excludeExistingConnections,
    goal: p.goal?.trim() ? p.goal.trim().slice(0, 300) : null,
  });
}

function countFromText(query: string): number | null {
  const m = query.match(/\b(?:find|show|get|list|give me)?\s*(\d{1,3})\b(?!\s*(?:k\b|years?|%))/i);
  return m ? Number(m[1]) : null;
}

const WORD = "[A-Z][\\p{L}'’.&-]*";
const NAME = `(?:${WORD}\\s?){1,5}`;
/** "at Vancouver General Hospital", "at Deloitte": capitalized names after "at" (not a school already found). */
const AT = new RegExp(`\\b(?:at|for|with)\\s+(${NAME})`, "gu");
/** "in Vancouver", "in New York": capitalized places after "in". */
const IN = new RegExp(`\\bin\\s+(?:the\\s+)?(${NAME})`, "gu");
/** "working as a Registered Nurse", "who are Paralegals". */
const AS = /\b(?:working as|work as|who are|as an?|as)\s+(?:an?\s+)?([A-Za-z][A-Za-z /&-]{2,60}?)(?=\s+(?:at|in|from|who|with|and)\b|[,.;]|$)/i;

/** Words that start a field of study, so a school's name can be told from the program written after it. */
const FIELD_WORDS =
  "Computer|Computing|Science|Sciences|Engineering|Law|Nursing|Commerce|Business|Psychology|Medicine|Arts|Mechanical|Electrical|Civil|Chemical|Health|Education|Social|Political|Economics|Mathematics|Math|Physics|Chemistry|Biology|Kinesiology|Design|Music|Architecture|Pharmacy|Dentistry|Alumni|Graduates|Grads|Students";

/** "Find 10 software engineers at startups in Vancouver": the role is the plural noun phrase right after the count, when no school or field comes first. */
const LEADING_ROLE = /^\s*(?:find|show|get|list|give me)\s+(?:me\s+)?\d{1,3}\s+([A-Za-z][A-Za-z /&-]{2,50}?)\s+(?:at|in|from|who|working|with|based)\b/i;
const NOT_A_ROLE = /\b(people|persons?|alumni|alumnus|alumna|graduates?|grads?|students?|undergrads?|professionals?|contacts?|connections?|university|college|institute)\b/i;

const tidy = (s: string) => s.trim().replace(/\s+(?:who|working|and|in|at|from)$/i, "").trim();

/**
 * Understands a request without a model: the user's own schools and disciplines (by their
 * names and spellings), any "University of X" / "X College" name, people "working as" a role,
 * employers "at" a name, places "in" a name, a count and student/alumni status. Nothing about
 * a particular field or country is assumed.
 */
export function parseRequestDeterministic(query: string, catalog?: Catalog): NetworkingCriteria {
  const t = clean(query);
  let institution: string | null = null;
  let aliases: string[] = [];
  let writtenField: string | null = null;
  const school = catalog?.universities.find((u) => hasAny(t, phrasesFor(u)));
  if (school) {
    institution = school.name;
    aliases = school.aliases;
  } else {
    // Schools by their written name: "University of Ottawa", "McGill University", "Humber College".
    const m =
      query.match(new RegExp(`\\b(?:University|Université) of (?:${WORD}\\s?)+`, "u")) ??
      query.match(new RegExp(`\\b(?:${WORD}\\s)+(?:University|Institute of Technology|Polytechnic(?: University)?|College)\\b`, "u"));
    // "University of Waterloo Computer Science": the school ends where the field begins.
    const written = m ? tidy(m[0]) : "";
    const cut = written.search(new RegExp(`\\s(?:${FIELD_WORDS})\\b`, "i"));
    const name = cut > 0 ? written.slice(0, cut).trim() : written;
    if (cut > 0) writtenField = written.slice(cut).trim();
    if (name && !/^(Find|Show|Get|List)\b/.test(name)) institution = name;
  }

  const fields = catalog?.disciplines.filter((d) => hasAny(t, phrasesFor(d))) ?? [];
  // Without the user's own list, a field written right after the school's name still counts: "University of Alberta Law".
  const inline = writtenField && institution ? writtenField.replace(/\s+(?:alumni|alumnus|alumna|graduates?|grads?|students?)$/i, "") : "";
  const programs = fields.length ? fields.map((d) => d.name) : inline && inline.split(" ").length <= 4 ? [inline] : [];
  const programAliases = fields.flatMap((d) => d.aliases);

  const leading = query.match(LEADING_ROLE)?.[1];
  const role = query.match(AS)?.[1] ?? (leading && !NOT_A_ROLE.test(leading) ? leading : undefined);
  const roles = role ? [tidy(role)] : [];
  const names = (re: RegExp) => [...query.matchAll(re)].map((m) => tidy(m[1])).filter((n) => n && n !== institution && !/^(Find|Show|Get|List|The)$/.test(n));
  const companies = names(AT).filter((c) => !/\b(University|College|Institute|Polytechnic)\b/.test(c));
  const places = names(IN).filter((l) => !companies.includes(l));
  // "in Canada", "in the United Kingdom": a country the people must be in; other places are cities or regions.
  const countryPlace = places.find((l) => countryCode(l.replace(/^the\s+/i, "")));
  const country = countryPlace ? (countryName(countryCode(countryPlace.replace(/^the\s+/i, ""))!) ?? countryPlace) : null;
  const locations = places.filter((l) => l !== countryPlace);

  const criteria = toCriteria(
    {
      targetCount: countFromText(query),
      institution,
      institutionAliases: aliases.slice(0, 12),
      institutionDomains: [],
      programs,
      programAliases,
      graduationYearMin: null,
      graduationYearMax: null,
      studentStatus: statusFromText(t),
      roles,
      locations,
      country,
      companies,
      includeStartups: has(t, "startups") || has(t, "startup"),
      excludeExistingConnections: true,
      goal: null,
    },
    query,
  );
  return withUserLists(criteria, catalog);
}

/** "alumni", "graduates" → alumni only; "students" → students only; both or neither → any. */
export function statusFromText(t: string): "any" | "alumni" | "student" {
  const alumni = hasAny(t, ["alumni", "alumnus", "alumna", "graduate", "graduates", "grads", "grad", "graduated"]);
  const students = hasAny(t, ["student", "students", "undergrads", "undergraduates"]);
  return alumni && !students ? "alumni" : students && !alumni ? "student" : "any";
}

/**
 * Adds what the user's own lists know: the spellings of their school (trusted like its full
 * name) and the other names of their disciplines, when the search names one of them.
 */
export function withUserLists(criteria: NetworkingCriteria, catalog?: Catalog): NetworkingCriteria {
  if (!catalog) return criteria;
  const e = criteria.education;
  const inst = e.institution ? clean(e.institution) : "";
  const school = inst.trim() ? catalog.universities.find((u) => phrasesFor(u).some((p) => has(inst, p)) || hasAny(clean(u.name), [inst.trim()])) : undefined;
  const programs = e.programs.map((p) => clean(p));
  const fields = catalog.disciplines.filter((d) => programs.some((p) => hasAny(p, phrasesFor(d)) || hasAny(clean(d.name), [p.trim()])));
  return {
    ...criteria,
    education: {
      ...e,
      vettedAliases: school ? [...new Set([...e.vettedAliases, school.name, ...school.aliases])].slice(0, 40) : e.vettedAliases,
      programAliases: [...new Set([...e.programAliases, ...fields.flatMap((d) => [d.name, ...d.aliases])])].slice(0, 30),
    },
  };
}

export type ParseOutcome = { criteria: NetworkingCriteria; usedAi: boolean; note?: string; /** Read earlier; no AI call was made now. */ cached?: boolean };

/** The model's reading of the request, checked against the deterministic one so it can't drop the school. */
/**
 * A school named only by its short name ("SFU alumni") that nothing else recognized: the Research Organization Registry
 * says which school that is, but only when it is the only one in the country with that short name.
 */
async function withNamedSchool(criteria: NetworkingCriteria, query: string): Promise<NetworkingCriteria> {
  if (criteria.education.institution || discoveryFixturesEnabled()) return criteria;
  const country = (criteria.country && countryCode(criteria.country)) || "CA";
  for (const term of schoolAcronymCandidates(query)) {
    const school = await findSchoolByAcronym(term, country);
    if (school) {
      const aliases = [...new Set([term, ...school.aliases])].slice(0, 12);
      return { ...criteria, education: { ...criteria.education, institution: school.name, institutionAliases: aliases, institutionDomains: school.domain ? [school.domain] : criteria.education.institutionDomains } };
    }
  }
  return criteria;
}

/**
 * Requests the AI has already read, so asking again (Run again, Modify, two people typing the same thing) costs no AI call.
 * Held in memory for a few hours; only answers the AI actually gave are kept, never the basic reader's.
 */
const READ_CACHE = new Map<string, { at: number; criteria: NetworkingCriteria }>();
const READ_CACHE_MS = 6 * 3_600_000;
/** For tests. */
export const clearReadCache = () => READ_CACHE.clear();
const readKey = (query: string, catalog?: Catalog) => `${clean(query).trim()}|${(catalog?.universities ?? []).map((u) => u.name).join(",")}|${(catalog?.disciplines ?? []).map((d) => d.name).join(",")}`;

export async function parseRequest(llm: LLMProvider, query: string, catalog?: Catalog): Promise<ParseOutcome> {
  const key = readKey(query, catalog);
  const hit = READ_CACHE.get(key);
  if (hit && Date.now() - hit.at < READ_CACHE_MS) return { criteria: structuredClone(hit.criteria), usedAi: true, cached: true };
  const outcome = await parseRequestUncached(llm, query, catalog);
  if (outcome.usedAi) {
    if (READ_CACHE.size >= 200) READ_CACHE.delete(READ_CACHE.keys().next().value!);
    READ_CACHE.set(key, { at: Date.now(), criteria: structuredClone(outcome.criteria) });
  }
  return outcome;
}

async function parseRequestUncached(llm: LLMProvider, query: string, catalog?: Catalog): Promise<ParseOutcome> {
  const fallback = parseRequestDeterministic(query, catalog);
  if (!llm.enabled) return { criteria: await withNamedSchool(fallback, query), usedAi: false };

  const res = await llm.structured({ tier: "smart", system: SYSTEM, user: `Request:\n${query}`, schema: ParsedRequest, maxTokens: 4000 });
  if (!res.ok) return { criteria: await withNamedSchool(fallback, query), usedAi: false, note: res.reason };

  let criteria: NetworkingCriteria;
  try {
    criteria = toCriteria(res.data, query);
  } catch {
    return { criteria: await withNamedSchool(fallback, query), usedAi: false, note: "The AI reading didn't validate; used the built-in parser." };
  }
  // Keep explicit facts the deterministic parser is sure about.
  if (!criteria.education.institution && fallback.education.institution) criteria.education.institution = fallback.education.institution;
  if (!criteria.education.programs.length) criteria.education.programs = fallback.education.programs;
  return { criteria: await withNamedSchool(withUserLists(criteria, catalog), query), usedAi: true };
}
