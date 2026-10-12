import { z } from "zod";
import { readPlace } from "@/lib/geo/countries";
import { boardHtmlToText, wantedScope } from "../ats/types";
import { jobDedupeKey, simhash64 } from "../dedupe";
import { jobLevel, workplaceFromText } from "../levels";
import { checkJobLink } from "../verify-url";
import { ProviderError, type NormalizedJob, type ProviderResult } from "./types";

/**
 * Arbeitnow's free job board API (https://www.arbeitnow.com/blog/job-board-api): jobs in
 * Germany, elsewhere in Europe and the UK, in many fields, gathered from employers' own
 * job boards. No key. Its terms ask for "a link back to Arbeitnow.com on your platform";
 * every Arbeitnow job is credited and links to its Arbeitnow page, exactly as given.
 *
 * The API is a paged feed with no keyword search, so the crawl job reads its newest pages a
 * few times a day (at most every 6 hours) and searches use the stored jobs. Only jobs open
 * to a country someone searches are kept; a location that can't be read is skipped.
 * Jobs missing from the newest pages aren't closed (older ones simply fall off the feed);
 * links are checked like other job sites' and unseen jobs close after 30 days.
 */

export const ARBEITNOW_FEEDS = ["https://www.arbeitnow.com/api/job-board-api", "https://www.arbeitnow.co.uk/api/job-board-api"];
export const ARBEITNOW_PAGES = 2;
export const ARBEITNOW_MIN_INTERVAL_HOURS = 6;

const s = z.string().nullish();
const ArbeitnowJob = z.object({
  slug: z.string(),
  company_name: s,
  title: z.string(),
  description: s,
  remote: z.boolean().nullish(),
  url: s,
  tags: z.array(z.string()).nullish(),
  job_types: z.array(z.string()).nullish(),
  location: s,
  created_at: z.number().nullish(),
});
const ArbeitnowResponse = z.object({ data: z.array(z.unknown()), links: z.object({ next: z.string().nullish() }).nullish() });

const text = (t: string | null | undefined) => boardHtmlToText(t ?? "").replace(/[ \t]+/g, " ").trim();
const oneLine = (t: string | null | undefined) => text(t).replace(/\s+/g, " ");

/** Arbeitnow's job types ("fulltime permanent", "Part time", "Intern") → the app's wording. */
function employment(types: string[]): string | null {
  const t = types.join(" ").toLowerCase();
  const out = [/full ?time/.test(t) && "Full-time", /part ?time/.test(t) && "Part-time", /contract|fixed term|freelance/.test(t) && "Contract", /intern|werkstudent|student/.test(t) && "Internship"].filter(Boolean);
  return out.length ? out.join(", ") : null;
}

export class ArbeitnowProvider {
  readonly name = "arbeitnow";
  readonly label = "Arbeitnow";

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    /** Fixture mode only: accept the test host's links. */
    private readonly opts: { allowFixtureHosts?: boolean } = {},
  ) {}

  /** `wanted`: the scope tokens of the countries users search (default: Germany). */
  normalizeJob(raw: unknown, wanted: ReadonlySet<string> = wantedScope(["DE"])): NormalizedJob | null {
    const p = ArbeitnowJob.safeParse(raw);
    if (!p.success) return null;
    const j = p.data;
    const id = j.slug.trim();
    const title = oneLine(j.title).slice(0, 300);
    if (!id || !title || !j.url) return null;
    const link = checkJobLink(j.url, { source: "arbeitnow", externalId: id }, { allowFixtureHosts: this.opts.allowFixtureHosts ?? false });
    if (!link.ok) return null;
    const where = oneLine(j.location);
    const place = readPlace({ text: where });
    const countries = place.scope;
    if (!countries.some((c) => wanted.has(c))) return null;
    const posted = typeof j.created_at === "number" && j.created_at > 0 ? new Date(j.created_at * 1000).toISOString() : null;
    if (!posted) return null;
    const description = text(j.description).slice(0, 20_000);
    const company = oneLine(j.company_name) || null;
    const remote = Boolean(j.remote) || /\bremote\b/i.test(where);
    const level = jobLevel(title, (j.job_types ?? []).some((t) => /\b(intern|werkstudent)\b/i.test(t)) ? "internship" : null);
    return {
      source: "arbeitnow",
      provider_key: `arbeitnow:${id}`.slice(0, 220),
      external_id: id.slice(0, 200),
      title,
      company: company?.slice(0, 300) ?? null,
      city: place.city?.slice(0, 120) ?? null,
      province: place.region,
      country: place.country,
      countries: countries.slice(0, 60),
      location_text: where.slice(0, 300) || null,
      remote,
      workplace_type: workplaceFromText(where, title) ?? (remote ? "remote" : null),
      experience_level: level.level,
      level_source: level.source,
      posted_at: posted,
      date_source: "source",
      apply_url: link.url.toString(),
      source_url: link.url.toString(),
      description,
      description_is_partial: !description,
      salary: null,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      employment_type: employment(j.job_types ?? []),
      department: (j.tags ?? []).map(oneLine).filter(Boolean).slice(0, 5).join(", ").slice(0, 200) || null,
      dedupe_key: jobDedupeKey({ company, title, city: place.city, province: place.region, remote }),
      desc_fingerprint: description ? simhash64(description) : null,
      verification_status: "pending_validation",
    };
  }

  /**
   * The newest pages of each feed. One feed failing doesn't lose the other's jobs. Never
   * "complete": older jobs fall off the feed rather than close.
   */
  async readFeed(signal: AbortSignal, wanted: ReadonlySet<string> = wantedScope(["DE"])): Promise<ProviderResult & { complete: boolean }> {
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    let failure: ProviderError | null = null;
    for (const feed of ARBEITNOW_FEEDS) {
      try {
        const r = await this.readOne(feed, signal, wanted);
        jobs.push(...r.jobs);
        skipped += r.skipped;
      } catch (e) {
        failure ??= e instanceof ProviderError ? e : new ProviderError("outage");
      }
    }
    if (failure && !jobs.length) throw failure;
    return { provider: this.name, outcome: jobs.length ? "ok" : "empty", jobs, total: null, skipped, complete: false };
  }

  private async readOne(feed: string, signal: AbortSignal, wanted: ReadonlySet<string>): Promise<{ jobs: NormalizedJob[]; skipped: number }> {
    const jobs: NormalizedJob[] = [];
    let skipped = 0;
    let url: string | null = feed;
    for (let page = 0; url && page < ARBEITNOW_PAGES; page++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
      } catch (e) {
        throw new ProviderError(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "outage");
      }
      if (res.status === 429) throw new ProviderError("rate_limited");
      if (!res.ok) throw new ProviderError("outage");
      const body = ArbeitnowResponse.safeParse(await res.json().catch(() => null));
      if (!body.success) throw new ProviderError("malformed");
      for (const raw of body.data.data) {
        const j = this.normalizeJob(raw, wanted);
        if (j) jobs.push(j);
        else skipped++;
      }
      // Only follow Arbeitnow's own next-page link, on the same feed.
      const next = body.data.links?.next ?? null;
      url = next && next.startsWith(`${feed}?`) ? next : null;
    }
    return { jobs, skipped };
  }
}
