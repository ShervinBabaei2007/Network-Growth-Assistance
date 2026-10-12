import { htmlToText } from "@/lib/discovery/fetch-page";
import { readPlace, scopeFor } from "@/lib/geo/countries";
import { byPriority } from "../regions";

/**
 * Employers' public job boards. Each ATS publishes an unauthenticated JSON API that
 * powers the employer's own careers page; the crawler reads it, never the job sites.
 */

export type AtsKind = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "recruitee" | "fixture";

/** A place as the board describes it. Structured fields when the ATS has them. */
export type AtsPlace = { text: string; city?: string | null; region?: string | null; country?: string | null };

export type AtsJob = {
  externalId: string;
  title: string;
  company: string | null;
  places: AtsPlace[];
  remote: boolean;
  /** When the employer published it. Null when the board doesn't say. */
  postedAt: string | null;
  /** "day" for boards that give a date without a time. */
  precision: "time" | "day";
  /** "created": the board's date is when the posting was created, not published (Lever). */
  dateNote?: "created" | null;
  /**
   * The posting's own link, exactly as the board gives it. Null when the board's list
   * doesn't include one (it may come from fetchDetail). Never built from a URL pattern.
   */
  applyUrl: string | null;
  /** Plain text. Null when it must be fetched separately (see fetchDetail). */
  description: string | null;
  salary: string | null;
  employmentType: string | null;
  department: string | null;
  /** Only when the board states it in a structured field. */
  workplace?: "remote" | "hybrid" | "onsite" | null;
  /** Structured pay, only when the board gives numbers (never an estimate). */
  salaryRange?: SalaryRange | null;
  /** The board's own experience level, when it has one. */
  level?: ExperienceLevel | null;
};

export type SalaryRange = { min: number | null; max: number | null; currency: string | null; period: "year" | "month" | "week" | "day" | "hour" | null };
export type ExperienceLevel = "internship" | "new_grad" | "entry" | "junior" | "mid" | "senior";

/** What a posting's own page adds to the list: its description and, for some boards, its link. */
export type JobDetail = { description: string | null; applyUrl?: string | null };

/**
 * `partial`: the board stopped listing before the end (a page cap), so jobs missing from
 * this read may still be open and must not be closed.
 */
export type BoardResult = { notModified: true } | { notModified: false; etag: string | null; jobs: AtsJob[]; partial?: boolean };

export class BoardError extends Error {
  constructor(
    message: string,
    /** The board doesn't exist (404): stop crawling it sooner. */
    readonly gone = false,
  ) {
    super(message);
  }
}

/** The board asked us to slow down. Not a failure of the board: try again after the wait. */
export class RateLimitedError extends BoardError {
  constructor(readonly retryAfterSeconds: number | null) {
    super("The board is rate-limiting us.");
  }
}

/** Seconds from a Retry-After header (delta-seconds or an HTTP date), capped at a day. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = /^\d+$/.test(header.trim()) ? Number(header.trim()) : (Date.parse(header) - now) / 1000;
  return Number.isFinite(secs) && secs >= 0 ? Math.min(Math.ceil(secs), 24 * 3600) : null;
}

export interface AtsAdapter {
  readonly kind: AtsKind;
  readonly label: string;
  /** The board's public page, for probing and for people. Never used as a job's link. */
  boardUrl(token: string): string;
  /** `countries`: ISO codes users search, for boards that can filter by country themselves (SmartRecruiters). */
  fetchBoard(token: string, opts: { etag?: string | null; signal?: AbortSignal; countries?: readonly string[] }): Promise<BoardResult>;
  /** The description (and for some boards the link), when the list omits them. Only called for jobs that are kept and need it. */
  fetchDetail?(token: string, externalId: string, opts: { signal?: AbortSignal }): Promise<JobDetail | null>;
}

export const USER_AGENT = "NetworkGrowthAssistant/1.0 (+personal job search; reads public job-board APIs)";

/** GET a board's JSON with the crawler's user agent, honouring ETags. */
export async function getJson(url: string, opts: { etag?: string | null; signal?: AbortSignal; method?: string }): Promise<{ notModified: true } | { notModified: false; etag: string | null; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(opts.etag ? { "If-None-Match": opts.etag } : {}) },
      signal: opts.signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    throw new BoardError("Couldn't reach the board.");
  }
  if (res.status === 304) return { notModified: true };
  if (res.status === 404) throw new BoardError("The board wasn't found.", true);
  if (res.status === 429) throw new RateLimitedError(retryAfterSeconds(res.headers.get("retry-after")));
  if (!res.ok) throw new BoardError(`The board returned ${res.status}.`);
  const body = await res.json().catch(() => {
    throw new BoardError("The board sent something that isn't JSON.");
  });
  return { notModified: false, etag: res.headers.get("etag"), body };
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

/** Some boards send HTML with its markup escaped ("&lt;p&gt;"); unescape it once first. */
export function boardHtmlToText(html: string | null | undefined, { escaped = false } = {}): string {
  if (!html) return "";
  const source = escaped ? html.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, e: string) => ENTITY[e]) : html;
  // List items keep a bullet so requirement lists stay recognisable as lists.
  return htmlToText(`<body>${source.replace(/<li\b[^>]*>/gi, (tag) => `${tag}• `)}</body>`, "https://example.invalid/").text;
}

export type JobPlace = {
  /** Every country, region or "*" the job's places cover (see geo/countries). */
  countries: string[];
  /** The physical country of the place shown, when there is one. */
  country: string | null;
  /** Canadian province or US state of the place shown. */
  province: string | null;
  city: string | null;
  locationText: string;
  remote: boolean;
};

/**
 * Where a job can be done, or null if none of its places is in a country someone
 * searches (`wanted`: tokens from scopeFor). A structured country wins over text; a place
 * we can't read is skipped, and "Remote" alone (no country) is never assumed to be
 * anywhere. Of several wanted places, a Canadian one in the highest-priority province is
 * shown first (BC, then ON…), otherwise the first.
 */
export function jobPlace(places: AtsPlace[], remote: boolean, wanted: ReadonlySet<string>): JobPlace | null {
  const all = new Set<string>();
  const found: Omit<JobPlace, "countries">[] = [];
  for (const p of places) {
    const parts = splitPlaces(p.text);
    const candidates: AtsPlace[] = parts.length > 1 && !p.country ? parts.map((text) => ({ text })) : [p];
    for (const c of candidates) {
      const read = readPlace(c);
      if (!read.scope.length) continue;
      read.scope.forEach((x) => all.add(x));
      if (!read.scope.some((x) => wanted.has(x))) continue;
      // Show the board's own wording for the whole place, not a fragment of it.
      found.push({ country: read.country, province: read.region, city: read.city, locationText: p.text.trim().slice(0, 300), remote: remote || /\bremote\b/i.test(c.text) });
    }
  }
  if (!found.length) return null;
  const order = byPriority(found.filter((f) => f.country === "CA").map((f) => f.province ?? ""));
  const shown = found.find((f) => f.country === "CA" && f.province && f.province === order[0]) ?? found[0];
  return { ...shown, countries: [...all].sort() };
}

export type CanadianPlace = { province: string | null; city: string | null; locationText: string; remote: boolean };
const CANADA_SCOPE = new Set(["CA"]);

/** Where in Canada a job is, or null if nowhere (jobPlace for Canada only). */
export function canadianPlace(places: AtsPlace[], remote: boolean): CanadianPlace | null {
  const p = jobPlace(places, remote, CANADA_SCOPE);
  return p ? { province: p.province, city: p.city, locationText: p.locationText, remote: p.remote } : null;
}

/** The tokens a job's scope must overlap to be stored, for the countries users search. */
export const wantedScope = (countries: Iterable<string>): Set<string> => new Set([...countries].flatMap((c) => scopeFor(c)));

/**
 * "New York; Toronto, ON" → two places. Separators inside parentheses are left alone,
 * so "Toronto, ON (Remote / Canada)" stays one place. "/" splits only with spaces around it.
 */
export function splitPlaces(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    const rest = text.slice(i);
    const sep = depth === 0 ? (/^[;|]/.test(rest) ? 1 : /^\s\/\s/.test(rest) ? 3 : /^\sor\s/i.test(rest) ? 4 : 0) : 0;
    if (sep) {
      out.push(current);
      current = "";
      i += sep - 1;
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}
