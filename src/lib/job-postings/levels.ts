import type { ExperienceLevel } from "./ats/types";
import type { Seniority } from "./types";

/**
 * Experience level and workplace type, for filters and job cards. A source's own
 * structured field wins; otherwise the level is read from the job title and labelled
 * "from title" in the UI. Nothing is guessed when the title doesn't say.
 */

export const LEVELS: readonly ExperienceLevel[] = ["internship", "new_grad", "entry", "junior", "mid", "senior"];

export const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  internship: "Internship / co-op",
  new_grad: "New grad",
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
};

// Order matters: "Senior Software Engineer Intern" is an internship.
const TITLE_RULES: [RegExp, ExperienceLevel][] = [
  [/\b(intern|internship|co-?op|work term|summer student)\b/i, "internship"],
  [/\b(new grads?|new graduates?|recent graduates?|university graduates?|graduate (program|developer|engineer|analyst))\b/i, "new_grad"],
  [/\b(senior|sr\.?|staff|principal|lead|architect|manager|director|head of|iii|iv)\b/i, "senior"],
  [/\b(junior|jr\.?)\b/i, "junior"],
  [/\b(entry[- ]level|associate)\b/i, "entry"],
  [/\b(intermediate|mid[- ]?level|ii)\b/i, "mid"],
];

export function levelFromTitle(title: string): ExperienceLevel | null {
  return TITLE_RULES.find(([re]) => re.test(title))?.[1] ?? null;
}

/** The level to store: the source's own when it gives one, else the title's, else unknown. */
export function jobLevel(title: string, provided: ExperienceLevel | null | undefined): { level: ExperienceLevel | null; source: "provider" | "title" | null } {
  if (provided) return { level: provided, source: "provider" };
  const fromTitle = levelFromTitle(title);
  return { level: fromTitle, source: fromTitle ? "title" : null };
}

export type Workplace = "remote" | "hybrid" | "onsite";

/** Workplace type from what the posting's place and title say. Unknown stays null. */
export function workplaceFromText(...texts: (string | null | undefined)[]): Workplace | null {
  const t = texts.filter(Boolean).join(" ");
  if (/\bhybrid\b/i.test(t)) return "hybrid";
  if (/\bremote\b/i.test(t)) return "remote";
  if (/\b(on-?site|in[- ]office|in[- ]person)\b/i.test(t)) return "onsite";
  return null;
}

export const WORKPLACE_LABELS: Record<Workplace, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/** The levels that suit a seniority chosen in Settings, for the default level filter. */
export const SENIORITY_LEVELS: Record<Seniority, ExperienceLevel[]> = {
  intern: ["internship"],
  new_grad: ["new_grad", "entry", "junior"],
  junior: ["entry", "junior"],
  intermediate: ["junior", "mid"],
  senior: ["mid", "senior"],
};
