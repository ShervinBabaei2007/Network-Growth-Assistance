import { z } from "zod";
import { provinceOf } from "@/lib/discovery/location";
import { countryCode, currencyOf } from "@/lib/geo/countries";
import { boardHtmlToText } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel, workplaceFromText } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type JobProvider, type NormalizedJob, type ProviderResult, type SearchQuery } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

/**
 * Adzuna's official job search API (https://developer.adzuna.com/), optional: used only
 * when its keys are set. It covers a fixed list of countries; for any other country (or
 * the Anywhere choice) it isn't asked. It returns listings from many employers and job
 * boards, each with Adzuna's own link to the listing.
 *
 * - Links are Adzuna's redirect_url, exactly as given. A result without one is dropped.
 * - Salaries Adzuna estimates (salary_is_predicted = "1") are not shown: only stated pay is.
 * - Descriptions are snippets, so fit checks on these jobs are marked partial.
 * - New results start "not yet verified"; their links are checked separately.
 */

const s = z.string().nullish();
const AdzunaJob = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  description: s,
  created: s,
  redirect_url: s,
  company: z.object({ display_name: s }).nullish(),
  location: z.object({ display_name: s, area: z.array(z.string()).nullish() }).nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  contract_type: s,
  contract_time: s,
  category: z.object({ label: s }).nullish(),
});
const AdzunaResponse = z.object({ count: z.number().nullish(), results: z.array(z.unknown()) });

const PER_PAGE = 50;
/** The countries Adzuna's API serves (its country path segment is the lower-case code). */
export const ADZUNA_COUNTRIES = new Set(["GB", "US", "AT", "AU", "BE", "BR", "CA", "CH", "DE", "ES", "FR", "IN", "IT", "MX", "NL", "NZ", "PL", "SG", "ZA"]);
const stripTags = (t: string | null | undefined) => boardHtmlToText(t ?? "").replace(/\s+/g, " ").trim();

const EMPLOYMENT: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", permanent: "Permanent", contract: "Contract" };

export class AdzunaProvider implements JobProvider {
  readonly name = "adzuna";
  readonly label = "Adzuna";

  constructor(
    private readonly appId: string,
    private readonly appKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Fixture mode only: accept the test host's links. */
    private readonly opts: { allowFixtureHosts?: boolean } = {},
  ) {}

  normalizeJob(raw: unknown): NormalizedJob | null {
    const p = AdzunaJob.safeParse(raw);
    if (!p.success) return null;
    const j = p.data;
    const id = String(j.id);
    const title = stripTags(j.title).slice(0, 300);
    if (!title || !j.redirect_url) return null;
    // Only Adzuna's own link for this listing; nothing is built from the id.
    const link = checkJobLink(j.redirect_url, { source: "adzuna", externalId: id }, { allowFixtureHosts: this.opts.allowFixtureHosts ?? false });
    if (!link.ok) return null;
    const area = j.location?.area ?? [];
    const country = countryCode(area[0]);
    if (!country) return null;
    const region = area[1] ?? null;
    const city = area[area.length - 1] && area.length >= 3 ? area[area.length - 1] : null;
    const locationText = stripTags(j.location?.display_name) || null;
    const province = country === "CA" ? provinceOf(region, city, locationText ?? "") : null;
    const remote = /\bremote\b/i.test(`${title} ${locationText ?? ""}`);
    const description = stripTags(j.description).slice(0, 5000);
    const company = stripTags(j.company?.display_name) || null;
    const posted = j.created && !Number.isNaN(Date.parse(j.created)) ? new Date(j.created).toISOString() : null;
    if (!posted) return null;
    const stated = String(j.salary_is_predicted ?? "1") === "0" && (j.salary_min || j.salary_max);
    const cur = currencyOf(country);
    const money = (v: number) => `${cur === "CAD" ? "$" : `${cur ?? ""} `}${Math.round(v).toLocaleString("en-CA")}`;
    const level = jobLevel(title, null);
    const employment = [j.contract_time, j.contract_type].map((x) => (x ? EMPLOYMENT[x] : null)).filter(Boolean).join(", ") || null;
    return {
      source: "adzuna",
      provider_key: `adzuna:${id}`.slice(0, 220),
      external_id: id.slice(0, 200),
      title,
      company: company?.slice(0, 300) ?? null,
      city: city?.slice(0, 120) ?? null,
      province,
      country,
      countries: [country],
      location_text: locationText?.slice(0, 300) ?? null,
      remote,
      workplace_type: workplaceFromText(title, locationText) ?? (remote ? "remote" : null),
      experience_level: level.level,
      level_source: level.source,
      posted_at: posted,
      date_source: "source",
      apply_url: link.url.toString(),
      source_url: link.url.toString(),
      description,
      description_is_partial: true,
      salary: stated ? (j.salary_min && j.salary_max && j.salary_min !== j.salary_max ? `${money(j.salary_min)}–${money(j.salary_max)} per year` : `${money((j.salary_min ?? j.salary_max)!)} per year`) : null,
      salary_min: stated ? (j.salary_min ?? null) : null,
      salary_max: stated ? (j.salary_max ?? null) : null,
      salary_currency: stated ? currencyOf(country) : null,
      salary_period: stated ? "year" : null,
      employment_type: employment,
      department: j.category?.label?.slice(0, 200) ?? null,
      dedupe_key: jobDedupeKey({ company, title, city, province, remote }),
      desc_fingerprint: simhash64(description),
      verification_status: "pending_validation",
    };
  }

  async searchJobs(q: SearchQuery, signal: AbortSignal): Promise<ProviderResult> {
    if (!ADZUNA_COUNTRIES.has(q.country)) return { provider: this.name, outcome: "empty", jobs: [], total: null, skipped: 0 };
    const params = new URLSearchParams({
      app_id: this.appId,
      app_key: this.appKey,
      results_per_page: String(PER_PAGE),
      what: q.what,
      max_days_old: String(q.maxDaysOld),
      sort_by: "date",
      "content-type": "application/json",
    });
    if (q.where) params.set("where", q.where);
    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.adzuna.com/v1/api/jobs/${q.country.toLowerCase()}/search/${Math.max(1, q.page)}?${params}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    } catch (e) {
      throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
    if (res.status === 429) throw new ProviderError("rate_limited");
    if (!res.ok) throw new ProviderError("outage");
    const body = AdzunaResponse.safeParse(await readCappedJson(res, BODY_LIMITS.feed).catch(() => null));
    if (!body.success) throw new ProviderError("malformed");
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    for (const raw of body.data.results) {
      const j = this.normalizeJob(raw);
      if (j) jobs.push(j);
      else skipped++;
    }
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total: body.data.count ?? null, skipped };
  }
}
