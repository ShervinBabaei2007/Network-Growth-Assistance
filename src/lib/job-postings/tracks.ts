import type { Requirement, RequirementResult } from "./types";

/**
 * Resume tracks: several base resumes ("Software", "Data", "Product"). `null` is the main resume, the one used
 * for the Jobs list and alerts; a named track is picked per job.
 */

export const MAIN_TRACK_LABEL = "Main";
export const MAX_TRACK_NAME = 40;
export const MAX_TRACKS = 6;
/** Fit scores closer than this are treated as equal when recommending. */
export const RECOMMEND_MARGIN = 5;

/** A track name as stored: single spaces, at most 40 characters; blank or "Main" means the main resume (null). */
export function normalizeTrack(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TRACK_NAME).trim();
  return name === "" || name.toLowerCase() === MAIN_TRACK_LABEL.toLowerCase() ? null : name;
}

/** A track name as an `ilike` pattern that matches it whole, ignoring case (wildcards in the name are escaped). */
export const trackPattern = (track: string) => track.replace(/[\\%_]/g, (c) => "\\" + c);

export const trackLabel = (track: string | null) => track ?? MAIN_TRACK_LABEL;
export const sameTrack = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

export type TrackFit = { track: string | null; score: number };
export type Recommendation = { track: string | null; reason: string };

/** The track whose resume fits best, and why. Null when there is only one track to choose from. */
export function recommendTrack(fits: TrackFit[]): Recommendation | null {
  if (fits.length < 2) return null;
  const sorted = [...fits].sort((a, b) => b.score - a.score || Number(a.track !== null) - Number(b.track !== null));
  const [best, next] = sorted;
  if (best.score - next.score < RECOMMEND_MARGIN) {
    const main = fits.find((f) => f.track === null);
    return { track: main ? null : best.track, reason: `Your tracks fit about equally (${best.score} and ${next.score}), so ${main ? MAIN_TRACK_LABEL : trackLabel(best.track)} is suggested.` };
  }
  return { track: best.track, reason: `${trackLabel(best.track)} fits best: ${best.score}, against ${next.score} for ${trackLabel(next.track)}.` };
}

export type Coverage = {
  mustTotal: number;
  mustMet: number;
  /** Requirements the resume doesn't show, required ones first. */
  missing: { text: string; kind: "must" | "nice" }[];
};

/** What a resume covers of a posting's requirements, from the stored fit results. Nothing is added or guessed. */
export function requirementCoverage(requirements: Requirement[], results: RequirementResult[]): Coverage {
  const byId = new Map(results.map((r) => [r.requirementId, r.status]));
  const must = requirements.filter((r) => r.kind === "must");
  const missing = requirements
    .filter((r) => (byId.get(r.id) ?? "missing") === "missing")
    .map((r) => ({ text: r.text, kind: r.kind }))
    .sort((a, b) => Number(b.kind === "must") - Number(a.kind === "must"));
  return { mustTotal: must.length, mustMet: must.filter((r) => byId.get(r.id) === "met").length, missing };
}

/** The reminder shown beside anything the check says is missing. */
export const DO_NOT_ADD_NOTE = "Add it only if you genuinely have that experience.";
