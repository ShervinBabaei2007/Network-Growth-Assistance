import { z } from "zod";
import { readPlace } from "@/lib/geo/countries";
import { boardHtmlToText, wantedScope } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type NormalizedJob, type ProviderResult } from "./types";

/**
 * Remotive's free public remote-jobs API (https://github.com/remotive-com/remote-jobs-api).
 * Its terms, which this follows:
 * - Link to the job's Remotive URL and name Remotive as the source (the card says "Remotive"
 *   and the link is the `url` field, exactly as given).
 * - Fetch a couple of times a day, at most 4: so Remotive is read by the scheduled crawl
 *   (at most every 6 hours), never once per user search. Searches use the stored jobs.
 * - Don't pass the jobs on to other job sites, and don't gate them behind sign-ups to
 *   collect emails: the app does neither (jobs are shown to signed-in users of this app only).
 * - Listings appear 24 hours after Remotive publishes them, so a Remotive job is never
 *   among the last 24 hours' results; its date is Remotive's publication date, unchanged.
 *
 * Where a job can be done comes from Remotive's candidate_required_location ("USA, Canada",
 * "Europe", "Worldwide"); only jobs open to a country someone searches are kept, and a job
 * whose location can't be read is skipped. Remotive gives no time zone with its dates;
 * they are read as UTC.
 * Pay is Remotive's own text (often USD, sometimes per hour), shown as written; it isn't
 * turned into numbers, so it never feeds the salary filter.
 */

export const REMOTIVE_API = "https://remotive.com/api/remote-jobs";
/** Remotive asks for at most 4 reads a day. */
export const REMOTIVE_MIN_INTERVAL_HOURS = 6;

const s = z.string().nullish();
const RemotiveJob = z.object({
  id: z.union([z.number(), z.string()]),
  url: s,
  title: z.string(),
  company_name: s,
  category: s,
  job_type: s,
  publication_date: s,
  candidate_required_location: s,
  salary: s,
  description: s,
});
const RemotiveResponse = z.object({ "job-count": z.number().nullish(), "total-job-count": z.number().nullish(), jobs: z.array(z.unknown()) });

/** Where a Remotive job can be done, from its candidate_required_location. */
export function remotiveScope(where: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (where ?? "").split(/[,;]/)) {
    const p = part.trim();
    if (p) readPlace({ text: p }).scope.forEach((x) => out.add(x));
  }
  return [...out].sort();
}
const EMPLOYMENT: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", freelance: "Contract (freelance)", internship: "Internship" };

const text = (t: string | null | undefined) => boardHtmlToText(t ?? "").replace(/[ \t]+/g, " ").trim();
const oneLine = (t: string | null | undefined) => text(t).replace(/\s+/g, " ");

export class RemotiveProvider {
  readonly name = "remotive";
  readonly label = "Remotive";

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    /** Fixture mode only: accept the test host's links. */
    private readonly opts: { allowFixtureHosts?: boolean } = {},
  ) {}

  /** `wanted`: the scope tokens of the countries users search (default: Canada). */
  normalizeJob(raw: unknown, wanted: ReadonlySet<string> = wantedScope(["CA"])): NormalizedJob | null {
    const p = RemotiveJob.safeParse(raw);
    if (!p.success) return null;
    const j = p.data;
    const id = String(j.id).trim();
    const title = oneLine(j.title).slice(0, 300);
    if (!id || !title || !j.url) return null;
    const where = oneLine(j.candidate_required_location);
    const countries = remotiveScope(where);
    if (!countries.some((c) => wanted.has(c))) return null;
    const isoOnly = countries.filter((c) => /^[A-Z]{2}$/.test(c));
    const link = checkJobLink(j.url, { source: "remotive", externalId: id }, { allowFixtureHosts: this.opts.allowFixtureHosts ?? false });
    if (!link.ok) return null;
    const rawDate = (j.publication_date ?? "").trim();
    const iso = rawDate && !/(z|[+-]\d{2}:?\d{2})$/i.test(rawDate) ? `${rawDate}Z` : rawDate;
    const posted = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : null;
    if (!posted) return null;
    const description = text(j.description).slice(0, 20_000);
    const company = oneLine(j.company_name) || null;
    const level = jobLevel(title, j.job_type === "internship" ? "internship" : null);
    const salary = oneLine(j.salary).slice(0, 120) || null;
    return {
      source: "remotive",
      provider_key: `remotive:${id}`.slice(0, 220),
      external_id: id.slice(0, 200),
      title,
      company: company?.slice(0, 300) ?? null,
      city: null,
      province: null,
      country: isoOnly.length === 1 && countries.length === 1 ? isoOnly[0] : null,
      countries: countries.slice(0, 60),
      location_text: `Remote (${where})`.slice(0, 300),
      remote: true,
      workplace_type: "remote",
      experience_level: level.level,
      level_source: level.source,
      posted_at: posted,
      date_source: "source",
      apply_url: link.url.toString(),
      source_url: link.url.toString(),
      description,
      description_is_partial: !description,
      salary,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      employment_type: j.job_type ? (EMPLOYMENT[j.job_type] ?? null) : null,
      department: oneLine(j.category).slice(0, 200) || null,
      dedupe_key: jobDedupeKey({ company, title, city: null, province: null, remote: true }),
      desc_fingerprint: description ? simhash64(description) : null,
      verification_status: "pending_validation",
    };
  }

  /**
   * The whole public feed (it is small). `complete` is true when Remotive says the answer
   * holds every job it has, so a stored Remotive job missing from it has been taken down.
   */
  async readFeed(signal: AbortSignal, wanted: ReadonlySet<string> = wantedScope(["CA"])): Promise<ProviderResult & { complete: boolean }> {
    let res: Response;
    try {
      res = await this.fetchImpl(REMOTIVE_API, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    } catch (e) {
      throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
    }
    if (res.status === 429) throw new ProviderError("rate_limited");
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth");
    if (!res.ok) throw new ProviderError("outage");
    const body = RemotiveResponse.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new ProviderError("malformed");
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    for (const raw of body.data.jobs) {
      const j = this.normalizeJob(raw, wanted);
      if (j) jobs.push(j);
      else skipped++;
    }
    const total = body.data["total-job-count"] ?? null;
    const complete = total !== null && total === body.data.jobs.length;
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total, skipped, complete };
  }
}
