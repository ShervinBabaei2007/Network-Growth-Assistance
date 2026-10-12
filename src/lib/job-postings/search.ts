import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { wantedScope } from "./ats/types";
import { searchedCountries } from "./crawler";
import { ARBEITNOW_MIN_INTERVAL_HOURS, ArbeitnowProvider } from "./providers/arbeitnow";
import { REMOTIVE_MIN_INTERVAL_HOURS, RemotiveProvider } from "./providers/remotive";
import { ProviderError, type JobProvider, type NormalizedJob, type ProviderOutcome, type ProviderResult, type SearchQuery } from "./providers/types";
import { extractRequirements } from "./requirements";

/**
 * Asks the search-time providers (Jobicy, and Adzuna when configured) for fresh listings
 * and stores them with the crawled board jobs, so one query serves both. Providers run
 * side by side; one failing (timeout, rate limit, outage, rejected key, malformed answer)
 * never stops the others, and the user sees only a general notice, never error details or keys.
 *
 * Each provider's answer is cached per query (30 minutes, or longer when the provider asks:
 * an hour for Jobicy), so paging and reloading don't call it again.
 */

export const PROVIDER_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_MINUTES = 30;

export type SourceNotice = { provider: string; label: string; outcome: ProviderOutcome | "cached"; count: number };

/** Runs every provider at once and collects what each returned or why it didn't. Pure apart from the providers' own calls. */
export async function runProviders(providers: JobProvider[], query: SearchQuery, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<{ results: ProviderResult[]; notices: SourceNotice[] }> {
  const settled = await Promise.allSettled(providers.map((p) => p.searchJobs(query, AbortSignal.timeout(timeoutMs))));
  const results: ProviderResult[] = [];
  const notices: SourceNotice[] = settled.map((s, i) => {
    const p = providers[i];
    if (s.status === "fulfilled") {
      results.push(s.value);
      return { provider: p.name, label: p.label, outcome: s.value.outcome, count: s.value.jobs.length };
    }
    const outcome: ProviderOutcome = s.reason instanceof ProviderError ? s.reason.outcome : s.reason instanceof Error && s.reason.name === "TimeoutError" ? "timeout" : "outage";
    return { provider: p.name, label: p.label, outcome, count: 0 };
  });
  return { results, notices };
}

export const cacheKey = (provider: string, q: SearchQuery) => `${provider}:${q.country}|${q.what.trim().toLowerCase()}|${(q.where ?? "").trim().toLowerCase()}|${q.maxDaysOld}|p${q.page}`.slice(0, 300);

const FAILED: ProviderOutcome[] = ["timeout", "rate_limited", "auth", "outage", "malformed"];
export const providerTrouble = (notices: SourceNotice[]) => notices.some((n) => FAILED.includes(n.outcome as ProviderOutcome));

type CacheRow = { query_key: string; status: string; result_count: number; fetched_at: string; next_cursor: string | null };

/**
 * Which providers to ask now, and with which cursor. A provider whose answer for this
 * query is younger than its cache time isn't asked again. A cursor-paged provider's page N
 * needs page N-1's cursor; without one (that page wasn't read, or it was the last), it
 * isn't asked: there's nothing honest to ask for. Pure.
 */
export function planRefresh(providers: JobProvider[], query: SearchQuery, cache: Map<string, CacheRow>, now = Date.now()): { fresh: { provider: JobProvider; row: CacheRow }[]; due: { provider: JobProvider; cursor: string | null }[] } {
  const fresh: { provider: JobProvider; row: CacheRow }[] = [];
  const due: { provider: JobProvider; cursor: string | null }[] = [];
  for (const p of providers) {
    const row = cache.get(cacheKey(p.name, query));
    if (row && now - Date.parse(row.fetched_at) < (p.cacheMinutes ?? DEFAULT_CACHE_MINUTES) * 60_000) {
      fresh.push({ provider: p, row });
      continue;
    }
    if (p.paging === "cursor" && query.page > 1) {
      const cursor = cache.get(cacheKey(p.name, { ...query, page: query.page - 1 }))?.next_cursor ?? null;
      if (cursor) due.push({ provider: p, cursor });
      continue;
    }
    due.push({ provider: p, cursor: null });
  }
  return { fresh, due };
}

/** Stores normalized listings. Existing rows keep their verification and first-seen time. */
export async function storeJobs(jobs: NormalizedJob[]): Promise<number> {
  if (!jobs.length) return 0;
  const db = createAdminClient();
  const now = new Date().toISOString();
  // verification_status is left out on purpose: a re-seen listing keeps its checked status.
  const rows = jobs.map(({ verification_status: _ignored, ...j }) => ({ ...j, last_seen_at: now, closed_at: null }));
  const { data, error } = await db.from("jobs").upsert(rows, { onConflict: "provider_key" }).select("id, description");
  if (error || !data) return 0;
  const ids = data.map((d) => d.id);
  const { data: have } = await db.from("job_requirements").select("job_id").in("job_id", ids);
  const done = new Set((have ?? []).map((r) => r.job_id));
  const reqRows = data
    .filter((d) => !done.has(d.id) && d.description)
    .flatMap((d) => extractRequirements(d.description).map((r, idx) => ({ job_id: d.id, idx, text: r.text.slice(0, 400), kind: r.kind, category: r.category, years: r.years, degree_level: r.degreeLevel })));
  if (reqRows.length) await db.from("job_requirements").insert(reqRows);
  return data.length;
}

/**
 * Refreshes the providers for one search, skipping any whose answer for the same query is
 * still fresh. Returns a notice per provider for the UI.
 */
export async function refreshFromProviders(providers: JobProvider[], query: SearchQuery): Promise<SourceNotice[]> {
  if (!providers.length || !query.what.trim()) return [];
  const db = createAdminClient();
  const keys = providers.flatMap((p) => [cacheKey(p.name, query), ...(p.paging === "cursor" && query.page > 1 ? [cacheKey(p.name, { ...query, page: query.page - 1 })] : [])]);
  const { data: rows } = await db.from("job_search_cache").select("query_key, status, result_count, fetched_at, next_cursor").in("query_key", keys);
  const { fresh, due } = planRefresh(providers, query, new Map((rows ?? []).map((r) => [r.query_key, r])));
  const notices: SourceNotice[] = fresh.map(({ provider: p, row: c }) => ({
    provider: p.name,
    label: p.label,
    outcome: (c.status === "ok" || c.status === "empty" ? "cached" : c.status) as SourceNotice["outcome"],
    count: c.result_count,
  }));
  if (!due.length) return notices;

  const runs = await Promise.all(due.map(({ provider, cursor }) => runProviders([provider], { ...query, cursor })));
  const results = runs.flatMap((r) => r.results);
  const live = runs.flatMap((r) => r.notices);
  const nextCursor = new Map(results.map((r) => [r.provider, r.nextCursor ?? null]));
  await Promise.all(results.map((r) => storeJobs(r.jobs)));
  await db.from("job_search_cache").upsert(
    live.map((n) => ({
      query_key: cacheKey(n.provider, query),
      provider: n.provider,
      fetched_at: new Date().toISOString(),
      result_count: n.count,
      status: n.outcome === "cached" ? "ok" : n.outcome,
      next_cursor: nextCursor.get(n.provider)?.slice(0, 1000) ?? null,
    })),
    { onConflict: "query_key" },
  );
  return [...notices, ...live];
}

/** A job site read on a schedule rather than per search (it has no search, or asks for few calls). */
export type ScheduledFeed = {
  name: "remotive" | "arbeitnow";
  label: string;
  /** The site asks for at most one read in this many hours. */
  minIntervalHours: number;
  readFeed(signal: AbortSignal, wanted: ReadonlySet<string>): Promise<ProviderResult & { complete: boolean }>;
};

export type FeedSync = { read: boolean; stored: number; closed: number; outcome: ProviderOutcome | "skipped" };

/** The scheduled feeds: Remotive (at most 4 reads a day, as it asks) and Arbeitnow (a feed with no search). */
export const scheduledFeeds = (): ScheduledFeed[] => [
  { name: "remotive", label: "Remotive", minIntervalHours: REMOTIVE_MIN_INTERVAL_HOURS, readFeed: (signal, wanted) => new RemotiveProvider().readFeed(signal, wanted) },
  { name: "arbeitnow", label: "Arbeitnow", minIntervalHours: ARBEITNOW_MIN_INTERVAL_HOURS, readFeed: (signal, wanted) => new ArbeitnowProvider().readFeed(signal, wanted) },
];

/**
 * Reads one scheduled feed if it hasn't been read within its interval, stores the jobs open
 * to a country users search, and, when the feed says it's complete, closes its stored jobs
 * that it no longer lists. Called by the crawl job, never per search.
 */
export async function syncFeed(feed: ScheduledFeed, opts: { fixtures: boolean; now?: number }): Promise<FeedSync> {
  if (opts.fixtures) return { read: false, stored: 0, closed: 0, outcome: "skipped" };
  const db = createAdminClient();
  const now = opts.now ?? Date.now();
  const key = `${feed.name}:feed`;
  const { data: last } = await db.from("job_search_cache").select("fetched_at").eq("query_key", key).maybeSingle();
  if (last && now - Date.parse(last.fetched_at) < feed.minIntervalHours * 3600_000) return { read: false, stored: 0, closed: 0, outcome: "skipped" };
  // Recorded before the read, so even a failing or slow feed is asked no more often than it allows.
  await db.from("job_search_cache").upsert({ query_key: key, provider: feed.name, fetched_at: new Date(now).toISOString(), result_count: 0, status: "empty" }, { onConflict: "query_key" });
  let outcome: ProviderOutcome = "outage";
  let stored = 0;
  let closed = 0;
  try {
    const read = await feed.readFeed(AbortSignal.timeout(PROVIDER_TIMEOUT_MS * 2), wantedScope(await searchedCountries(db)));
    outcome = read.outcome;
    stored = await storeJobs(read.jobs);
    if (read.complete) {
      const listed = read.jobs.map((j) => j.provider_key);
      let gone = db.from("jobs").update({ closed_at: new Date(now).toISOString(), verification_status: "expired", verification_note: `No longer listed on ${feed.label}` }).eq("source", feed.name).is("closed_at", null);
      if (listed.length) gone = gone.not("provider_key", "in", `(${listed.map((k) => `"${k}"`).join(",")})`);
      const { data } = await gone.select("id");
      closed = data?.length ?? 0;
    }
  } catch (e) {
    outcome = e instanceof ProviderError ? e.outcome : e instanceof Error && e.name === "TimeoutError" ? "timeout" : "outage";
  }
  await db.from("job_search_cache").update({ result_count: stored, status: outcome }).eq("query_key", key);
  return { read: true, stored, closed, outcome };
}

/** Every scheduled feed, one at a time; one failing never stops the others. */
export async function syncFeeds(opts: { fixtures: boolean }): Promise<Record<string, FeedSync>> {
  const out: Record<string, FeedSync> = {};
  for (const feed of scheduledFeeds()) out[feed.name] = await syncFeed(feed, opts).catch(() => ({ read: false, stored: 0, closed: 0, outcome: "outage" as const }));
  return out;
}
