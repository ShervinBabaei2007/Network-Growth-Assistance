import { z } from "zod";
import { provinceOf } from "@/lib/discovery/location";
import { currencyOf } from "@/lib/geo/countries";
import { boardHtmlToText } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel, workplaceFromText } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type JobProvider, type NormalizedJob, type ProviderResult, type SearchQuery } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

/**
 * Careerjet's job search API (https://www.careerjet.com/partners/api), optional: used only
 * when CAREERJET_API_KEY (a free publisher key) is set. Careerjet aggregates job sites and
 * employers' pages in 90+ countries; each result links to Careerjet's page for it.
 *
 * - Careerjet requires the IP address and browser of the person searching, so it's asked
 *   only from the Jobs page (never by the alerts job, which has no person behind it).
 * - Links are Careerjet's, exactly as given; a result without one is dropped.
 * - Descriptions are snippets, so fit checks on these jobs are marked partial.
 * - New results start "not yet verified"; their links are checked separately.
 */

/** Careerjet's site for each country, by the locale its API expects. */
export const CAREERJET_LOCALES: Record<string, { locale: string; host: string }> = {
  CA: { locale: "en_CA", host: "careerjet.ca" },
  US: { locale: "en_US", host: "careerjet.com" },
  GB: { locale: "en_GB", host: "careerjet.co.uk" },
  IE: { locale: "en_IE", host: "careerjet.ie" },
  AU: { locale: "en_AU", host: "careerjet.com.au" },
  NZ: { locale: "en_NZ", host: "careerjet.co.nz" },
  IN: { locale: "en_IN", host: "careerjet.co.in" },
  ZA: { locale: "en_ZA", host: "careerjet.co.za" },
  SG: { locale: "en_SG", host: "careerjet.sg" },
  DE: { locale: "de_DE", host: "careerjet.de" },
  AT: { locale: "de_AT", host: "careerjet.at" },
  CH: { locale: "de_CH", host: "careerjet.ch" },
  FR: { locale: "fr_FR", host: "careerjet.fr" },
  BE: { locale: "fr_BE", host: "careerjet.be" },
  NL: { locale: "nl_NL", host: "careerjet.nl" },
  ES: { locale: "es_ES", host: "careerjet.es" },
  IT: { locale: "it_IT", host: "careerjet.it" },
  PL: { locale: "pl_PL", host: "careerjet.pl" },
  BR: { locale: "pt_BR", host: "careerjet.com.br" },
  MX: { locale: "es_MX", host: "careerjet.com.mx" },
};

const s = z.string().nullish();
const CareerjetJob = z.object({
  job_id: z.union([z.string(), z.number()]).nullish(),
  url: z.string(),
  title: z.string(),
  company: s,
  date: s,
  description: s,
  locations: z.union([z.string(), z.array(z.string())]).nullish(),
  location: s,
  salary: s,
  salary_min: z.union([z.number(), z.string()]).nullish(),
  salary_max: z.union([z.number(), z.string()]).nullish(),
  salary_type: s,
  salary_currency_code: s,
});
const CareerjetResponse = z.object({ type: s, hits: z.number().nullish(), jobs: z.array(z.unknown()).nullish() });

const PER_PAGE = 50;
const PERIOD: Record<string, NormalizedJob["salary_period"]> = { Y: "year", M: "month", W: "week", D: "day", H: "hour" };
const num = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

/** The listing's id: the last segment of its Careerjet link, which the link check then finds in it. */
export function careerjetId(url: URL): string | null {
  const last = url.pathname.split("/").filter(Boolean).pop()?.replace(/\.html?$/i, "") ?? "";
  return /^[A-Za-z0-9_-]{6,200}$/.test(last) ? last : null;
}

export class CareerjetProvider implements JobProvider {
  readonly name = "careerjet";
  readonly label = "Careerjet";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  normalizeJob(raw: unknown, query?: SearchQuery): NormalizedJob | null {
    const p = CareerjetJob.safeParse(raw);
    if (!p.success || !query) return null;
    const j = p.data;
    const country = query.country;
    let url: URL;
    try {
      url = new URL(j.url);
    } catch {
      return null;
    }
    const id = careerjetId(url);
    if (!id) return null;
    const link = checkJobLink(j.url, { source: "careerjet", externalId: id });
    if (!link.ok) return null;
    const title = boardHtmlToText(j.title).replace(/\s+/g, " ").trim().slice(0, 300);
    if (!title) return null;
    const posted = j.date && !Number.isNaN(Date.parse(j.date)) ? new Date(j.date).toISOString() : null;
    if (!posted) return null;
    const locationText = (Array.isArray(j.locations) ? j.locations.join("; ") : (j.locations ?? j.location ?? "")).trim() || null;
    const first = (Array.isArray(j.locations) ? j.locations[0] : (j.locations ?? j.location)) ?? "";
    const city = first.split(",")[0]?.trim() || null;
    const province = country === "CA" ? provinceOf(first.split(",")[1]?.trim() ?? null, city, first) : null;
    const remote = /\bremote\b/i.test(`${title} ${locationText ?? ""}`);
    const description = boardHtmlToText(j.description).replace(/\s+/g, " ").trim().slice(0, 5000);
    const company = j.company?.trim().slice(0, 300) || null;
    const min = num(j.salary_min);
    const max = num(j.salary_max);
    const period = PERIOD[(j.salary_type ?? "").toUpperCase()] ?? null;
    const currency = j.salary_currency_code && /^[A-Z]{3}$/.test(j.salary_currency_code) ? j.salary_currency_code : (min || max ? currencyOf(country) : null);
    const level = jobLevel(title, null);
    return {
      source: "careerjet",
      provider_key: `careerjet:${id}`.slice(0, 220),
      external_id: id,
      title,
      company,
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
      // Only pay the listing states (Careerjet shows it as text, with numbers when it has them).
      salary: j.salary?.trim().slice(0, 200) || null,
      salary_min: min,
      salary_max: max,
      salary_currency: min || max ? currency : null,
      salary_period: min || max ? period : null,
      employment_type: null,
      department: null,
      dedupe_key: jobDedupeKey({ company, title, city, province, remote }),
      desc_fingerprint: simhash64(description),
      verification_status: "pending_validation",
    };
  }

  async searchJobs(q: SearchQuery, signal: AbortSignal): Promise<ProviderResult> {
    const site = CAREERJET_LOCALES[q.country];
    // Careerjet needs the searching person's IP and browser; without a person there's no call.
    if (!site || !q.client) return { provider: this.name, outcome: "empty", jobs: [], total: null, skipped: 0 };
    const params = new URLSearchParams({
      locale_code: site.locale,
      keywords: q.what,
      sort: "date",
      page: String(Math.max(1, q.page)),
      page_size: String(PER_PAGE),
      user_ip: q.client.ip,
      user_agent: q.client.userAgent,
    });
    if (q.where) params.set("location", q.where);
    let res: Response;
    try {
      res = await this.fetchImpl(`https://search.api.careerjet.net/v4/query?${params}`, {
        signal,
        cache: "no-store",
        headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}` },
      });
    } catch (e) {
      throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
    if (res.status === 429) throw new ProviderError("rate_limited");
    if (!res.ok) throw new ProviderError("outage");
    const body = CareerjetResponse.safeParse(await readCappedJson(res, BODY_LIMITS.feed).catch(() => null));
    if (!body.success) throw new ProviderError("malformed");
    // An ambiguous place ("LOCATIONS": a list of places to choose from) has no jobs to show.
    if (body.data.type && body.data.type.toUpperCase() !== "JOBS") return { provider: this.name, outcome: "empty", jobs: [], total: 0, skipped: 0 };
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    for (const raw of body.data.jobs ?? []) {
      const j = this.normalizeJob(raw, q);
      if (j) jobs.push(j);
      else skipped++;
    }
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total: body.data.hits ?? null, skipped };
  }
}
