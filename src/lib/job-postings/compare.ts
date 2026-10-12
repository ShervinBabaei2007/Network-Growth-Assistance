import { clean } from "@/lib/text/match";
import type { TailoredResumeDoc } from "./documents";
import { scoreFit, type Applicant } from "./fit";
import type { JobAnalysis } from "./job-analysis";
import { GTE_SMALL_THRESHOLDS, indexResume, matchFree, type ResumeLine } from "./match";
import type { Materiality } from "./tailor";
import { skillByName, skillsIn, wordingIn } from "./taxonomy";
import type { Requirement, ResumeProfile } from "./types";

/**
 * Before-and-after numbers for a tailored document, computed the same way for both so the
 * difference means something. Two measures, never mixed up:
 *
 * - Keyword match: how prominently the posting's most important terms appear (in the
 *   summary, early in the skills list, first in a job's bullets). Tailoring can raise it.
 * - Requirement match: how many of the posting's requirements the content meets, from the
 *   same rules as the fit check. Truthful tailoring rarely changes it: it can't add
 *   experience the resume doesn't have.
 */

type Located = { text: string; weight: number };

/** Where text sits in a document, weighted by how likely a reader (or an ATS) is to see it. */
function locate(doc: { summary: string | null; skills: string[]; entries: { bullets: string[] }[]; other: string[] }): Located[] {
  const out: Located[] = [];
  if (doc.summary) out.push({ text: doc.summary, weight: 1 });
  doc.skills.forEach((s, i) => out.push({ text: s, weight: i < 8 ? 1 : 0.6 }));
  for (const e of doc.entries) e.bullets.forEach((b, i) => out.push({ text: b, weight: i < 2 ? 0.85 : 0.55 }));
  for (const t of doc.other) out.push({ text: t, weight: 0.4 });
  return out;
}

const fromProfile = (p: ResumeProfile) => ({
  summary: p.summary,
  skills: p.skills,
  entries: [...p.experience, ...p.projects].map((e) => ({ bullets: e.bullets.map((b) => b.text) })),
  other: [...p.education, ...p.certifications.map((c) => ({ title: c, bullets: [] as { text: string }[] }))].flatMap((e) => [e.title ?? "", ...e.bullets.map((b) => b.text)]),
});

const fromDoc = (d: TailoredResumeDoc) => ({
  summary: d.summary,
  skills: d.skills,
  entries: d.sections.filter((s) => s.key === "experience" || s.key === "projects").flatMap((s) => s.entries.map((e) => ({ bullets: e.bullets.map((b) => b.text) }))),
  other: [...d.sections.filter((s) => s.key !== "experience" && s.key !== "projects").flatMap((s) => s.entries.flatMap((e) => [e.title ?? "", ...e.bullets.map((b) => b.text)])), ...d.certifications],
});

/** The weight of the most prominent place a keyword appears (0 if nowhere). */
function presence(located: Located[], term: string): number {
  const skill = skillByName(term) ?? skillsIn(term)[0] ?? null;
  let best = 0;
  for (const l of located) {
    const found = skill ? skillsIn(l.text).some((s) => s.name === skill.name) : clean(l.text).includes(clean(term));
    if (found) best = Math.max(best, l.weight);
  }
  return best;
}

export type Comparison = {
  keywordMatch: { before: number; after: number };
  requirementMatch: { before: number; after: number };
  /** Keywords that became more prominent. */
  keywordsSurfaced: string[];
  /** Keywords written the posting's way now ("Postgres" → "PostgreSQL"). */
  keywordsAligned: { from: string; to: string }[];
  /** Keywords the resume doesn't contain at all (not added, since that would be untrue). */
  keywordsMissing: string[];
  requirementsMatched: string[];
  missingRequirements: { text: string; kind: "must" | "nice" }[];
  bulletsReworded: number;
  bulletsTotal: number;
  bulletsMovedUp: number;
  explanation: string[];
};

const pct = (x: number) => Math.round(x * 100);

function linesOf(d: { summary: string | null; skills: string[]; entries: { bullets: string[] }[]; other: string[] }): ResumeLine[] {
  const lines: ResumeLine[] = [];
  if (d.summary) lines.push({ id: "s", text: d.summary });
  for (let i = 0; i < d.skills.length; i += 12) lines.push({ id: `k${i}`, text: d.skills.slice(i, i + 12).join(", ") });
  d.entries.forEach((e, i) => e.bullets.forEach((b, j) => lines.push({ id: `e${i}b${j}`, text: b })));
  d.other.forEach((t, i) => t && lines.push({ id: `o${i}`, text: t }));
  return lines;
}

function requirementScore(requirements: Requirement[], lines: ResumeLine[], applicant: Applicant) {
  const results = matchFree(requirements, indexResume(lines), null, GTE_SMALL_THRESHOLDS);
  return scoreFit(requirements, results, applicant);
}

export function compareTailoring(input: {
  profile: ResumeProfile;
  doc: TailoredResumeDoc;
  analysis: JobAnalysis;
  requirements: Requirement[];
  applicant: Applicant;
  postingText: string;
  materiality: Materiality;
}): Comparison {
  const before = fromProfile(input.profile);
  const after = fromDoc(input.doc);
  const beforeLoc = locate(before);
  const afterLoc = locate(after);
  const keywords = input.analysis.atsKeywords.slice(0, 15);
  const weights = keywords.map((k) => ({ term: k.term, before: presence(beforeLoc, k.term), after: presence(afterLoc, k.term) }));
  const kwScore = (side: "before" | "after") => (weights.length ? weights.reduce((s, w) => s + w[side], 0) / weights.length : 0);

  const fitBefore = requirementScore(input.requirements, linesOf(before), input.applicant);
  const fitAfter = requirementScore(input.requirements, linesOf(after), input.applicant);
  const resultsAfter = new Map(fitAfter.results.map((r) => [r.requirementId, r]));

  const beforeText = [before.summary ?? "", ...before.skills, ...before.entries.flatMap((e) => e.bullets)].join("\n");
  const afterText = [after.summary ?? "", ...after.skills, ...after.entries.flatMap((e) => e.bullets)].join("\n");
  const keywordsAligned: Comparison["keywordsAligned"] = [];
  for (const k of keywords) {
    const skill = skillByName(k.term);
    if (!skill) continue;
    const was = wordingIn(beforeText, skill);
    const now = wordingIn(afterText, skill);
    const posting = wordingIn(input.postingText, skill);
    if (was && now && posting && was.toLowerCase() !== now.toLowerCase() && now.toLowerCase() === posting.toLowerCase()) keywordsAligned.push({ from: was, to: now });
  }

  const comparison: Comparison = {
    keywordMatch: { before: pct(kwScore("before")), after: pct(kwScore("after")) },
    requirementMatch: { before: fitBefore.score, after: fitAfter.score },
    keywordsSurfaced: weights.filter((w) => w.after > w.before && w.before > 0).map((w) => w.term),
    keywordsAligned,
    keywordsMissing: weights.filter((w) => w.after === 0 && w.before === 0).map((w) => w.term),
    requirementsMatched: input.requirements.filter((r) => resultsAfter.get(r.id)?.status === "met").map((r) => r.text),
    missingRequirements: input.requirements.filter((r) => resultsAfter.get(r.id)?.status === "missing").map((r) => ({ text: r.text, kind: r.kind })),
    bulletsReworded: input.materiality.reworded,
    bulletsTotal: input.materiality.bullets,
    bulletsMovedUp: input.materiality.movedUp,
    explanation: [],
  };
  comparison.explanation = explain(comparison, input.materiality);
  return comparison;
}

function explain(c: Comparison, m: Materiality): string[] {
  const out: string[] = [];
  const list = (xs: string[]) => xs.slice(0, 5).join(", ");
  if (c.keywordMatch.after > c.keywordMatch.before) {
    out.push(`Keyword match rose from ${c.keywordMatch.before}% to ${c.keywordMatch.after}% because ${c.keywordsSurfaced.length ? `${list(c.keywordsSurfaced)} now appear${c.keywordsSurfaced.length === 1 ? "s" : ""} in your summary, near the top of your skills or first in your bullets` : "the posting's terms are more prominent"}.`);
  } else if (c.keywordMatch.after < c.keywordMatch.before) {
    out.push(`Keyword match went from ${c.keywordMatch.before}% to ${c.keywordMatch.after}%: some lines that named the posting's terms were left out. Check the tailored version still includes what matters.`);
  } else out.push(`Keyword match stayed at ${c.keywordMatch.after}%.`);
  if (m.bullets) out.push(`${m.reworded} of ${m.bullets} bullets were rewritten in the job's language${m.movedUp ? `, and ${m.movedUp} moved up because they're more relevant` : ""}.`);
  if (m.summaryChanged) out.push("The summary was rewritten for this role, using only facts from your resume.");
  for (const a of c.keywordsAligned.slice(0, 3)) out.push(`“${a.from}” is now written “${a.to}”, as the posting spells it.`);
  if (c.requirementMatch.after === c.requirementMatch.before) {
    out.push(`Requirement match is ${c.requirementMatch.after}% before and after: tailoring changes how your experience is presented, not what it is.`);
  } else if (c.requirementMatch.after > c.requirementMatch.before) {
    out.push(`Requirement match went from ${c.requirementMatch.before}% to ${c.requirementMatch.after}% because the rewritten lines now name requirements your experience already covered.`);
  } else {
    out.push(`Requirement match went from ${c.requirementMatch.before}% to ${c.requirementMatch.after}% because some lines that showed a requirement were left out of this version. You can add them back when you edit it.`);
  }
  if (c.keywordsMissing.length) out.push(`Not in your resume, so not added: ${list(c.keywordsMissing)}.`);
  return out;
}
