import type { ExperienceLevel } from "../ats/types";
import type { Workplace } from "../levels";

/**
 * Job sources searched when the user searches (as opposed to employer boards, which the
 * crawler reads on a schedule through AtsAdapter). A provider only ever returns listings
 * it got from its source, with that source's own links; it never makes one up. One that
 * isn't configured simply isn't registered.
 */

export type SearchQuery = {
  /** Keywords, e.g. "Full Stack Developer". */
  what: string;
  /** The country searched: an ISO code ("CA"), or "*" for remote jobs open anywhere. */
  country: string;
  /** A place to search near, e.g. "Vancouver" or "Ontario"; empty for the whole country. */
  where: string | null;
  maxDaysOld: number;
  /** 1-based page of the provider's results. */
  page: number;
  /** For cursor-paged providers (Jobicy): the cursor the previous page returned; null for page 1. */
  cursor?: string | null;
};

export type ProviderOutcome = "ok" | "empty" | "timeout" | "rate_limited" | "auth" | "outage" | "malformed";

/** A listing in the shape of a `jobs` row (the app's one job model). */
/** Job boards and search APIs that list many employers' jobs, each with its own link. */
export type AggregatorSource = "adzuna" | "jobicy" | "remotive" | "arbeitnow" | "usajobs";
export const AGGREGATOR_SOURCES: readonly AggregatorSource[] = ["adzuna", "jobicy", "remotive", "arbeitnow", "usajobs"];
export const AGGREGATOR_LABELS: Record<AggregatorSource, string> = { adzuna: "Adzuna", jobicy: "Jobicy", remotive: "Remotive", arbeitnow: "Arbeitnow", usajobs: "USAJOBS" };

export type NormalizedJob = {
  source: AggregatorSource;
  provider_key: string;
  external_id: string;
  title: string;
  company: string | null;
  city: string | null;
  province: string | null;
  /** The one physical country, when there is one. */
  country: string | null;
  /** Where it can be done: country codes, region tokens, "*" (see geo/countries). */
  countries: string[];
  location_text: string | null;
  remote: boolean;
  workplace_type: Workplace | null;
  experience_level: ExperienceLevel | null;
  level_source: "provider" | "title" | null;
  posted_at: string;
  date_source: "source";
  apply_url: string;
  source_url: string;
  description: string;
  description_is_partial: boolean;
  salary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: "year" | "month" | "week" | "day" | "hour" | null;
  employment_type: string | null;
  department: string | null;
  dedupe_key: string;
  desc_fingerprint: string | null;
  verification_status: "pending_validation";
};

export type ProviderResult = {
  provider: string;
  outcome: ProviderOutcome;
  jobs: NormalizedJob[];
  /** The provider's own count of matches, when it gives one. */
  total: number | null;
  /** Results dropped because they were malformed, outside Canada or had no real link. */
  skipped: number;
  /** Cursor-paged providers: the cursor for the next page, or null when there is none. */
  nextCursor?: string | null;
};

export interface JobProvider {
  /** Stable id, stored with each job: "jobicy". */
  readonly name: string;
  /** For people: "Jobicy". */
  readonly label: string;
  /** "cursor": page N needs the cursor page N-1 returned (Jobicy). Default "page". */
  readonly paging?: "page" | "cursor";
  /** How long one search's answer is reused. Default 30 minutes. */
  readonly cacheMinutes?: number;
  searchJobs(query: SearchQuery, signal: AbortSignal): Promise<ProviderResult>;
  /** One raw result in the app's job model, or null if it's unusable. */
  normalizeJob(raw: unknown, query?: SearchQuery): NormalizedJob | null;
}

export class ProviderError extends Error {
  constructor(readonly outcome: Exclude<ProviderOutcome, "ok" | "empty">) {
    super(outcome);
  }
}
