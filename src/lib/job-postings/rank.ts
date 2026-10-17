import { titleSimilarity } from "./feed";

/**
 * Orders search results, deterministically, by what matters to the person searching.
 * Each part is 0–1, weighted (out of 100):
 *
 * - fit with the resume (skills, experience, projects, education, level; from scoreFit) 40
 * - title similarity to what was searched 25
 * - recency 15
 * - location preference 10
 * - source quality (a verified link from the employer's own board first) 10
 *
 * A posting the user doesn't qualify for gets no fit credit. With no resume, fit is the
 * cheap prefilter estimate, scaled down.
 */

export const RANK_WEIGHTS = { fit: 40, title: 25, recency: 15, location: 10, source: 10 } as const;

export type Rankable = {
  title: string;
  posted_at: string;
  date_source: string;
  province: string | null;
  /** The job's physical country, when it has one. */
  country?: string | null;
  remote: boolean;
  source: string;
  verification_status: string;
};

export type RankContext = {
  searched: string[];
  /** The user's provinces when searching Canada (empty: all of Canada). */
  provinces: string[];
  /** The country searched ("*" for remote anywhere). Default Canada. */
  country?: string;
  now?: number;
};

export function recencyScore(postedAt: string, dateSource: string, now = Date.now()): number {
  const hours = (now - Date.parse(postedAt)) / 3600_000;
  const base = hours <= 24 ? 1 : hours <= 72 ? 0.8 : hours <= 168 ? 0.6 : hours <= 336 ? 0.4 : hours <= 720 ? 0.2 : 0;
  // A "first seen" time is when we noticed it, not when it was posted: trusted a little less.
  return dateSource === "source" ? base : base * 0.8;
}

/**
 * In Canada, a job in one of the user's provinces (or anywhere in Canada when they chose
 * none), all alike. Elsewhere, a job in the searched country first. Remote jobs open to it next.
 */
export function locationScore(j: Pick<Rankable, "province" | "remote" | "country">, provinces: string[], country = "CA"): number {
  if (country === "CA") {
    if (j.province && (provinces.length === 0 || provinces.includes(j.province))) return 1;
  } else if (j.country === country && !j.remote) return 1;
  if (j.remote) return 0.8;
  return 0.3;
}

export function sourceScore(j: Pick<Rankable, "source" | "verification_status">): number {
  if (j.verification_status !== "verified") return 0.3;
  return j.source === "ats" ? 1 : 0.8;
}

export function rankScore(j: Rankable, fit: { score: number; tier: string } | null, prefilter: number | null, ctx: RankContext): number {
  const fitPart = fit ? (fit.tier === "excluded" ? 0 : fit.score / 100) : prefilter !== null ? Math.max(0, Math.min(1, prefilter / 100)) * 0.6 : 0.3;
  const parts = {
    fit: fitPart,
    title: titleSimilarity(j.title, ctx.searched),
    recency: recencyScore(j.posted_at, j.date_source, ctx.now),
    location: locationScore(j, ctx.provinces, ctx.country),
    source: sourceScore(j),
  };
  return Math.round((Object.keys(RANK_WEIGHTS) as (keyof typeof RANK_WEIGHTS)[]).reduce((s, k) => s + parts[k] * RANK_WEIGHTS[k], 0) * 10) / 10;
}
