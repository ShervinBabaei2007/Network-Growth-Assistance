import { z } from "zod";
import { countryCode, readPlace } from "@/lib/geo/countries";
import { boardHtmlToText } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel, workplaceFromText } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type JobProvider, type NormalizedJob, type ProviderResult, type SearchQuery } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

/**
 * USAJOBS, the U.S. federal government's official job site (https://developer.usajobs.gov):
 * nursing, administration, trades, science, IT and more. Optional: used only when
 * USAJOBS_API_KEY and USAJOBS_EMAIL are set (a free key, requested with that email). Its
 * terms allow showing the data, and ask to name USAJOBS as the source and link the
 * current official announcement: each job links to its announcement, exactly as given.
 *
 * - Asked only for searches in the United States (or Anywhere, for remote-eligible jobs).
 * - Filters sent: Keyword, LocationName (the place typed), DatePosted (the search window,
 *   at most 60 days), ResultsPerPage and Page.
 * - Pay is the announcement's own range, in USD per year or hour; the dates are its own.
 */

export const USAJOBS_API = "https://data.usajobs.gov/api/search";
const PER_PAGE = 50;

const s = z.string().nullish();
const Location = z.object({ LocationName: s, CountryCode: s, CountrySubDivisionCode: s, CityName: s });
const Pay = z.object({ MinimumRange: z.union([z.string(), z.number()]).nullish(), MaximumRange: z.union([z.string(), z.number()]).nullish(), RateIntervalCode: s });
const Item = z.object({
  MatchedObjectId: z.union([z.string(), z.number()]),
  MatchedObjectDescriptor: z.object({
    PositionTitle: z.string(),
    PositionURI: s,
    PositionLocation: z.array(Location).nullish(),
    OrganizationName: s,
    DepartmentName: s,
    PositionSchedule: z.array(z.object({ Name: s })).nullish(),
    PositionRemuneration: z.array(Pay).nullish(),
    PublicationStartDate: s,
    QualificationSummary: s,
    UserArea: z.object({ Details: z.object({ JobSummary: s, MajorDuties: z.array(z.string()).nullish(), RemoteIndicator: z.boolean().nullish() }).nullish() }).nullish(),
  }),
});
const Response_ = z.object({ SearchResult: z.object({ SearchResultCountAll: z.number().nullish(), SearchResultItems: z.array(z.unknown()) }) });

const PERIOD: Record<string, NonNullable<NormalizedJob["salary_period"]>> = { PA: "year", PH: "hour", PM: "month", PW: "week", PD: "day" };
const PERIOD_WORDS: Record<NonNullable<NormalizedJob["salary_period"]>, string> = { year: "per year", month: "per month", week: "per week", day: "per day", hour: "per hour" };
const text = (t: string | null | undefined) => boardHtmlToText(t ?? "").replace(/[ \t]+/g, " ").trim();

export class UsajobsProvider implements JobProvider {
  readonly name = "usajobs";
  readonly label = "USAJOBS";

  constructor(
    private readonly apiKey: string,
    private readonly email: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  normalizeJob(raw: unknown): NormalizedJob | null {
    const p = Item.safeParse(raw);
    if (!p.success) return null;
    const id = String(p.data.MatchedObjectId).trim();
    const d = p.data.MatchedObjectDescriptor;
    const title = d.PositionTitle.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!id || !title || !d.PositionURI) return null;
    const link = checkJobLink(d.PositionURI, { source: "usajobs", externalId: id }, { allowFixtureHosts: false });
    if (!link.ok) return null;
    const posted = d.PublicationStartDate && !Number.isNaN(Date.parse(d.PublicationStartDate)) ? new Date(d.PublicationStartDate).toISOString() : null;
    if (!posted) return null;
    const places = d.PositionLocation ?? [];
    const countries = [...new Set(places.map((l) => countryCode(l.CountryCode)).filter((c): c is string => Boolean(c)))];
    const remote = Boolean(d.UserArea?.Details?.RemoteIndicator) || places.some((l) => /anywhere|remote|telework/i.test(l.LocationName ?? ""));
    if (!countries.length && !remote) return null;
    const scope = countries.length ? countries : ["US"];
    const first = places[0];
    const locationText = places.length > 1 ? `${first?.LocationName ?? ""} and ${places.length - 1} more`.trim() : (first?.LocationName ?? null);
    const description = [d.UserArea?.Details?.JobSummary, ...(d.UserArea?.Details?.MajorDuties ?? []), d.QualificationSummary]
      .map((t) => text(t))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000);
    const pay = d.PositionRemuneration?.[0];
    const min = Number(pay?.MinimumRange);
    const max = Number(pay?.MaximumRange);
    const period = PERIOD[pay?.RateIntervalCode ?? ""] ?? null;
    const stated = period && (min > 0 || max > 0);
    const money = (v: number) => `US$${Math.round(v).toLocaleString("en")}`;
    const company = (d.OrganizationName ?? d.DepartmentName ?? "").trim() || null;
    const level = jobLevel(title, null);
    return {
      source: "usajobs",
      provider_key: `usajobs:${id}`.slice(0, 220),
      external_id: id.slice(0, 200),
      title,
      company: company?.slice(0, 300) ?? null,
      city: places.length === 1 ? (first?.CityName?.split(",")[0]?.trim() || null) : null,
      // USAJOBS names the state ("Washington"); the two-letter code is read from the place, or left empty.
      province: places.length === 1 && countries[0] === "US" ? readPlace({ text: first?.LocationName ?? "", country: "US" }).region : null,
      country: scope.length === 1 && places.length ? scope[0] : null,
      countries: scope,
      location_text: locationText?.slice(0, 300) ?? null,
      remote,
      workplace_type: remote ? "remote" : workplaceFromText(locationText),
      experience_level: level.level,
      level_source: level.source,
      posted_at: posted,
      date_source: "source",
      apply_url: link.url.toString(),
      source_url: link.url.toString(),
      description,
      description_is_partial: !description,
      salary: stated ? `${min > 0 && max > min ? `${money(min)}–${money(max)}` : money(max || min)} ${PERIOD_WORDS[period]}` : null,
      salary_min: stated && min > 0 ? min : null,
      salary_max: stated && max > 0 ? max : null,
      salary_currency: stated ? "USD" : null,
      salary_period: stated ? period : null,
      employment_type: d.PositionSchedule?.map((x) => x.Name).filter(Boolean).join(", ").slice(0, 120) || null,
      department: d.DepartmentName?.slice(0, 200) ?? null,
      dedupe_key: jobDedupeKey({ company, title, city: places.length === 1 ? (first?.CityName ?? null) : null, province: null, remote }),
      desc_fingerprint: description ? simhash64(description) : null,
      verification_status: "pending_validation",
    };
  }

  async searchJobs(q: SearchQuery, signal: AbortSignal): Promise<ProviderResult> {
    // Federal jobs are in the US (and some US posts abroad); for other countries there's nothing to ask.
    if (q.country !== "US" && q.country !== "*") return { provider: this.name, outcome: "empty", jobs: [], total: null, skipped: 0 };
    const params = new URLSearchParams({ Keyword: q.what.trim().slice(0, 100), ResultsPerPage: String(PER_PAGE), Page: String(Math.max(1, q.page)), DatePosted: String(Math.min(60, Math.max(1, q.maxDaysOld))) });
    if (q.where?.trim()) params.set("LocationName", q.where.trim().slice(0, 80));
    if (q.country === "*") params.set("RemoteIndicator", "True");
    let res: Response;
    try {
      res = await this.fetchImpl(`${USAJOBS_API}?${params}`, {
        signal,
        cache: "no-store",
        headers: { Host: "data.usajobs.gov", "User-Agent": this.email, "Authorization-Key": this.apiKey, Accept: "application/json" },
      });
    } catch (e) {
      throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
    if (res.status === 429) throw new ProviderError("rate_limited");
    if (!res.ok) throw new ProviderError("outage");
    const body = Response_.safeParse(await readCappedJson(res, BODY_LIMITS.feed).catch(() => null));
    if (!body.success) throw new ProviderError("malformed");
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    for (const raw of body.data.SearchResult.SearchResultItems) {
      const j = this.normalizeJob(raw);
      if (j) jobs.push(j);
      else skipped++;
    }
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total: body.data.SearchResult.SearchResultCountAll ?? null, skipped };
  }
}
