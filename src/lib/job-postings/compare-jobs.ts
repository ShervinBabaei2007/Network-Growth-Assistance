import { LEVEL_LABELS, WORKPLACE_LABELS, type Workplace } from "./levels";
import { placeLabel, postedLabel } from "./labels";
import type { Locale, Translator } from "@/lib/i18n/core";

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

export function buildColumn(job: CompareJob, fit: CompareFit, sourceLabel: string, opts: { t?: Translator; locale?: Locale } = {}): CompareColumn {
  const { t, locale } = opts;
  const notStated = t ? t("compare.notStated") : NOT_STATED;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    fit: fit ? { tier: fit.tier, score: fit.score } : null,
    rows: {
      pay: job.salary ?? notStated,
      level: job.experience_level ? (t ? t(`level.${job.experience_level}` as "level.junior") : (LEVEL_LABELS[job.experience_level as keyof typeof LEVEL_LABELS] ?? job.experience_level)) : notStated,
      workplace: job.workplace_type ? (t ? t(`workplace.${job.workplace_type}` as "workplace.remote") : (WORKPLACE_LABELS[job.workplace_type as Workplace] ?? job.workplace_type)) : job.remote ? (t ? t("workplace.remote") : "Remote") : notStated,
      type: job.employment_type ?? notStated,
      location: placeLabel(job, locale),
      posted: postedLabel(job, undefined, locale),
      source: sourceLabel,
    },
    strong: fit?.strong ?? [],
    missing: fit?.missing ?? [],
  };
}
