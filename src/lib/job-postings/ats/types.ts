import { classifyCountry, provinceOf } from "@/lib/discovery/location";
import { htmlToText } from "@/lib/discovery/fetch-page";
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
  applyUrl: string;
  /** Plain text. Null when it must be fetched separately (see fetchDetail). */
  description: string | null;
  salary: string | null;
  employmentType: string | null;
  department: string | null;
};

export type BoardResult = { notModified: true } | { notModified: false; etag: string | null; jobs: AtsJob[] };

export class BoardError extends Error {
  constructor(
    message: string,
    /** The board doesn't exist (404): stop crawling it sooner. */
    readonly gone = false,
  ) {
    super(message);
  }
}

export interface AtsAdapter {
  readonly kind: AtsKind;
  readonly label: string;
  /** The board's public URL, for people. */
  boardUrl(token: string): string;
  fetchBoard(token: string, opts: { etag?: string | null; signal?: AbortSignal }): Promise<BoardResult>;
  /** The description, for boards whose list omits it. Only called for new Canadian jobs. */
  fetchDetail?(token: string, externalId: string, opts: { signal?: AbortSignal }): Promise<string | null>;
}

export const USER_AGENT = "NetworkGrowthAssistant/1.0 (+job search for Canadians; reads public job-board APIs)";

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
  if (res.status === 429) throw new BoardError("The board is rate-limiting us.");
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

const CANADA = /^(ca|can|canada)$/i;

export type CanadianPlace = { province: string | null; city: string | null; locationText: string; remote: boolean };

/**
 * Where in Canada a job is, or null if nowhere. A structured country wins over text.
 * A job listed in several places takes the highest-priority province (BC, then ON…).
 * "Remote" counts only when the place says Canada.
 */
export function canadianPlace(places: AtsPlace[], remote: boolean): CanadianPlace | null {
  const found: CanadianPlace[] = [];
  for (const p of places) {
    const parts = splitPlaces(p.text);
    const candidates: AtsPlace[] = parts.length > 1 && !p.country ? parts.map((text) => ({ text })) : [p];
    for (const c of candidates) {
      const country = c.country?.trim();
      if (country && !CANADA.test(country)) continue;
      const whole = [c.city, c.region, c.text].filter(Boolean).join(", ");
      const isCanada = (country && CANADA.test(country)) || classifyCountry(whole) === "canada" || provinceOf(c.region, c.city, c.text) !== null;
      if (!isCanada) continue;
      const placeRemote = remote || /\bremote\b/i.test(c.text);
      // Show the board's own wording for the whole place, not a fragment of it.
      found.push({ province: provinceOf(c.region, c.city, c.text), city: c.city?.trim() || cityFrom(c.text), locationText: p.text.trim().slice(0, 300), remote: placeRemote });
    }
  }
  if (!found.length) return null;
  const order = byPriority(found.map((f) => f.province ?? ""));
  return found.find((f) => f.province === order[0]) ?? found[0];
}

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

function cityFrom(text: string): string | null {
  const first = text.split(",")[0]?.replace(/\bremote\b|[-–()]/gi, " ").trim();
  return first && first.length <= 60 && !/canada/i.test(first) ? first : null;
}
