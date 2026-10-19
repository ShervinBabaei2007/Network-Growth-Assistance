import { clean } from "@/lib/text/match";
import { nameTokens } from "@/lib/text/names";
import {
  companyAliases,
  institutionMatcher,
  locationAliases,
  matchAlias,
  matchCompany,
  matchInstitution,
  matchProgram,
  matchRole,
  programMatchers,
  roleAliases,
  type NetworkingCriteria,
} from "./criteria";
import { inCountry } from "./location";

export type Confidence = "high" | "medium" | "low";
export type FactField = "institution" | "program" | "degree" | "grad_year" | "role" | "company" | "location" | "github" | "website" | "linkedin";

/** One fact about a person, with the public source and the exact text that supports it. */
export type Fact = {
  field: FactField;
  value: string;
  sourceUrl: string;
  sourceTitle: string | null;
  extractedText: string;
  confidence: Confidence;
};

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
export const downgrade = (c: Confidence): Confidence => (c === "high" ? "medium" : "low");
export const best = (cs: (Confidence | null)[]): Confidence | null =>
  cs.reduce<Confidence | null>((a, c) => (c && (!a || CONFIDENCE_RANK[c] > CONFIDENCE_RANK[a]) ? c : a), null);

/** Lowercase, fold accents and quotes, collapse whitespace: the form quotes are compared in. */
export function quoteForm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** True if the person's first and last name both appear in `text` as words. */
export function mentionsName(text: string, fullName: string): boolean {
  const tokens = nameTokens(fullName);
  if (tokens.length < 2) return false;
  const t = clean(text);
  return t.includes(` ${tokens[0]} `) && t.includes(` ${tokens[tokens.length - 1]} `);
}

/**
 * How much a single source supports facts about this person:
 * - high: the quote itself names the person, or the page is the person's own page
 *   (their site, their GitHub profile, a bio about them);
 * - medium: the page lists a few people and the quote sits near the name;
 * - low: a crowded page where the fact isn't tied to the name.
 */
export function sourceConfidence(opts: { nameInQuote: boolean; personalPage: boolean; peopleOnPage: number }): Confidence {
  if (opts.nameInQuote || opts.personalPage) return "high";
  return opts.peopleOnPage <= 3 ? "medium" : "low";
}

export type CriterionKey = "institution" | "program" | "role" | "company" | "location" | "gradYear" | "standing";
export type CriterionStatus = { requested: boolean; confidence: Confidence | null; value: string | null; note?: string; conflict?: boolean };
export type CriteriaEvaluation = Record<CriterionKey, CriterionStatus>;

/**
 * Checks a person's facts against each requested criterion. A criterion is only
 * satisfied by a fact that actually matches it, at the confidence of that fact.
 * Unknown stays unknown (null); nothing is assumed.
 */
export function evaluateCriteria(facts: Fact[], criteria: NetworkingCriteria, today: Date = new Date()): CriteriaEvaluation {
  const inst = institutionMatcher(criteria);
  const programs = programMatchers(criteria);
  const roles = roleAliases(criteria.roles);
  const companies = companyAliases(criteria.companies);
  const locations = locationAliases(criteria.locations);
  const of = (field: FactField) => facts.filter((f) => f.field === field);

  /**
   * The strongest supporting fact. Independent sources agreeing raise confidence: a
   * medium-confidence fact backed by two or more different sources counts as high.
   * Ambiguity (a note such as ECE vs Computer Engineering) is never upgraded this way.
   */
  const pick = (candidates: { c: Confidence; v: string; note?: string; src: string }[]) => {
    const top = best(candidates.map((x) => x.c));
    const hit = candidates.find((x) => x.c === top);
    if (!hit || top === "high" || hit.note) return { confidence: top, value: hit?.v ?? null, note: hit?.note };
    const sources = new Set(candidates.filter((x) => !x.note && CONFIDENCE_RANK[x.c] >= CONFIDENCE_RANK.medium).map((x) => x.src));
    if (sources.size >= 2) return { confidence: "high" as Confidence, value: hit.v, note: `confirmed by ${sources.size} independent sources` };
    return { confidence: top, value: hit.v, note: hit.note };
  };

  const institution = inst
    ? pick(
        of("institution").flatMap((f) => {
          const m = matchInstitution(`${f.value} ${f.extractedText}`, inst);
          if (!m) return [];
          return [{ c: m === "acronym" ? downgrade(f.confidence) : f.confidence, v: inst.name, src: f.sourceUrl }];
        }),
      )
    : { confidence: null, value: null };

  const program = programs.length
    ? pick(
        of("program").flatMap((f) => {
          const m = matchProgram(`${f.value} . ${f.extractedText}`, programs, criteria.education.broadenEce);
          if (!m) return [];
          if (m.kind === "ece") return [{ c: downgrade(f.confidence), v: "Electrical and Computer Engineering", note: "ECE: not confirmed as Computer Engineering", src: f.sourceUrl }];
          return [{ c: f.confidence, v: m.program, src: f.sourceUrl }];
        }),
      )
    : { confidence: null, value: null };

  const role = roles.length
    ? pick(of("role").flatMap((f) => (matchRole(f.value, roles) || matchRole(f.extractedText, roles) ? [{ c: f.confidence, v: f.value, src: f.sourceUrl }] : [])))
    : { confidence: null, value: null };

  const companyFacts = of("company");
  const company = companies.length
    ? pick(companyFacts.flatMap((f) => (matchCompany(f.value, companies) ? [{ c: f.confidence, v: f.value, src: f.sourceUrl }] : [])))
    : { confidence: null, value: null };
  // Known to work somewhere not on the list (with good evidence): a mismatch, not an unknown.
  const companyConflict =
    companies.length > 0 && !company.confidence && !criteria.includeStartups && companyFacts.some((f) => f.confidence === "high");

  // Location: the requested cities, and always the requested country (Canada by default).
  // Someone shown to be elsewhere is a mismatch; someone with no known location stays unconfirmed.
  const country = criteria.country?.trim() || null;
  const placed = of("location").map((f) => ({ f, where: country ? inCountry(f.value, country) : null }));
  const inside = placed.filter((x) => x.where === "in");
  const outside = placed.filter((x) => x.where === "out" && x.f.confidence !== "low");
  const location: { confidence: Confidence | null; value: string | null; note?: string; conflict?: boolean } = locations.length
    ? pick(placed.filter((x) => x.where !== "out" && matchAlias(x.f.value, locations)).map((x) => ({ c: x.f.confidence, v: x.f.value, src: x.f.sourceUrl })))
    : country
      ? pick(inside.map((x) => ({ c: x.f.confidence, v: x.f.value, src: x.f.sourceUrl })))
      : { confidence: null, value: null };
  if (country) {
    if (!inside.length && outside.length) {
      location.conflict = true;
      location.note = `Located outside ${country} (${outside[0].f.value})`;
    } else if (inside.length && outside.length && location.confidence) {
      location.confidence = downgrade(location.confidence);
      location.note = `Conflicting locations: ${inside[0].f.value} and ${outside[0].f.value}`;
    } else if (!location.confidence) {
      location.note = `Not confirmed in ${country}`;
    }
  }

  const { graduationYearMin: min, graduationYearMax: max } = criteria.education;
  const gradRequested = min !== null || max !== null;
  const gradYear = pick(
    of("grad_year").flatMap((f) => {
      const y = Number(f.value);
      if (!Number.isInteger(y)) return [];
      if (gradRequested && ((min !== null && y < min) || (max !== null && y > max))) return [];
      return [{ c: f.confidence, v: String(y), src: f.sourceUrl }];
    }),
  );

  // Alumni vs current student, from graduation years (a degree is assumed to finish in June).
  // Only a clear contradiction counts; an unknown year never disqualifies anyone.
  const finished = (y: number) => new Date(y, 5, 1) <= today;
  const years = of("grad_year")
    .filter((f) => f.confidence !== "low")
    .map((f) => Number(f.value))
    .filter((y) => Number.isInteger(y));
  const wanted = criteria.education.status;
  let standing: CriterionStatus = { requested: wanted !== "any", confidence: null, value: null };
  if (wanted === "alumni" && years.length && years.every((y) => !finished(y))) {
    standing = { ...standing, conflict: true, note: `Still studying (expected to graduate in ${Math.max(...years)})` };
  } else if (wanted === "student" && years.length && years.every(finished)) {
    standing = { ...standing, conflict: true, note: `Already graduated (${Math.max(...years)})` };
  }

  return {
    institution: { requested: Boolean(inst), ...institution },
    program: { requested: programs.length > 0, ...program },
    role: { requested: roles.length > 0, ...role },
    company: { requested: companies.length > 0 || criteria.includeStartups, ...company, conflict: companyConflict },
    location: { requested: locations.length > 0 || Boolean(country), ...location },
    gradYear: { requested: gradRequested, ...gradYear },
    standing,
  };
}
