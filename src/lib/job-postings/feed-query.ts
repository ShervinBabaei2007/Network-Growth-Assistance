import { z } from "zod";
import { ANYWHERE, countryName, currencyOf, isCountryCode } from "@/lib/geo/countries";
import { parseRange, type Range } from "./feed";
import { parseFilters, type Filters } from "./filters";
import { SENIORITY_LEVELS } from "./levels";
import { byPriority } from "./regions";
import { PROVINCE_CODES, PROVINCE_NAMES, type ProvinceCode, type Seniority } from "./types";

/**
 * A Jobs search, as the URL describes it. The Jobs page and saved-search alerts both read
 * searches through here, so the same search means the same thing in both places.
 *
 * Stored as `{ v, params }`: `params` holds only the known keys, as strings, exactly as they
 * appear in the URL. `level` is special: absent means "my level from Settings", present
 * (even empty) means the levels chosen. Bump `v` if the meaning of a key ever changes.
 */

export const FEED_TABS = ["all", "fit", "stretch", "excluded", "saved"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

/** Keys a search can use. tab and page are views of the results, not part of the search. */
export const SEARCH_KEYS = ["q", "where", "all", "range", "level", "country", "prov", "wp", "wpu", "type", "pay", "minpay", "company", "src", "unchecked"] as const;
const VIEW_KEYS = ["tab", "page"] as const;
const KEYS = [...SEARCH_KEYS, ...VIEW_KEYS] as const;
type Key = (typeof KEYS)[number];

export const FEED_QUERY_VERSION = 1;

export const FeedQuery = z.object({
  v: z.literal(FEED_QUERY_VERSION),
  params: z.partialRecord(z.enum(KEYS), z.string().max(200)),
});
export type FeedQuery = z.infer<typeof FeedQuery>;

/** From the page's search params. Repeated params (level=a&level=b) are joined with commas. */
export function fromSearchParams(raw: Record<string, string | string[] | undefined>): FeedQuery {
  const params: FeedQuery["params"] = {};
  for (const k of KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    params[k] = (Array.isArray(v) ? v.join(",") : v).slice(0, 200);
  }
  return { v: FEED_QUERY_VERSION, params };
}

/** The search part only (no tab or page), for saving. */
export function searchOnly(query: FeedQuery): FeedQuery {
  const params: FeedQuery["params"] = {};
  for (const k of SEARCH_KEYS) if (query.params[k] !== undefined) params[k] = query.params[k];
  return { v: query.v, params };
}

/** Back to a Jobs URL, e.g. to open a saved search. */
export function toSearchParams(query: FeedQuery): URLSearchParams {
  const s = new URLSearchParams();
  for (const k of KEYS) {
    const v = query.params[k];
    if (v === undefined) continue;
    if (v === "" && k !== "level") continue;
    s.set(k, v);
  }
  return s;
}

export type FeedSettings = {
  job_titles: string[];
  job_country: string;
  job_provinces: string[];
  job_seniority: string;
  job_exclude_keywords: string[];
};

export type ResolvedFeed = {
  q: string;
  where: string;
  allTitles: boolean;
  /** The titles searched: the query, else (unless "all") the saved titles. */
  searched: string[];
  explicitRange: Range | null;
  levelChosen: boolean;
  filters: Filters;
  tab: FeedTab;
  page: number;
  askedCountry: string;
  country: string;
  inCanada: boolean;
  currency: string | null;
  provinces: ProvinceCode[];
  whereProvince: ProvinceCode | null;
  provFilter: ProvinceCode[];
  shownProvinces: ProvinceCode[];
  placeName: string;
};

/** A province named in the "where" box ("BC", "Ontario"), if any. */
function provinceIn(where: string): ProvinceCode | null {
  const w = where.trim().toLowerCase();
  if (!w) return null;
  return PROVINCE_CODES.find((p) => p.toLowerCase() === w || PROVINCE_NAMES[p].toLowerCase() === w) ?? null;
}

/** What a search means for this user: their settings fill in what the search leaves open. */
export function resolveFeed(query: FeedQuery, settings: FeedSettings): ResolvedFeed {
  const p = query.params;
  const get = (k: Key) => p[k] ?? "";
  const q = get("q").trim().slice(0, 120);
  const where = get("where").trim().slice(0, 80);
  const allTitles = get("all") === "1";
  const searched = q ? [q] : allTitles ? [] : settings.job_titles;
  const explicitRange = parseRange(get("range"));
  // The user's level setting is the default level filter until they choose levels (or none) themselves.
  const levelChosen = p.level !== undefined;
  const parsed = parseFilters(Object.fromEntries(KEYS.map((k) => [k, get(k)])));
  const filters: Filters = levelChosen ? parsed : { ...parsed, levels: SENIORITY_LEVELS[settings.job_seniority as Seniority], levelStrict: false };
  const tab = (FEED_TABS as readonly string[]).includes(get("tab")) ? (get("tab") as FeedTab) : "all";
  const page = Math.max(1, Number(get("page")) || 1);
  // One country at a time: the one asked for, else the user's own ("*" = remote jobs open anywhere).
  const askedCountry = get("country").trim().toUpperCase();
  const country = askedCountry === ANYWHERE || isCountryCode(askedCountry) ? askedCountry : settings.job_country;
  const inCanada = country === "CA";
  const provinces = byPriority(settings.job_provinces);
  const whereProvince = inCanada ? provinceIn(where) : null;
  const provFilter = !inCanada ? [] : whereProvince ? [whereProvince] : get("prov").split(",").filter((x): x is ProvinceCode => (PROVINCE_CODES as readonly string[]).includes(x));
  const shownProvinces = provFilter.length ? provFilter : provinces;
  const placeName = country === ANYWHERE ? "remote jobs open anywhere" : inCanada ? shownProvinces.map((x) => PROVINCE_NAMES[x]).join(", ") : (countryName(country) ?? country);
  return { q, where, allTitles, searched, explicitRange, levelChosen, filters, tab, page, askedCountry, country, inCanada, currency: currencyOf(country), provinces, whereProvince, provFilter, shownProvinces, placeName };
}

/** A short description of a search, for its default name and for alert titles. */
export function describeSearch(query: FeedQuery, settings: FeedSettings): string {
  const r = resolveFeed(query, settings);
  const what = r.searched.length ? r.searched.slice(0, 2).join(", ") : "Any title";
  return `${what} · ${r.placeName}${r.where && !r.whereProvince ? ` near ${r.where}` : ""}`.slice(0, 120);
}
