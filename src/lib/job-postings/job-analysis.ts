import { clean } from "@/lib/text/match";
import { groupOf, type SkillGroup } from "./skill-groups";
import { skillsIn, type Skill } from "./taxonomy";
import type { Requirement } from "./types";

/**
 * What a job posting asks for, read from the whole description without AI: the skills it
 * requires and prefers, the technologies by kind, the responsibilities, the years and
 * qualifications, and the terms an applicant-tracking system is likely to look for.
 * Every item is taken from the posting's text. An AI reading (optional) can add items,
 * but only ones it can quote from the posting (see groundJobAnalysis).
 */

export type AtsKeyword = {
  term: string;
  /** How often the posting uses it (any of its names). */
  count: number;
  /** Named in a requirement line (required or preferred). */
  inRequirements: boolean;
  required: boolean;
};

export type JobAnalysis = {
  requiredSkills: string[];
  preferredSkills: string[];
  technologies: Record<Exclude<SkillGroup, "other">, string[]>;
  responsibilities: string[];
  yearsRequired: number | null;
  requiredQualifications: string[];
  preferredQualifications: string[];
  /** Most important first. */
  atsKeywords: AtsKeyword[];
  method: "rules" | "ai";
};

const RESPONSIBILITY_HEADING = /\b(responsibilities|what you.ll do|what you will do|day[- ]to[- ]day|in this role you will|your role|key duties|duties|the role|you will)\b/i;
const ANY_HEADING = /^[A-Z][^.!?]{0,60}:?$/;
const BULLET = /^[•\-*▪●◦–·‣⁃■□➢►✓]\s*/;

/** Lines under a "Responsibilities" / "What you'll do" heading. */
export function responsibilitiesIn(description: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const raw of description.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const short = line.length <= 70 && !BULLET.test(line) && !/[.;,]$/.test(line);
    if (short && ANY_HEADING.test(line)) {
      inSection = RESPONSIBILITY_HEADING.test(line);
      continue;
    }
    if (inSection && line.length > 8 && line.length <= 300) out.push(line.replace(BULLET, "").trim());
    if (out.length >= 15) break;
  }
  return out;
}

function countOf(skill: Skill, text: string): number {
  let n = 0;
  for (const name of [skill.name, ...skill.aliases]) {
    const re = new RegExp(`(?<![A-Za-z0-9+#./])${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`, name.length <= 2 ? "g" : "gi");
    n += text.match(re)?.length ?? 0;
  }
  return n;
}

export function analyzeJob(posting: { title: string; description: string }, requirements: Requirement[]): JobAnalysis {
  const text = `${posting.title}\n${posting.description}`;
  const all = skillsIn(text);
  const reqSkills = (kind: "must" | "nice") => new Set(requirements.filter((r) => r.kind === kind).flatMap((r) => skillsIn(r.text).map((s) => s.name)));
  const must = reqSkills("must");
  const nice = reqSkills("nice");
  // Skills named only in the prose (not in a requirement line) still matter, as preferred.
  const requiredSkills = all.filter((s) => must.has(s.name)).map((s) => s.name);
  const preferredSkills = all.filter((s) => !must.has(s.name)).map((s) => s.name);

  const technologies: JobAnalysis["technologies"] = { languages: [], frameworks: [], libraries: [], tools: [] };
  for (const s of all) {
    const g = groupOf(s);
    if (g !== "other") technologies[g].push(s.name);
  }

  const atsKeywords = all
    .map((s) => ({ term: s.name, count: Math.max(1, countOf(s, text)), inRequirements: must.has(s.name) || nice.has(s.name), required: must.has(s.name) }))
    .sort((a, b) => Number(b.required) - Number(a.required) || Number(b.inRequirements) - Number(a.inRequirements) || b.count - a.count || a.term.localeCompare(b.term));

  const years = requirements.filter((r) => r.category === "years" && r.years != null && r.kind === "must").map((r) => r.years!);
  const qualification = (r: Requirement) => r.category !== "skill";
  return {
    requiredSkills,
    preferredSkills,
    technologies,
    responsibilities: responsibilitiesIn(posting.description),
    yearsRequired: years.length ? Math.max(...years) : null,
    requiredQualifications: requirements.filter((r) => r.kind === "must" && qualification(r)).map((r) => r.text),
    preferredQualifications: requirements.filter((r) => r.kind === "nice" && qualification(r)).map((r) => r.text),
    atsKeywords,
    method: "rules",
  };
}

/** Keeps only AI-read items the posting really says; adds them to the rules' reading. */
export function groundJobAnalysis(
  rules: JobAnalysis,
  ai: { requiredSkills: string[]; preferredSkills: string[]; responsibilities: string[]; requiredQualifications: string[]; preferredQualifications: string[]; keywords: string[] },
  description: string,
): JobAnalysis {
  const hay = clean(description);
  const inPosting = (s: string) => clean(s).trim().length > 1 && hay.includes(clean(s));
  const merge = (a: string[], b: string[]) => [...new Set([...a, ...b.filter(inPosting).map((s) => s.trim())])];
  const known = new Set(rules.atsKeywords.map((k) => clean(k.term)));
  const extraKeywords = ai.keywords.filter((k) => inPosting(k) && !known.has(clean(k))).slice(0, 10);
  return {
    ...rules,
    requiredSkills: merge(rules.requiredSkills, ai.requiredSkills),
    preferredSkills: merge(rules.preferredSkills, ai.preferredSkills).filter((s) => !rules.requiredSkills.includes(s)),
    responsibilities: merge(rules.responsibilities, ai.responsibilities).slice(0, 20),
    requiredQualifications: merge(rules.requiredQualifications, ai.requiredQualifications),
    preferredQualifications: merge(rules.preferredQualifications, ai.preferredQualifications),
    atsKeywords: [
      ...rules.atsKeywords,
      ...extraKeywords.map((term) => ({ term, count: Math.max(1, hay.split(clean(term)).length - 1), inRequirements: false, required: false })),
    ],
    method: "ai",
  };
}
