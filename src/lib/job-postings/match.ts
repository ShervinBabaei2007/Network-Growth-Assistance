import { LANGUAGE_RE, LICENCE_RE } from "./requirements";
import { skillsIn, wordingIn, type Skill } from "./taxonomy";
import type { Requirement, RequirementResult } from "./types";

/**
 * Checks requirements against a resume without AI. Skills are matched through the
 * taxonomy (an alias is the skill itself; the same family is partial). Other lines are
 * matched by meaning: the closest resume line by embedding similarity. Every quote is
 * a real line from the resume. Years, degree, clearance and authorization are left to
 * the rules in fit.ts.
 */

export type ResumeLine = { id: string; text: string };
export type SemanticHit = { lineId: string; similarity: number };
export type Thresholds = { met: number; partial: number };

/** For gte-small: unrelated sentences sit around 0.70–0.78, close paraphrases above 0.86. */
export const GTE_SMALL_THRESHOLDS: Thresholds = { met: 0.86, partial: 0.8 };

const RULE_CATEGORIES = new Set(["years", "degree", "clearance", "authorization"]);
const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");

export type ResumeIndex = { lines: ResumeLine[]; skills: Map<string, ResumeLine>; families: Map<string, Skill> };

/** The resume's skills (with the first line naming each) and skill families, computed once. */
export function indexResume(lines: ResumeLine[]): ResumeIndex {
  const skills = new Map<string, ResumeLine>();
  const families = new Map<string, Skill>();
  for (const line of lines) {
    for (const s of skillsIn(line.text)) {
      if (!skills.has(s.name)) skills.set(s.name, line);
      if (!families.has(s.family)) families.set(s.family, s);
    }
  }
  return { lines, skills, families };
}

const quote = (l: ResumeLine | undefined) => (l ? l.text.slice(0, 300) : null);

function matchSkills(req: Requirement, r: ResumeIndex): RequirementResult | null {
  const wanted = skillsIn(req.text);
  if (!wanted.length) return null;
  const have = wanted.filter((s) => r.skills.has(s.name));
  const family = wanted.filter((s) => !r.skills.has(s.name) && r.families.has(s.family));
  // "Python, Go or Java": any one is enough.
  const anyOf = /\bor\b|\bany of\b|\bone of\b|\bsuch as\b|\be\.g\./i.test(req.text);
  const base = { requirementId: req.id };
  if (have.length && (anyOf || have.length === wanted.length)) return { ...base, status: "met", quote: quote(r.skills.get(have[0].name)), note: null };
  if (have.length) {
    const missing = wanted.filter((s) => !r.skills.has(s.name)).map((s) => s.name);
    return { ...base, status: "partial", quote: quote(r.skills.get(have[0].name)), note: `Your resume doesn't mention ${missing.join(", ")}.` };
  }
  if (family.length) {
    const related = r.families.get(family[0].family)!;
    return { ...base, status: "partial", quote: quote(r.skills.get(related.name)), note: `Related: you have ${related.name}, not ${family[0].name}.` };
  }
  return { ...base, status: "missing", quote: null, note: null };
}

function matchLicence(req: Requirement, r: ResumeIndex): RequirementResult {
  const token = req.text.match(LICENCE_RE)?.[1];
  const line = token ? r.lines.find((l) => norm(l.text).includes(norm(token))) : undefined;
  return { requirementId: req.id, status: line ? "met" : "missing", quote: quote(line), note: null };
}

function matchLanguage(req: Requirement, r: ResumeIndex): RequirementResult {
  // "Bilingual" and "français" in a Canadian posting mean French.
  const needed = [...new Set([...req.text.matchAll(new RegExp(LANGUAGE_RE.source, "gi"))].map((m) => m[1].toLowerCase().replace(/^(bilingual|fran[çc]ais)$/, "french")))];
  const pattern = (lang: string) => (lang === "french" ? /\b(french|bilingual)\b|fran[çc]ais/i : new RegExp(`\\b${lang}\\b`, "i"));
  const missing = needed.filter((lang) => !r.lines.some((l) => pattern(lang).test(l.text)));
  const line = r.lines.find((l) => needed.some((lang) => pattern(lang).test(l.text)));
  return { requirementId: req.id, status: missing.length ? "missing" : "met", quote: missing.length ? null : quote(line), note: missing.length ? `Your resume doesn't mention ${missing.join(", ")}.` : null };
}

function bySemantic(req: Requirement, hit: SemanticHit | undefined, r: ResumeIndex, t: Thresholds): RequirementResult | null {
  if (!hit) return null;
  const line = r.lines.find((l) => l.id === hit.lineId);
  if (!line) return null;
  if (hit.similarity >= t.met) return { requirementId: req.id, status: "met", quote: quote(line), note: null };
  if (hit.similarity >= t.partial) return { requirementId: req.id, status: "partial", quote: quote(line), note: "Your closest experience; check it really covers this." };
  return null;
}

export function matchFree(requirements: Requirement[], resume: ResumeIndex, semantic: Map<string, SemanticHit> | null, thresholds: Thresholds): RequirementResult[] {
  return requirements.map((req): RequirementResult => {
    const none: RequirementResult = { requirementId: req.id, status: "missing", quote: null, note: null };
    if (RULE_CATEGORIES.has(req.category)) return none;
    if (req.category === "licence") return matchLicence(req, resume);
    if (req.category === "language") return matchLanguage(req, resume);

    const bySkill = matchSkills(req, resume);
    if (bySkill?.status === "met") return bySkill;
    const byMeaning = bySemantic(req, semantic?.get(req.id), resume, thresholds);
    if (byMeaning && (!bySkill || byMeaning.status === "met")) return byMeaning;
    if (bySkill) return bySkill;
    if (req.category === "location") return { ...none, status: "partial", note: "Check you can work from this location." };
    // Soft skills ("strong communicator") can't be checked from a resume without AI: half credit, said plainly.
    return { ...none, status: "partial", note: semantic ? "No line in your resume clearly matches this." : "Couldn't check this automatically." };
  });
}

/**
 * Lines to match against: every bullet, the summary's sentences, each skills line and
 * certifications. Entry headers ("Software Developer Co-op, Acme") are left out: they
 * match job titles by their words, not by what the person did.
 */
export function resumeLinesFrom(profile: {
  summary: string | null;
  skills: string[];
  certifications: string[];
  experience: { id: string; organization: string; title: string | null; bullets: { id: string; text: string }[] }[];
  projects: { id: string; organization: string; title: string | null; bullets: { id: string; text: string }[] }[];
  education: { id: string; organization: string; title: string | null; bullets: { id: string; text: string }[] }[];
}): ResumeLine[] {
  const lines: ResumeLine[] = [];
  (profile.summary ?? "")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 3)
    .forEach((text, i) => lines.push({ id: `s${i + 1}`, text: text.trim() }));
  for (const e of [...profile.experience, ...profile.projects, ...profile.education]) for (const b of e.bullets) lines.push({ id: b.id, text: b.text });
  for (let i = 0; i < profile.skills.length; i += 12) lines.push({ id: `k${i / 12 + 1}`, text: profile.skills.slice(i, i + 12).join(", ") });
  profile.certifications.forEach((c, i) => lines.push({ id: `c${i + 1}`, text: c }));
  return lines.filter((l) => l.text.trim().length > 0).map((l) => ({ ...l, text: l.text.slice(0, 1000) }));
}

/** The posting's own words for a skill the resume names differently ("Postgres" → "PostgreSQL"). */
export function postingWording(skill: Skill, postingText: string): string | null {
  return wordingIn(postingText, skill);
}
