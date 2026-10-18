import { clean } from "@/lib/text/match";
import { unknownNumbers, unknownTerms } from "@/lib/text/terms";
import type { AiNotesOut } from "@/lib/ai/provider";
import { decideRule, type Applicant } from "./fit";
import type { JobAnalysis } from "./job-analysis";
import { skillByName, skillsIn, wordingIn } from "./taxonomy";
import type { Requirement, RequirementResult, ResumeEntry, ResumeProfile } from "./types";

/**
 * Improvement Notes: what the user could change in their own resume for one job, and why.
 * Analysis only. These functions receive the resume and return advice; they never return
 * or save a changed resume (the caller stores the report on its own).
 *
 * Every note is tied to the posting (a requirement or how often it names something) and
 * to the resume (a real line, entry or section). Nothing suggests adding a skill the resume
 * doesn't show, and no note proposes numbers: it asks for the user's own, "if accurate".
 */

import { NOTE_SECTIONS, type NotePriority, type NoteSection } from "./note-sections";

export { NOTE_SECTIONS };
export type { NotePriority, NoteSection };

export type Note = {
  id: string;
  section: NoteSection;
  priority: NotePriority;
  recommendation: string;
  why: string;
  /** The resume line or entry the note is about, as written. */
  resumeQuote?: string;
  /** The bullet or entry id, for the UI to link to. */
  target?: string;
  source: "rules" | "ai";
};

export type KeywordStatus = { term: string; required: boolean; count: number; where?: string };

export type NotesReport = {
  comparison: {
    strong: KeywordStatus[];
    couldEmphasize: KeywordStatus[];
    notFound: (KeywordStatus & { message: string })[];
    /** Required qualifications (years, degree, licence…) the rules found missing. */
    missingQualifications: { text: string; kind: "must" | "nice"; message: string }[];
  };
  notes: Note[];
  counts: Record<NotePriority, number> & { total: number };
  /** Nothing high or medium priority: the resume already fits well. */
  strongMatch: boolean;
  method: "rules" | "ai";
};

// ------------------------------------------------------------------ where a term sits

type Place = { weight: number; where: string; entry?: ResumeEntry; bulletIndex?: number };

/** The most prominent place the resume names a keyword, or null if it doesn't. */
export function placementOf(profile: ResumeProfile, term: string): Place | null {
  const skill = skillByName(term) ?? skillsIn(term)[0] ?? null;
  const has = (text: string | null | undefined) => Boolean(text) && (skill ? skillsIn(text!).some((s) => s.name === skill.name) : clean(text).includes(clean(term)));
  const places: Place[] = [];
  if (has(profile.summary)) places.push({ weight: 1, where: "your summary" });
  const skillIdx = profile.skills.findIndex((s) => has(s));
  if (skillIdx >= 0) places.push({ weight: skillIdx < 8 ? 1 : 0.6, where: skillIdx < 8 ? "the top of your Skills" : `position ${skillIdx + 1} of your Skills` });
  for (const e of [...profile.experience, ...profile.projects]) {
    e.bullets.forEach((b, i) => {
      if (has(b.text)) places.push({ weight: i < 2 ? 0.85 : 0.55, where: i < 2 ? `the first lines of ${e.organization}` : `a later line under ${e.organization}`, entry: e, bulletIndex: i });
    });
  }
  for (const e of [...profile.education, ...profile.activities]) if (has(e.title) || e.bullets.some((b) => has(b.text))) places.push({ weight: 0.4, where: e.organization });
  return places.sort((a, b) => b.weight - a.weight)[0] ?? null;
}

/** Strong at or above this, "could be emphasized" below it. */
const PROMINENT = 0.85;

// ------------------------------------------------------------------ content relevance

export type RankedEntry = { entry: ResumeEntry; index: number; score: number; matched: string[] };

/**
 * How relevant each job and project is to the posting: the posting's keywords its lines
 * name (required ones count double), plus lines the fit check quoted as evidence.
 */
export function rankResumeContent(profile: ResumeProfile, analysis: JobAnalysis, results: RequirementResult[]): { experience: RankedEntry[]; projects: RankedEntry[]; bulletScore: (text: string) => number } {
  const weightOf = new Map(analysis.atsKeywords.map((k) => [k.term, k.required ? 2 : 1]));
  const quoted = new Set(results.filter((r) => r.status !== "missing" && r.quote).map((r) => r.quote!));
  const bulletScore = (text: string) => skillsIn(text).reduce((s, k) => s + (weightOf.get(k.name) ?? 0), 0) + (quoted.has(text) ? 2 : 0);
  const rank = (list: ResumeEntry[]): RankedEntry[] =>
    list.map((entry, index) => {
      const text = [entry.title ?? "", ...entry.bullets.map((b) => b.text)].join("\n");
      const matched = [...new Set(skillsIn(text).filter((s) => weightOf.has(s.name)).map((s) => s.name))];
      return { entry, index, matched, score: entry.bullets.reduce((s, b) => s + bulletScore(b.text), 0) + skillsIn(entry.title ?? "").filter((s) => weightOf.has(s.name)).length };
    });
  return { experience: rank(profile.experience), projects: rank(profile.projects), bulletScore };
}

// ------------------------------------------------------------------ the rules

const WEAK_OPENING = /^(worked on|helped( with| to)?|assisted( with)?|responsible for|involved in|participated in|tasked with|did|handled|various|duties included)\b/i;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const short = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** A bullet that says little a recruiter or an ATS could match: a weak opening, or short with no technology named. */
export function isVague(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  return WEAK_OPENING.test(text.trim()) || (words <= 8 && skillsIn(text).length === 0);
}

export function buildImprovementNotes(input: {
  profile: ResumeProfile;
  analysis: JobAnalysis;
  requirements: Requirement[];
  results: RequirementResult[];
  applicant: Applicant;
  posting: { title: string; company: string | null; description: string };
}): NotesReport {
  const { profile, analysis, requirements, applicant, posting } = input;
  // Years, degree, clearance and authorization are decided by the same rules as the fit check.
  const given = new Map(input.results.map((r) => [r.requirementId, r]));
  const results = requirements.map((r) => decideRule(r, given.get(r.id), applicant));
  const notes: Note[] = [];
  const add = (n: Omit<Note, "id" | "source">) => notes.push({ ...n, id: `n${notes.length + 1}`, source: "rules" });
  const keywords = analysis.atsKeywords.slice(0, 15);

  // ---- requirement comparison
  const strong: KeywordStatus[] = [];
  const couldEmphasize: KeywordStatus[] = [];
  const notFound: NotesReport["comparison"]["notFound"] = [];
  for (const k of keywords) {
    const place = placementOf(profile, k.term);
    const item = { term: k.term, required: k.required, count: k.count, where: place?.where };
    if (!place) {
      notFound.push({
        ...item,
        message: `${k.term} is listed as ${k.required ? "a required" : "a preferred"} qualification, but it was not found in your resume. Do not add it unless you genuinely have that experience.`,
      });
    } else if (place.weight >= PROMINENT) strong.push(item);
    else couldEmphasize.push(item);
  }
  const byId = new Map(results.map((r) => [r.requirementId, r]));
  const missingQualifications = requirements
    .filter((r) => r.category !== "skill" && byId.get(r.id)?.status === "missing")
    .map((r) => ({
      text: r.text,
      kind: r.kind,
      message: `${r.kind === "must" ? "Required" : "Preferred"}: “${short(r.text, 140)}”. Your resume doesn't show this. Don't claim it unless it's true; if you do have it, add it where it belongs.`,
    }));

  // ---- skills
  const requiredPresent = keywords.filter((k) => k.required && placementOf(profile, k.term));
  for (const k of requiredPresent) {
    const idx = profile.skills.findIndex((s) => skillsIn(s).some((x) => x.name === k.term) || clean(s) === clean(k.term));
    const place = placementOf(profile, k.term)!;
    if (idx === -1) {
      add({
        section: "skills",
        priority: "high",
        recommendation: `Add ${k.term} to your Skills section. You already show it ${place.where === "your summary" ? "in your summary" : `in ${place.where}`}, but it isn't listed as a skill.`,
        why: `${k.term} is a required skill and the posting mentions it ${times(k.count)}. Applicant-tracking systems often check the skills section for exact terms.`,
        resumeQuote: place.entry && place.bulletIndex !== undefined ? place.entry.bullets[place.bulletIndex]?.text : undefined,
      });
    } else if (idx >= 8) {
      add({
        section: "skills",
        priority: "high",
        recommendation: `Move ${profile.skills[idx]} higher in your Skills section (it's skill number ${idx + 1}).`,
        why: `${k.term} is a required skill and appears ${times(k.count)} in the posting; skills near the start are the ones a recruiter sees first and an ATS weighs most.`,
      });
    }
  }
  const matchedSkills = profile.skills.filter((s) => skillsIn(s).some((x) => keywords.some((k) => k.term === x.name)));
  const firstFew = profile.skills.slice(0, Math.max(3, matchedSkills.length));
  if (matchedSkills.length >= 2 && matchedSkills.some((s) => !firstFew.includes(s)) && !notes.some((n) => n.section === "skills" && n.priority === "high")) {
    add({
      section: "skills",
      priority: "medium",
      recommendation: `Reorder your Skills so ${list(matchedSkills.slice(0, 5))} come first.`,
      why: "These are the skills you have that this posting asks for. Leading with them makes the match obvious at a glance.",
    });
  }
  for (const k of keywords) {
    const skill = skillByName(k.term);
    if (!skill) continue;
    const mine = wordingIn([profile.skills.join(", "), ...profile.experience.flatMap((e) => e.bullets.map((b) => b.text))].join("\n"), skill);
    const theirs = wordingIn(posting.description, skill);
    if (mine && theirs && mine.toLowerCase() !== theirs.toLowerCase() && !/[/,]/.test(mine + theirs)) {
      add({ section: "skills", priority: "optional", recommendation: `Write “${theirs}” instead of “${mine}”, as the posting does.`, why: `It's the same skill, but an ATS may look for the posting's exact spelling (“${theirs}”).` });
    }
  }

  // ---- experience and projects
  const ranked = rankResumeContent(profile, analysis, results);
  for (const r of ranked.experience) {
    const scored = r.entry.bullets.map((b, i) => ({ b, i, s: ranked.bulletScore(b.text) }));
    const best = [...scored].sort((a, b) => b.s - a.s || a.i - b.i)[0];
    if (best && best.s > 0 && best.i >= 2 && scored.slice(0, 2).every((x) => x.s < best.s)) {
      const terms = skillsIn(best.b.text)
        .filter((s) => keywords.some((k) => k.term === s.name))
        .map((s) => s.name);
      add({
        section: "experience",
        priority: "high",
        recommendation: `Move this bullet to the top of ${r.entry.organization}: “${short(best.b.text)}”.`,
        why: `It shows ${terms.length ? list(terms) : "work the posting asks for"}, which this role emphasizes, but it's line ${best.i + 1}. Readers skim the first lines of each job.`,
        resumeQuote: best.b.text,
        target: best.b.id,
      });
    }
  }
  const emphasized = keywords.slice(0, 5).map((k) => k.term);
  const relevantEntries = ranked.experience.filter((r) => r.score > 0).map((r) => r.entry.id);
  let vagueCount = 0;
  for (const e of profile.experience) {
    for (const b of e.bullets) {
      if (vagueCount >= 3 || !isVague(b.text)) continue;
      vagueCount++;
      add({
        section: "experience",
        priority: relevantEntries.includes(e.id) || profile.experience.length === 1 ? "medium" : "optional",
        recommendation: `If accurate, rewrite “${short(b.text)}” (${e.organization}) to say what you built or did, the technologies you used${emphasized.length ? ` (for example ${list(emphasized.slice(0, 3))}, if you used them)` : ""}, and the effect of the work.`,
        why: `This role emphasizes ${list(emphasized.slice(0, 4)) || "specific skills"}. A general line doesn't show them, so it won't match what the recruiter or an ATS looks for. Don't add results you can't stand behind.`,
        resumeQuote: b.text,
        target: b.id,
      });
    }
  }
  const projects = ranked.projects;
  const topProject = [...projects].sort((a, b) => b.score - a.score || a.index - b.index)[0];
  if (topProject && topProject.score > 0 && topProject.index > 0 && projects.slice(0, topProject.index).every((p) => p.score < topProject.score)) {
    add({
      section: "projects",
      priority: "high",
      recommendation: `Move your ${topProject.entry.organization} project to the top of Projects.`,
      why: `It's the project most related to this role (${list(topProject.matched.slice(0, 4)) || "it matches the posting's requirements"}), but it's listed ${topProject.index + 1}${topProject.index === 1 ? "nd" : topProject.index === 2 ? "rd" : "th"}.`,
      target: topProject.entry.id,
    });
  }
  for (const p of projects) {
    if (projects.length >= 3 && p.score === 0) {
      add({ section: "projects", priority: "optional", recommendation: `Consider leaving out ${p.entry.organization} for this application.`, why: "It doesn't relate to this posting's requirements, and space is better spent on projects that do.", target: p.entry.id });
    }
  }

  // ---- summary
  const top3 = strong.concat(couldEmphasize).slice(0, 3).map((k) => k.term);
  if (!profile.summary) {
    add({
      section: "summary",
      priority: "medium",
      recommendation: `Consider adding a 2–3 sentence summary that names the role (${posting.title})${top3.length ? ` and your strongest matching skills (${list(top3)})` : ""}.`,
      why: "A short summary at the top tells a recruiter in seconds why you fit, and gives an ATS the role's key terms. Use only what your resume already shows.",
    });
  } else {
    const mentions = keywords.filter((k) => placementOf({ ...profile, skills: [], experience: [], projects: [], education: [], activities: [] }, k.term)).map((k) => k.term);
    if (!mentions.length && top3.length) {
      add({
        section: "summary",
        priority: "medium",
        recommendation: `Mention ${list(top3)} in your summary${clean(profile.summary).includes(clean(posting.title)) ? "" : `, and the kind of role you're after (${posting.title})`}.`,
        why: "Your summary doesn't name any of the skills this posting emphasizes, though your experience shows them.",
        resumeQuote: profile.summary,
      });
    }
  }

  // ---- education and qualifications
  const yearsReq = analysis.yearsRequired;
  if (applicant.years < 1 && profile.education.length && profile.experience.length) {
    add({ section: "education", priority: "medium", recommendation: "Put Education above Experience.", why: "With under a year of work experience, your studies are your strongest qualification; recruiters for early-career roles look there first." });
  }
  if (yearsReq !== null && applicant.years >= yearsReq && !/\b\d+\+?\s*years?\b/i.test(profile.summary ?? "")) {
    add({
      section: "summary",
      priority: "high",
      recommendation: `Say how much experience you have in your summary (your dates add up to about ${Math.floor(applicant.years)} year${Math.floor(applicant.years) === 1 ? "" : "s"}).`,
      why: `The posting requires ${yearsReq}+ years. You meet it, but a reader has to add up your dates to see that.`,
    });
  }
  for (const q of missingQualifications.filter((m) => m.kind === "must").slice(0, 3)) {
    add({ section: "other", priority: "high", recommendation: q.message, why: "Required qualifications are often screened first. If you have it, make it easy to find; if you don't, don't claim it." });
  }

  return finish(notes, { strong, couldEmphasize, notFound, missingQualifications }, "rules");
}

const ORDER: Record<NotePriority, number> = { high: 0, medium: 1, optional: 2 };

function finish(notes: Note[], comparison: NotesReport["comparison"], method: "rules" | "ai"): NotesReport {
  const sorted = [...notes].sort((a, b) => NOTE_SECTIONS.indexOf(a.section) - NOTE_SECTIONS.indexOf(b.section) || ORDER[a.priority] - ORDER[b.priority]);
  const counts = { high: 0, medium: 0, optional: 0, total: sorted.length };
  for (const n of sorted) counts[n.priority]++;
  return { comparison, notes: sorted, counts, strongMatch: counts.high === 0 && counts.medium === 0, method };
}

/** Words advice uses that make no claim about the person. */
const NOTE_WORDS = ["ATS", "ATSs", "Skills", "Summary", "Experience", "Projects", "Education", "Awards", "Activities", "If", "Consider", "Move", "Rewrite", "Reorder"];

/** Phrases that tell the user to put something into the resume. */
const ADDING = /\b(add|include|mention|list|highlight|emphasi[sz]e|feature|showcase|put)\b/i;

/**
 * Adds the AI's notes to the rule-based report, keeping only those that pass the same
 * standard: about a real line or section, no new numbers, no names or technologies the
 * resume and posting don't contain, and never "add X" for something the resume lacks.
 */
export function mergeAiNotes(report: NotesReport, ai: AiNotesOut, profile: ResumeProfile, resumeText: string, postingText: string): { report: NotesReport; rejected: number } {
  const ids = new Set([...profile.experience, ...profile.projects, ...profile.education].flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]));
  const bulletText = new Map([...profile.experience, ...profile.projects].flatMap((e) => e.bullets.map((b) => [b.id, b.text] as const)));
  const lacking = report.comparison.notFound.map((k) => k.term);
  const known = `${resumeText}\n${postingText}`;
  let rejected = 0;
  const extra: Note[] = [];
  for (const n of ai.notes.slice(0, 8)) {
    const text = `${n.recommendation} ${n.why}`;
    const badTarget = n.target !== null && !ids.has(n.target);
    const suggestsMissing = lacking.some((term) => clean(n.recommendation).includes(clean(term)) && ADDING.test(n.recommendation) && !/\b(not found|don't add|do not add|unless)\b/i.test(n.recommendation));
    const newNumbers = unknownNumbers(n.recommendation, resumeText).length > 0;
    const newTerms = unknownTerms(text, known, NOTE_WORDS).length > 0;
    if (badTarget || suggestsMissing || newNumbers || newTerms) {
      rejected++;
      continue;
    }
    extra.push({ id: `a${extra.length + 1}`, section: n.section, priority: n.priority, recommendation: n.recommendation.trim(), why: n.why.trim(), target: n.target ?? undefined, resumeQuote: n.target ? bulletText.get(n.target) : undefined, source: "ai" });
  }
  return { report: finish([...report.notes, ...extra], report.comparison, extra.length ? "ai" : report.method), rejected };
}

/** The rule-based notes as text, for the AI prompt (so it doesn't repeat them). */
export const notesForPrompt = (r: NotesReport) => r.notes.map((n) => `- [${n.section}/${n.priority}] ${n.recommendation}`).join("\n") || "(none)";
