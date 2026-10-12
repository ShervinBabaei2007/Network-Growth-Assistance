import { DEGREE_LEVELS, type DegreeLevel, type Requirement, type RequirementResult, type ResumeFacts } from "./types";

/**
 * Rules, not the model, decide whether a posting fits. The model only reads the
 * posting into requirements and points at resume lines; years, degrees, clearance and
 * work authorization are decided here from the resume's dates and the user's facts.
 */

export type Tier = "strong" | "good" | "stretch" | "excluded";

export type Applicant = {
  years: number;
  degree: DegreeLevel | null;
  facts: ResumeFacts;
};

export type FitOutcome = {
  score: number;
  tier: Tier;
  results: RequirementResult[];
  exclusionReasons: string[];
  summary: string;
};

/** A required years gap this large excludes the posting. */
export const YEARS_KNOCKOUT_GAP = 3;
/** Fewer than this share of must-haves met excludes the posting. */
export const MIN_MUST_COVERAGE = 0.5;
export const TIER_STRONG = 75;
export const TIER_GOOD = 55;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const fmtYears = (y: number) => (y < 1 ? "less than a year" : `about ${plural(Math.round(y), "year")}`);
const equivalentOk = (text: string) => /\bor (an )?equivalent\b|\bor related experience\b/i.test(text);
const short = (t: string) => (t.length > 90 ? `${t.slice(0, 87).trimEnd()}…` : t);

/** Decides the requirements that don't need the model, and overrides what it said for them. */
export function decideRule(req: Requirement, given: RequirementResult | undefined, a: Applicant): RequirementResult {
  const base: RequirementResult = given ?? { requirementId: req.id, status: "missing", quote: null, note: null };
  switch (req.category) {
    case "years": {
      if (req.years == null) return base;
      const gap = req.years - a.years;
      const status = gap <= 0 ? "met" : gap < YEARS_KNOCKOUT_GAP ? "partial" : "missing";
      return { ...base, status, note: `Asks for ${plural(req.years, "year")}; your resume shows ${fmtYears(a.years)}.` };
    }
    case "degree": {
      if (!req.degreeLevel) return base;
      if (!a.degree) return { ...base, status: "partial", note: "Couldn't tell your degree level from the resume." };
      const ok = DEGREE_LEVELS.indexOf(a.degree) >= DEGREE_LEVELS.indexOf(req.degreeLevel);
      return { ...base, status: ok ? "met" : equivalentOk(req.text) ? "partial" : "missing" };
    }
    case "clearance":
      return { ...base, status: a.facts.securityClearance ? "met" : "missing", quote: null, note: a.facts.securityClearance ? "You said you hold a clearance." : null };
    case "authorization": {
      const t = req.text.toLowerCase();
      const citizenOnly = /\bcitizen(ship)?\b/.test(t) && !/permanent resident/.test(t);
      const auth = a.facts.workAuthorization;
      if (auth === "unknown") return { ...base, status: "partial", quote: null, note: "Set your work authorization on the Resume page to check this." };
      if (citizenOnly) return { ...base, status: auth === "citizen" ? "met" : "missing", quote: null, note: null };
      return { ...base, status: auth === "needs_sponsorship" ? "missing" : "met", quote: null, note: null };
    }
    default:
      return base;
  }
}

const DEGREE_LABEL: Record<DegreeLevel, string> = { diploma: "a diploma", bachelor: "a bachelor's degree", master: "a master's degree", phd: "a PhD" };

function knockout(req: Requirement, r: RequirementResult, a: Applicant): string | null {
  if (req.kind !== "must" || r.status !== "missing") return null;
  switch (req.category) {
    case "licence":
      return `Requires ${short(req.text)}; your resume doesn't show it.`;
    case "clearance":
      return `Requires a security clearance (${short(req.text)}).`;
    case "authorization":
      return `Work authorization doesn't match: ${short(req.text)}.`;
    case "years":
      return r.note ?? `Asks for more experience than your resume shows.`;
    case "degree":
      return `Requires ${DEGREE_LABEL[req.degreeLevel!]} or higher; your resume shows ${a.degree ? DEGREE_LABEL[a.degree] : "no degree"}.`;
    default:
      return null;
  }
}

const credit = (s: RequirementResult["status"]) => (s === "met" ? 1 : s === "partial" ? 0.5 : 0);

export function scoreFit(requirements: Requirement[], modelResults: RequirementResult[], a: Applicant): FitOutcome {
  const byId = new Map(modelResults.map((r) => [r.requirementId, r]));
  const results = requirements.map((req) => decideRule(req, byId.get(req.id), a));
  const pairs = requirements.map((req, i) => [req, results[i]] as const);

  const reasons = pairs.map(([req, r]) => knockout(req, r, a)).filter((r): r is string => r !== null);
  const musts = pairs.filter(([req]) => req.kind === "must");
  const nices = pairs.filter(([req]) => req.kind === "nice");
  const coverage = (list: typeof pairs) => (list.length ? list.reduce((s, [, r]) => s + credit(r.status), 0) / list.length : null);
  const mustCov = coverage(musts);
  const niceCov = coverage(nices);

  if (mustCov !== null && musts.length >= 2 && mustCov < MIN_MUST_COVERAGE) {
    const missing = musts.filter(([, r]) => r.status === "missing").map(([req]) => short(req.text));
    reasons.push(`Meets ${Math.round(mustCov * 100)}% of the required qualifications. Missing: ${missing.slice(0, 4).join("; ")}${missing.length > 4 ? "…" : ""}`);
  }

  const yearsReq = requirements.filter((r) => r.category === "years" && r.years != null).map((r) => r.years!);
  const yearsGap = yearsReq.length ? Math.max(...yearsReq) - a.years : 0;
  const seniority = yearsGap <= 0 ? 1 : yearsGap < YEARS_KNOCKOUT_GAP ? 0.5 : 0;
  // With no must-haves listed, all requirements stand in for them.
  const primary = mustCov ?? niceCov ?? 0.5;
  const score = Math.round(70 * primary + 20 * (niceCov ?? primary) + 10 * seniority);
  const tier: Tier = reasons.length ? "excluded" : score >= TIER_STRONG ? "strong" : score >= TIER_GOOD ? "good" : "stretch";

  const met = results.filter((r) => r.status === "met").length;
  const summary = reasons.length
    ? reasons[0]
    : requirements.length
      ? `Meets ${met} of ${requirements.length} listed requirements${musts.length ? ` (${musts.filter(([, r]) => r.status === "met").length} of ${musts.length} required)` : ""}.`
      : "The posting doesn't list clear requirements.";
  return { score: Math.max(0, Math.min(100, score)), tier, results, exclusionReasons: reasons, summary: summary.slice(0, 500) };
}

// ------------------------------------------------------------------ prefilter

const SENIOR_TITLE = /\b(senior|sr|staff|principal|lead|manager|director|head|architect|vp)\b/i;
const JUNIOR_TITLE = /\b(junior|jr|intern|co-?op|new grad|graduate|entry|associate)\b/i;

/**
 * A cheap, model-free relevance score used to choose which postings get AI evaluation
 * first: skills from the resume found in the posting, minus a penalty for senior titles
 * when the resume shows little experience.
 */
export function prefilterScore(posting: { title: string; description: string }, skillsClean: string[], years: number): number {
  const text = ` ${posting.title} ${posting.description} `.toLowerCase().replace(/[^a-z0-9+#]+/g, " ");
  const hits = skillsClean.filter((s) => s && text.includes(` ${s} `)).length;
  let score = Math.min(1, hits / 8) * 100;
  if (SENIOR_TITLE.test(posting.title) && years < 5) score -= 40;
  if (JUNIOR_TITLE.test(posting.title) && years < 3) score += 15;
  return score;
}

// ------------------------------------------------------------------ explanation

export type FitExplanation = {
  /** What the resume clearly shows: skill names where a requirement names skills, else the requirement. */
  strong: string[];
  /** Required items the resume doesn't show. */
  missing: string[];
  /** Preferred items the resume doesn't show. */
  preferredNotFound: string[];
};

const label = (req: Requirement, skillNames: (text: string) => string[]) => {
  const names = skillNames(req.text);
  return names.length ? names : [short(req.text)];
};

/**
 * "Strong matches: React, TypeScript · Missing: AWS · Preferred not found: 3+ years", built
 * only from the requirement results, so the explanation always agrees with the score.
 */
export function explainFit(requirements: Requirement[], results: RequirementResult[], skillNames: (text: string) => string[]): FitExplanation {
  const byId = new Map(results.map((r) => [r.requirementId, r]));
  const out: FitExplanation = { strong: [], missing: [], preferredNotFound: [] };
  for (const req of requirements) {
    const status = byId.get(req.id)?.status ?? "missing";
    if (status === "met") out.strong.push(...label(req, skillNames));
    else if (status === "missing") (req.kind === "must" ? out.missing : out.preferredNotFound).push(...label(req, skillNames));
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  return { strong: uniq(out.strong), missing: uniq(out.missing), preferredNotFound: uniq(out.preferredNotFound) };
}
