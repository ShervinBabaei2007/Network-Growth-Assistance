import { z } from "zod";
import { ANYWHERE, readPlace, regionsOf } from "@/lib/geo/countries";
import { boardHtmlToText, type ExperienceLevel } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type JobProvider, type NormalizedJob, type ProviderResult, type SearchQuery } from "./types";

/**
 * Jobicy's free public jobs API (https://jobicy.com/jobs-rss-feed): remote jobs from many
 * employers and fields (design, marketing, support, finance, healthcare, engineering…),
 * no key. Its terms ask that Jobicy is credited as the source, that every link goes to the
 * Jobicy URL in the feed, and that automated passes start at most once an hour, so each
 * search's answer is reused for an hour.
 *
 * - Every Jobicy job is remote (that's what Jobicy lists); it has no city.
 * - Filters sent: geo (the searched country's Jobicy location, or its world region when
 *   Jobicy has none, e.g. India → APAC), tag = the search words, count, and industry when
 *   the search clearly names a field ("UX designer" → Web, UI & UX Design). If a search
 *   with an industry finds nothing, it's asked once more without it. Jobicy has no date
 *   or city filter: the app filters stored jobs by date itself.
 * - Where a job can be done comes from Jobicy's own jobGeo ("Canada, USA", "EMEA",
 *   "Anywhere"); when it gives none, it's the place that was searched (Jobicy matched it).
 * - Pages are cursor-based (nextCursor); page N needs the cursor page N-1 returned.
 * - Links are the `url` field, exactly as given, on jobicy.com. Nothing is built from the id.
 * - Pay is shown only when Jobicy states it, in its own currency.
 * - New results start "not yet verified"; the status endpoint and a link check verify them.
 */

const s = z.string().nullish();
const JobicyJob = z.object({
  id: z.union([z.number(), z.string()]),
  url: s,
  jobTitle: z.string(),
  companyName: s,
  jobIndustry: z.array(z.string()).nullish(),
  jobType: z.union([z.array(z.string()), z.string()]).nullish(),
  jobGeo: s,
  jobLevel: s,
  jobExcerpt: s,
  jobDescription: s,
  pubDate: s,
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: s,
  salaryPeriod: s,
});
const JobicyResponse = z.object({ jobs: z.array(z.unknown()), nextCursor: z.string().nullish(), hasMore: z.boolean().nullish() });
const JobicyStatus = z.object({ jobs: z.array(z.object({ id: z.union([z.number(), z.string()]), status: z.string() })) });

export const JOBICY_API = "https://jobicy.com/api/v2/remote-jobs";
const PER_PAGE = 50;

/** Jobicy's location slugs (https://jobicy.com/api/v2/remote-jobs?get=locations), by country code. */
const GEO: Record<string, string> = {
  AR: "argentina", AU: "australia", AT: "austria", BE: "belgium", BR: "brazil", BG: "bulgaria", CA: "canada", CN: "china",
  CR: "costa-rica", HR: "croatia", CY: "cyprus", CZ: "czechia", DK: "denmark", EE: "estonia", FI: "finland", FR: "france",
  DE: "germany", GR: "greece", HK: "hong-kong", HU: "hungary", IE: "ireland", IL: "israel", IT: "italy", JP: "japan",
  LV: "latvia", LT: "lithuania", MY: "malaysia", MX: "mexico", NL: "netherlands", NZ: "new-zealand", NO: "norway",
  PH: "philippines", PL: "poland", PT: "portugal", RO: "romania", RS: "serbia", SG: "singapore", SK: "slovakia",
  SI: "slovenia", KR: "south-korea", ES: "spain", SE: "sweden", CH: "switzerland", TH: "thailand", TR: "turkiye",
  AE: "united-arab-emirates", GB: "uk", UA: "ukraine", US: "usa", VN: "vietnam",
};
/** Jobicy's region slugs, most specific first. */
const GEO_REGIONS: [string, string][] = [
  ["europe", "europe"],
  ["latam", "latam"],
  ["apac", "apac"],
  ["emea", "emea"],
];

/** The Jobicy location to ask for a country: its own, else its region, else anywhere. */
export function jobicyGeo(country: string): string {
  if (country === ANYWHERE) return "anywhere";
  if (GEO[country]) return GEO[country];
  const regions = regionsOf(country);
  return GEO_REGIONS.find(([token]) => regions.includes(token))?.[1] ?? "anywhere";
}

/** Jobicy's industry slugs (…?get=industries), when the search words clearly name one. */
const INDUSTRIES: [RegExp, string][] = [
  [/\b(ux|ui|user experience|user interface|product design(er)?|interaction design|web design(er)?)\b/i, "web-app-design"],
  [/\b(graphic|visual|motion|video|creative|illustrat|brand design|multimedia|animator)/i, "design-multimedia"],
  [/\b(seo)\b/i, "seo"],
  [/\b(marketing|growth|social media|brand manager|communications|pr specialist)\b/i, "marketing"],
  [/\b(sales|account executive|business development rep|sdr|bdr|account manager)\b/i, "seller"],
  [/\b(technical support|it support|help ?desk|service desk)\b/i, "technical-support"],
  [/\b(customer (support|service|success|experience)|support (agent|specialist|representative)|call cent(er|re))\b/i, "supporting"],
  [/\b(account(ant|ing)\b|bookkeep|finance\b|financial analyst|payroll|controller|auditor|tax\b)/i, "accounting-finance"],
  [/\b(hr|human resources|recruit(er|ing)|talent acquisition|people (partner|ops))\b/i, "hr"],
  [/\b(legal|lawyer|paralegal|counsel|compliance)\b/i, "legal"],
  [/\b(nurse|nursing|medical|clinical|healthcare|health care|physician|therapist|pharmac)/i, "healthcare"],
  [/\b(teacher|tutor|instructor|education|curriculum|e-?learning)\b/i, "education"],
  [/\b(writer|copywriter|editor|content|journalist|translator)\b/i, "copywriting"],
  [/\b(virtual assistant|administrative|admin assistant|executive assistant|office (assistant|manager)|data entry|receptionist)\b/i, "admin-support"],
  [/\b(project manager|program manager|scrum master)\b/i, "project-management"],
  [/\b(product manager|operations (manager|specialist|associate))\b/i, "management"],
  [/\b(data scien|data analy|machine learning|analytics)/i, "data-science"],
  [/\b(qa|quality assurance|tester|test engineer)\b/i, "qa-testing"],
  [/\b(security|cyber|soc analyst|penetration)\b/i, "cybersecurity"],
  [/\b(devops|sre|site reliability|infrastructure|cloud engineer|sysadmin)\b/i, "admin"],
  [/\b(software|developer|programmer|front ?end|back ?end|full ?stack|engineer)\b/i, "engineering"],
];
export const jobicyIndustry = (what: string): string | null => INDUSTRIES.find(([re]) => re.test(what))?.[1] ?? null;

const text = (t: string | null | undefined) => boardHtmlToText(t ?? "").replace(/[ \t]+/g, " ").trim();
const oneLine = (t: string | null | undefined) => text(t).replace(/\s+/g, " ");

const LEVELS: Record<string, ExperienceLevel> = { entry: "entry", junior: "junior", midweight: "mid", "mid-level": "mid", mid: "mid", senior: "senior", internship: "internship" };
const PERIODS: Record<string, NonNullable<NormalizedJob["salary_period"]>> = { yearly: "year", annual: "year", monthly: "month", weekly: "week", daily: "day", hourly: "hour" };
const PERIOD_WORDS: Record<NonNullable<NormalizedJob["salary_period"]>, string> = { year: "per year", month: "per month", week: "per week", day: "per day", hour: "per hour" };
const SYMBOL: Record<string, string> = { CAD: "CA$", USD: "US$", EUR: "€", GBP: "£", AUD: "A$" };

/** Where a Jobicy job can be done, from its jobGeo ("Canada,  USA", "EMEA", "Anywhere"). */
export function jobicyScope(geo: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (geo ?? "").split(",")) {
    const p = part.trim();
    if (p) readPlace({ text: p }).scope.forEach((x) => out.add(x));
  }
  return [...out].sort();
}

/** What a JobicyStatus answer says about stored jobs: active, closed or unknown. */
export type JobicyStatusValue = "active" | "closed" | "unknown";

export class JobicyProvider implements JobProvider {
  readonly name = "jobicy";
  readonly label = "Jobicy";
  readonly paging = "cursor" as const;
  readonly cacheMinutes = 60;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    /** Fixture mode only: accept the test host's links. */
    private readonly opts: { allowFixtureHosts?: boolean } = {},
  ) {}

  normalizeJob(raw: unknown, query?: SearchQuery): NormalizedJob | null {
    const p = JobicyJob.safeParse(raw);
    if (!p.success) return null;
    const j = p.data;
    const id = String(j.id).trim();
    const title = oneLine(j.jobTitle).slice(0, 300);
    if (!id || !title || !j.url) return null;
    const link = checkJobLink(j.url, { source: "jobicy", externalId: id }, { allowFixtureHosts: this.opts.allowFixtureHosts ?? false });
    if (!link.ok) return null;
    const posted = j.pubDate && !Number.isNaN(Date.parse(j.pubDate)) ? new Date(j.pubDate).toISOString() : null;
    if (!posted) return null;
    // Jobicy's own geo; failing that, the place we asked for (Jobicy only returned jobs open to it).
    const scope = jobicyScope(j.jobGeo);
    const countries = scope.length ? scope : query ? [query.country] : [];
    if (!countries.length) return null;
    const isoOnly = countries.filter((c) => /^[A-Z]{2}$/.test(c));
    const full = text(j.jobDescription).slice(0, 20_000);
    const description = full || text(j.jobExcerpt).slice(0, 5000);
    const company = oneLine(j.companyName) || null;
    const geo = oneLine(j.jobGeo).replace(/\s*,\s*/g, ", ") || null;
    const level = jobLevel(title, LEVELS[(j.jobLevel ?? "").trim().toLowerCase()] ?? null);
    const types = (Array.isArray(j.jobType) ? j.jobType : j.jobType ? [j.jobType] : []).map((t) => oneLine(t)).filter(Boolean);
    const period = PERIODS[(j.salaryPeriod ?? "").trim().toLowerCase()] ?? null;
    const currency = /^[A-Z]{3}$/.test(j.salaryCurrency ?? "") ? j.salaryCurrency! : null;
    const stated = Boolean((j.salaryMin || j.salaryMax) && currency && period);
    const money = (v: number) => `${SYMBOL[currency!] ?? `${currency} `}${Math.round(v).toLocaleString("en")}`;
    const salary = stated
      ? `${j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax ? `${money(j.salaryMin)}–${money(j.salaryMax)}` : money((j.salaryMin || j.salaryMax)!)} ${PERIOD_WORDS[period!]}`
      : null;
    return {
      source: "jobicy",
      provider_key: `jobicy:${id}`.slice(0, 220),
      external_id: id.slice(0, 200),
      title,
      company: company?.slice(0, 300) ?? null,
      city: null,
      province: null,
      country: isoOnly.length === 1 && countries.length === 1 ? isoOnly[0] : null,
      countries: countries.slice(0, 60),
      location_text: geo ? `Remote (${geo})`.slice(0, 300) : "Remote",
      remote: true,
      workplace_type: "remote",
      experience_level: level.level,
      level_source: level.source,
      posted_at: posted,
      date_source: "source",
      apply_url: link.url.toString(),
      source_url: link.url.toString(),
      description,
      description_is_partial: !full,
      salary,
      salary_min: stated ? (j.salaryMin ?? null) : null,
      salary_max: stated ? (j.salaryMax ?? null) : null,
      salary_currency: stated ? currency : null,
      salary_period: stated ? period : null,
      employment_type: types.join(", ").slice(0, 120) || null,
      department: j.jobIndustry?.map(oneLine).filter(Boolean).join(", ").slice(0, 200) || null,
      dedupe_key: jobDedupeKey({ company, title, city: null, province: null, remote: true }),
      desc_fingerprint: description ? simhash64(description) : null,
      verification_status: "pending_validation",
    };
  }

  async searchJobs(q: SearchQuery, signal: AbortSignal): Promise<ProviderResult> {
    // Page 2 onward needs the previous page's cursor; without one there's nothing honest to ask for.
    if (q.page > 1 && !q.cursor) return { provider: this.name, outcome: "empty", jobs: [], total: null, skipped: 0, nextCursor: null };
    const industry = q.page === 1 ? jobicyIndustry(q.what) : null;
    let parsed = await this.page(q, industry, signal);
    // The field guess narrowed it to nothing: ask once more by keywords alone.
    if (industry && !parsed.jobs.length) parsed = await this.page(q, null, signal);
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    for (const raw of parsed.jobs) {
      const j = this.normalizeJob(raw, q);
      if (j) jobs.push(j);
      else skipped++;
    }
    const nextCursor = parsed.hasMore === false ? null : (parsed.nextCursor ?? null);
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total: null, skipped, nextCursor };
  }

  private async page(q: SearchQuery, industry: string | null, signal: AbortSignal) {
    const params = new URLSearchParams({ count: String(PER_PAGE), geo: jobicyGeo(q.country) });
    const tag = q.what.trim().slice(0, 100);
    if (tag) params.set("tag", tag);
    if (industry) params.set("industry", industry);
    if (q.cursor) params.set("cursor", q.cursor);
    const parsed = JobicyResponse.safeParse(await this.getJson(`${JOBICY_API}?${params}`, signal));
    if (!parsed.success) throw new ProviderError("malformed");
    return parsed.data;
  }

  /**
   * Jobicy's free status check for up to 100 stored jobs. Anything Jobicy doesn't answer
   * for, or answers with a status we don't know, is "unknown".
   */
  async jobStatus(ids: string[], signal: AbortSignal): Promise<Map<string, JobicyStatusValue>> {
    const wanted = [...new Set(ids.map((id) => id.trim()).filter((id) => /^\d{1,12}$/.test(id)))].slice(0, 100);
    const out = new Map<string, JobicyStatusValue>(wanted.map((id) => [id, "unknown"]));
    if (!wanted.length) return out;
    const parsed = JobicyStatus.safeParse(await this.getJson(`${JOBICY_API}/status?ids=${wanted.join(",")}`, signal));
    if (!parsed.success) throw new ProviderError("malformed");
    for (const r of parsed.data.jobs) {
      const id = String(r.id);
      if (out.has(id)) out.set(id, r.status === "active" || r.status === "closed" ? r.status : "unknown");
    }
    return out;
  }

  private async getJson(url: string, signal: AbortSignal): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    } catch (e) {
      throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
    if (res.status === 429) throw new ProviderError("rate_limited");
    if (!res.ok) throw new ProviderError("outage");
    return res.json().catch(() => null);
  }
}
