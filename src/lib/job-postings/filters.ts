import type { ExperienceLevel } from "./ats/types";
import { LEVELS, type Workplace } from "./levels";

/**
 * Search filters, from the URL. A filter only matches data a source actually gave: a job
 * whose workplace type or pay isn't stated never matches "Hybrid" or "Has salary" (the
 * workplace filter can include unknowns on request). Visa sponsorship isn't offered as a
 * filter: no source states it reliably.
 */

export type EmploymentKind = "full" | "part" | "contract" | "internship";
export type SourceKind = "ats" | "jobicy" | "remotive" | "arbeitnow" | "usajobs" | "adzuna" | "manual";

export type Filters = {
  workplace: Workplace[];
  includeUnknownWorkplace: boolean;
  levels: ExperienceLevel[];
  /**
   * false for the default level (from Settings): jobs that don't state a level still show,
   * only jobs at a known other level are left out. true when the user picks levels.
   */
  levelStrict: boolean;
  types: EmploymentKind[];
  hasSalary: boolean;
  /** Yearly CAD; compared with the top of the stated range. */
  minSalary: number | null;
  company: string;
  sources: SourceKind[];
  /** Also show listings whose links aren't verified yet (never with a working Apply). */
  includeUnchecked: boolean;
};

const list = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] => (v ?? "").split(",").filter((x): x is T => (allowed as readonly string[]).includes(x));

export function parseFilters(sp: Record<string, string | undefined>): Filters {
  const min = Number(sp.minpay);
  return {
    workplace: list(sp.wp, ["remote", "hybrid", "onsite"] as const),
    includeUnknownWorkplace: sp.wpu === "1",
    levels: list(sp.level, LEVELS),
    levelStrict: true,
    types: list(sp.type, ["full", "part", "contract", "internship"] as const),
    hasSalary: sp.pay === "1",
    minSalary: Number.isFinite(min) && min > 0 ? Math.min(min, 1_000_000) : null,
    company: (sp.company ?? "").trim().slice(0, 100),
    sources: list(sp.src, ["ats", "jobicy", "remotive", "arbeitnow", "usajobs", "adzuna", "manual"] as const),
    includeUnchecked: sp.unchecked === "1",
  };
}

export const activeFilterCount = (f: Filters) =>
  f.workplace.length + f.levels.length + f.types.length + Number(f.hasSalary) + Number(Boolean(f.minSalary)) + Number(Boolean(f.company)) + f.sources.length;

/** "Full-time", "full_time", "Permanent", "Contract", "Co-op" → a kind, or null when unstated. */
export function employmentKind(text: string | null | undefined): EmploymentKind | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  if (/intern|co-?op|student/.test(t)) return "internship";
  if (/contract|temporary|temp\b|fixed[- ]term|freelance/.test(t)) return "contract";
  if (/part[\s_-]?time/.test(t)) return "part";
  if (/full[\s_-]?time|permanent|regular/.test(t)) return "full";
  return null;
}

const PER_YEAR = { year: 1, month: 12, week: 52, day: 260, hour: 2080 } as const;

/** The top of a stated pay range, per year. Null when no pay was stated. */
export function annualMax(j: { salary_min: number | null; salary_max: number | null; salary_period: string | null }): number | null {
  const top = j.salary_max ?? j.salary_min;
  if (top == null) return null;
  return top * (PER_YEAR[(j.salary_period ?? "year") as keyof typeof PER_YEAR] ?? 1);
}

export type Filterable = {
  workplace_type: string | null;
  experience_level: string | null;
  employment_type: string | null;
  salary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency?: string | null;
  salary_period: string | null;
  company: string | null;
  source: string;
};

/**
 * `currency`: the searched country's currency. The minimum-pay filter compares only pay
 * stated in it (never converted); without one, it doesn't apply.
 */
export function matchesFilters(j: Filterable, f: Filters, currency: string | null = "CAD"): boolean {
  if (f.workplace.length) {
    if (!j.workplace_type) {
      if (!f.includeUnknownWorkplace) return false;
    } else if (!f.workplace.includes(j.workplace_type as Workplace)) return false;
  }
  if (f.levels.length) {
    if (!j.experience_level) {
      if (f.levelStrict) return false;
    } else if (!f.levels.includes(j.experience_level as ExperienceLevel)) return false;
  }
  if (f.types.length) {
    const kind = employmentKind(j.employment_type) ?? (j.experience_level === "internship" ? "internship" : null);
    if (!kind || !f.types.includes(kind)) return false;
  }
  if (f.hasSalary && !j.salary && j.salary_min == null && j.salary_max == null) return false;
  if (f.minSalary && currency) {
    if (j.salary_currency !== currency) return false;
    const top = annualMax(j);
    if (top === null || top < f.minSalary) return false;
  }
  if (f.company && !(j.company ?? "").toLowerCase().includes(f.company.toLowerCase())) return false;
  if (f.sources.length && !f.sources.includes(j.source as SourceKind)) return false;
  return true;
}
