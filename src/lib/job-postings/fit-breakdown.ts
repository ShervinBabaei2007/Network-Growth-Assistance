import { explainFit, type FitExplanation } from "./fit";
import type { Requirement, RequirementResult } from "./types";

/**
 * A glanceable version of the fit: one bar per area of the posting, computed from the same requirement results as
 * the score and the "Matches / Missing" sentence. Each row's lists come from `explainFit` run on that row's
 * requirements, so the bars and the text cannot disagree. Pure, so it is unit-tested.
 */

export type DimensionKey = "skills" | "level" | "eligibility";

const DIMENSION_OF: Record<Requirement["category"], DimensionKey> = {
  skill: "skills",
  language: "skills",
  licence: "skills",
  other: "skills",
  years: "level",
  degree: "level",
  location: "eligibility",
  authorization: "eligibility",
  clearance: "eligibility",
};

export const DIMENSION_LABEL: Record<DimensionKey, string> = { skills: "Skills", level: "Experience and education", eligibility: "Location and eligibility" };
const ORDER: DimensionKey[] = ["skills", "level", "eligibility"];

export type BreakdownRow = FitExplanation & {
  key: DimensionKey;
  label: string;
  met: number;
  partial: number;
  missingCount: number;
  total: number;
  /** 0 to 100: met counts fully, partly met counts half. */
  percent: number;
};

export function fitBreakdown(requirements: Requirement[], results: RequirementResult[], skillNames: (text: string) => string[]): BreakdownRow[] {
  const byId = new Map(results.map((r) => [r.requirementId, r.status]));
  const rows: BreakdownRow[] = [];
  for (const key of ORDER) {
    const reqs = requirements.filter((r) => DIMENSION_OF[r.category] === key);
    if (reqs.length === 0) continue;
    const statuses = reqs.map((r) => byId.get(r.id) ?? "missing");
    const met = statuses.filter((s) => s === "met").length;
    const partial = statuses.filter((s) => s === "partial").length;
    rows.push({
      key,
      label: DIMENSION_LABEL[key],
      met,
      partial,
      missingCount: statuses.length - met - partial,
      total: statuses.length,
      percent: Math.round(((met + partial * 0.5) / statuses.length) * 100),
      ...explainFit(reqs, results, skillNames),
    });
  }
  return rows;
}

// ------------------------------------------------------------------ pay

const PER_YEAR = { year: 1, month: 12, week: 52, day: 260, hour: 2080 } as const;
const yearly = (n: number, period: string | null) => n * (PER_YEAR[(period ?? "year") as keyof typeof PER_YEAR] ?? 1);

export type PayBar = {
  /** Annual low and high of the stated range (equal when only one number was given). */
  low: number;
  high: number;
  currency: string | null;
  /** Where the bar's filled part starts and ends, 0 to 100 on a shared scale. */
  from: number;
  to: number;
  /** Where the person's minimum sits on that scale, or null when they have not set one in this currency. */
  minMarker: number | null;
  /** Whether the top of the range reaches the minimum; null when there is no minimum to compare. */
  meetsMinimum: boolean | null;
};

/**
 * The posting's stated pay as a range bar against the person's own minimum. Nothing is estimated: a posting with no
 * stated pay has no bar, and a minimum is compared only when the posting states pay in the searched currency.
 */
export function payBar(
  pay: { salary_min: number | null; salary_max: number | null; salary_period: string | null; salary_currency: string | null },
  minimum: number | null,
  currency: string | null,
): PayBar | null {
  const a = pay.salary_min ?? pay.salary_max;
  const b = pay.salary_max ?? pay.salary_min;
  if (a == null || b == null) return null;
  const low = Math.min(yearly(a, pay.salary_period), yearly(b, pay.salary_period));
  const high = Math.max(yearly(a, pay.salary_period), yearly(b, pay.salary_period));
  const comparable = minimum != null && minimum > 0 && (currency === null || pay.salary_currency === currency);
  const min = comparable ? minimum : null;
  // One scale for the bar and the marker: from zero to a little past whichever is larger.
  const scale = Math.max(high, min ?? 0) * 1.1 || 1;
  const pct = (n: number) => Math.min(100, Math.max(0, (n / scale) * 100));
  return {
    low,
    high,
    currency: pay.salary_currency,
    from: pct(low),
    to: Math.max(pct(high), pct(low) + 1),
    minMarker: min === null ? null : pct(min),
    meetsMinimum: min === null ? null : high >= min,
  };
}
