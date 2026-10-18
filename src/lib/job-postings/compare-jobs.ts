import { LEVEL_LABELS, WORKPLACE_LABELS, type Workplace } from "./levels";
import { placeLabel, postedLabel } from "./labels";

/** Side-by-side comparison of up to three jobs. Only stored fields are shown; a missing one reads "Not stated". */

export const MAX_COMPARE = 3;
export const NOT_STATED = "Not stated";

export type CompareJob = {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  countries: string[];
  remote: boolean;
  workplace_type: string | null;
  posted_at: string;
  date_source: string;
  date_note: string | null;
  salary: string | null;
  employment_type: string | null;
  experience_level: string | null;
  source: string;
};

export type CompareFit = { tier: string; score: number; strong: string[]; missing: string[] } | null;

export type CompareColumn = {
  id: string;
  title: string;
  company: string | null;
  fit: { tier: string; score: number } | null;
  rows: Record<CompareRowKey, string>;
  strong: string[];
  missing: string[];
};

export const COMPARE_ROWS = [
  ["pay", "Pay"],
  ["level", "Level"],
  ["workplace", "Workplace"],
  ["type", "Employment type"],
  ["location", "Location"],
  ["posted", "Posted"],
  ["source", "Source"],
] as const;
export type CompareRowKey = (typeof COMPARE_ROWS)[number][0];

/** Ids from `?ids=a,b,c`: unique, uuid-shaped, at most MAX_COMPARE, in the order given. */
export function parseCompareIds(raw: string | undefined): string[] {
  const ids = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

export function buildColumn(job: CompareJob, fit: CompareFit, sourceLabel: string): CompareColumn {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    fit: fit ? { tier: fit.tier, score: fit.score } : null,
    rows: {
      pay: job.salary ?? NOT_STATED,
      level: job.experience_level ? (LEVEL_LABELS[job.experience_level as keyof typeof LEVEL_LABELS] ?? job.experience_level) : NOT_STATED,
      workplace: job.workplace_type ? (WORKPLACE_LABELS[job.workplace_type as Workplace] ?? job.workplace_type) : job.remote ? "Remote" : NOT_STATED,
      type: job.employment_type ?? NOT_STATED,
      location: placeLabel(job),
      posted: postedLabel(job),
      source: sourceLabel,
    },
    strong: fit?.strong ?? [],
    missing: fit?.missing ?? [],
  };
}
