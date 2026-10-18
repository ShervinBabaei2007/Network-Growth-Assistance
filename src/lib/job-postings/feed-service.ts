import "server-only";
import { scopeFor } from "@/lib/geo/countries";
import type { AtsKind } from "./ats/types";
import { dedupeJobs, type DedupeItem } from "./dedupe";
import { AUTO_LADDER, chooseRange, inRange, RANGES, rangeSince, titleQuery, type Range } from "./feed";
import { resolveFeed, titlesFromResume, type FeedQuery, type FeedSettings, type FeedTab, type ResolvedFeed } from "./feed-query";
import { matchesFilters } from "./filters";
import { hiddenBy, type HiddenFilter } from "./hidden";
import { prefilterScore } from "./fit";
import { searchProviders } from "./providers/registry";
import { rankScore } from "./rank";
import { refreshFromProviders, type Background, type SourceNotice } from "./search";
import { chunk, loadActiveResume, MAX_SCORED_PER_VIEW, scoreJobs, type ActiveResume, type Db } from "./service";
import { jobServices } from "./services";
import { PROVINCE_NAMES } from "./types";
import { scheduleVerifyPending } from "./verify-job";
import { FIXTURE_LINK_PREFIX, isFixtureLink } from "./verify-url";

/**
 * The Jobs feed: which postings a search shows, in what order and under which tab. The
 * Jobs page and saved-search alerts both use it, so a search shows the same jobs to both
 * for the same data and the same moment (`now`).
 *
 * Only the page asks outside job sources for fresh results (`refresh: true`). Alerts read
 * what's already stored. Every query on a user's own rows filters by `userId` explicitly,
 * so it is correct with the user's client and with the server's (cron) client alike.
 */

export const FEED_PAGE_SIZE = 25;
/** The most postings one search loads. */
export const MAX_FEED_ROWS = 1000;
/** Saved jobs shown under "Saved & applied". */
const MAX_SAVED = 300;
/** Searched titles sent to the job sites per search (each is one call per site, cached). */
export const MAX_PROVIDER_TITLES = 3;
/** Unchecked search results whose links are checked right after a search page is sent. */
const VERIFY_AFTER_SEARCH = 60;

/** One notice per source when several titles were searched: counts added, any success wins. */
export function mergeNotices(notices: SourceNotice[]): SourceNotice[] {
  const rank = (o: SourceNotice["outcome"]) => (o === "ok" ? 0 : o === "cached" ? 1 : o === "empty" ? 2 : 3);
  const by = new Map<string, SourceNotice>();
  for (const n of notices) {
    const prev = by.get(n.provider);
    by.set(n.provider, prev ? { ...prev, outcome: rank(n.outcome) < rank(prev.outcome) ? n.outcome : prev.outcome, count: prev.count + n.count } : { ...n });
  }
  return [...by.values()];
}

/**
 * What the feed reads per posting. `description` is the first 4,000 characters
 * (description_head): enough to rank and preview, without reading up to 1,000 full
 * descriptions per search. The job's own page reads the whole text.
 */
export const JOB_FIELDS =
  "id, title, company, city, province, country, countries, remote, workplace_type, posted_at, date_source, date_note, source, user_id, employer_id, salary, salary_min, salary_max, salary_currency, salary_period, employment_type, experience_level, level_source, apply_url, verification_status, verification_note, closed_at, description:description_head, dedupe_key, desc_fingerprint, description_is_partial, canonical_url";

export type FeedJob = {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  countries: string[];
  remote: boolean;
  workplace_type: string | null;
  posted_at: string;
  date_source: string;
  date_note: string | null;
  source: string;
  user_id: string | null;
  employer_id: string | null;
  salary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  experience_level: string | null;
  level_source: string | null;
  apply_url: string | null;
  verification_status: string;
  verification_note: string | null;
  closed_at: string | null;
  description: string;
  dedupe_key: string | null;
  desc_fingerprint: string | null;
  description_is_partial: boolean;
  canonical_url: string | null;
};

export type EmployerInfo = { name: string; ats: AtsKind; careers_url: string | null };
export type FeedMatch = { tier: string; score: number; summary: string | null; results: unknown };
type Status = "saved" | "applied" | "dismissed";

// ------------------------------------------------------------------ pure steps

export type Selection = {
  /** One copy of each job in the window, most direct verified link kept. */
  rows: FeedJob[];
  /** For each kept job, the other copies of it (other sources). */
  duplicatesOf: Map<string, FeedJob[]>;
  range: Range;
  expandedFrom: Range | null;
  firstCount: number;
};

const employerHosted = (j: FeedJob) => {
  if (j.source !== "ats" || !j.apply_url || !j.employer_id) return false;
  try {
    return !/greenhouse|lever|ashbyhq|smartrecruiters|workable|recruitee|myworkdayjobs|myworkdaysite/.test(new URL(j.apply_url).hostname);
  } catch {
    return false;
  }
};

/**
 * Filters (dismissed, hidden companies and titles, excluded words, filters), the freshness window (the shortest with
 * enough verified results, unless one was chosen) and duplicates merged.
 */
export function selectFeed(fresh: FeedJob[], ctx: { resolved: ResolvedFeed; settings: FeedSettings; states: Map<string, Status>; isReal: (j: FeedJob) => boolean; now: number; hidden?: readonly HiddenFilter[] }): Selection {
  const { resolved, settings, states, isReal, now, hidden = [] } = ctx;
  const excludedWords = settings.job_exclude_keywords.map((k) => k.toLowerCase());
  const filtered = fresh.filter(
    (j) => isReal(j) && states.get(j.id) !== "dismissed" && !hiddenBy(j, hidden) && !excludedWords.some((k) => j.title.toLowerCase().includes(k)) && matchesFilters(j as Parameters<typeof matchesFilters>[0], resolved.filters, resolved.currency),
  );
  const verifiedWithin = (r: Range) => filtered.filter((j) => j.verification_status === "verified" && inRange(j, r, now)).length;
  const { range, expandedFrom, firstCount } = chooseRange(verifiedWithin, resolved.explicitRange);
  const inWindow = filtered.filter((j) => inRange(j, range, now));
  const merged = dedupeJobs(inWindow.map((j) => ({ ...j, source: j.source as DedupeItem["source"], employerHosted: employerHosted(j) })));
  return {
    rows: merged.map((m) => m.job as unknown as FeedJob),
    duplicatesOf: new Map(merged.map((m) => [m.job.id, m.duplicates as unknown as FeedJob[]])),
    range,
    expandedFrom,
    firstCount,
  };
}

/** Ranked by fit, title, recency, location and source, then split into tabs. */
export function rankFeed(
  rows: FeedJob[],
  savedJobs: FeedJob[],
  ctx: { resolved: ResolvedFeed; settings: FeedSettings; matches: Map<string, FeedMatch>; resume: ActiveResume | null; isReal: (j: FeedJob) => boolean; now: number },
): Record<FeedTab, FeedJob[]> {
  const { resolved, settings, matches, resume, now } = ctx;
  const resumeSkills = resume ? resume.profile.skills.map((s) => s.toLowerCase()) : [];
  const ranked = rows
    .map((j) => {
      const m = matches.get(j.id);
      const pre = resume && !m ? prefilterScore({ title: j.title, description: j.description }, resumeSkills, resume.applicant.years) : null;
      return {
        j,
        score: rankScore(j as Parameters<typeof rankScore>[0], m ? { score: m.score, tier: m.tier } : null, pre, {
          searched: resolved.searched.length ? resolved.searched : settings.job_titles,
          provinces: resolved.provinces,
          country: resolved.country,
          now,
        }),
      };
    })
    .sort((a, b) => b.score - a.score || b.j.posted_at.localeCompare(a.j.posted_at));
  const tier = (id: string) => matches.get(id)?.tier ?? "";
  return {
    all: ranked.filter((x) => tier(x.j.id) !== "excluded").map((x) => x.j),
    fit: ranked.filter((x) => ["strong", "good"].includes(tier(x.j.id))).map((x) => x.j),
    stretch: ranked.filter((x) => tier(x.j.id) === "stretch").map((x) => x.j),
    excluded: ranked.filter((x) => tier(x.j.id) === "excluded").map((x) => x.j),
    saved: savedJobs.filter(ctx.isReal),
  };
}

// ------------------------------------------------------------------ the whole feed

export type Feed = {
  resolved: ResolvedFeed;
  settings: FeedSettings;
  resume: ActiveResume | null;
  notices: SourceNotice[];
  /** Listings just fetched from a search source (not from its cache), still being checked. */
  newlyFetched: number;
  /** How many rows the query returned, to say when it hit MAX_FEED_ROWS. */
  loadedRows: number;
  excludedCount: number;
  range: Range;
  expandedFrom: Range | null;
  firstCount: number;
  tabs: Record<FeedTab, FeedJob[]>;
  duplicatesOf: Map<string, FeedJob[]>;
  matches: Map<string, FeedMatch>;
  states: Map<string, Status>;
  employers: Map<string, EmployerInfo>;
  providers: string[];
};

export type LoadFeedOptions = {
  /** When the search happens. Alerts pass the run's time so every search in a run agrees. */
  now?: number;
  /** Ask outside job sources for fresh results (the page) or only read stored ones (alerts). */
  refresh: boolean;
  /** The person searching (IP and browser), for job sources that require it (Careerjet). */
  client?: { ip: string; userAgent: string } | null;
  /** Lets a search that already has stored results show them now and refresh after the response (the page passes `after`). */
  background?: Background;
};

export async function loadFeed(db: Db, userId: string, query: FeedQuery, opts: LoadFeedOptions): Promise<Feed | { error: string }> {
  const now = opts.now ?? Date.now();
  const services = jobServices();
  const [{ data: settings }, resume, { data: stateRows }, { data: filterRows }] = await Promise.all([
    db.from("settings").select("job_titles, job_country, job_provinces, job_exclude_keywords").eq("user_id", userId).single(),
    loadActiveResume(db, userId),
    db.from("job_user_states").select("job_id, status").eq("user_id", userId),
    db.from("job_filters").select("kind, pattern").eq("user_id", userId),
  ]);
  const hidden = (filterRows ?? []) as HiddenFilter[];
  if (!settings) return { error: "settings" };
  // Without saved titles, the roles in the resume are searched, so results fit what the user has done.
  const resolved = resolveFeed(query, settings, titlesFromResume(resume?.profile));
  const { searched, explicitRange, filters, country, inCanada, whereProvince, where, page, shownProvinces } = resolved;

  // 1. Fresh results from the search providers (Jobicy; Adzuna if configured), cached per search. Page only.
  const registry = searchProviders();
  // The widest window this search can show: the one chosen, else the end of the automatic ladder.
  const windowRange: Range = explicitRange ?? RANGES.find((r) => r.key === AUTO_LADDER[AUTO_LADDER.length - 1])!;
  let notices: SourceNotice[] = [];
  if (opts.refresh && searched.length) {
    // Every searched title (up to a few) is asked for, side by side, not just the first.
    const runs = await Promise.all(
      searched.slice(0, MAX_PROVIDER_TITLES).map((what) =>
        refreshFromProviders(registry.providers, {
          what,
          country,
          where: whereProvince ? PROVINCE_NAMES[whereProvince] : where || null,
          // Job sites are asked for the last month at most ("any time" included): older listings are mostly filled.
          maxDaysOld: Math.min(30, Math.round(windowRange.hours / 24)),
          page: Math.max(1, Math.ceil((page * FEED_PAGE_SIZE) / 50)),
          client: opts.client ?? null,
        }, { background: opts.background }),
      ),
    );
    notices = mergeNotices(runs.flat());
    // New results start unverified: check their links right after this page is sent.
    if (registry.providers.length) scheduleVerifyPending(VERIFY_AFTER_SEARCH);
  }

  // 2. Every source, in one query: open, dated, in the window, verified (or unchecked when asked), open to the
  // country (there, or remote and open to it, its region or anywhere) and, in Canada, in the user's provinces.
  // Shared listings, plus only this user's own pasted postings.
  const statuses: ("verified" | "pending_validation")[] = filters.includeUnchecked ? ["verified", "pending_validation"] : ["verified"];
  const scope = scopeFor(country);
  const since = rangeSince(windowRange, now);
  const placeOr = `province.in.(${shownProvinces.join(",")}),and(province.is.null,remote.is.true)`;
  const visible = `user_id.is.null,user_id.eq.${userId}`;
  let query_ = db
    .from("jobs")
    .select(JOB_FIELDS)
    .or(visible)
    .gte("posted_at", since)
    .is("closed_at", null)
    .in("verification_status", statuses)
    .overlaps("countries", scope)
    .order("posted_at", { ascending: false })
    .limit(MAX_FEED_ROWS);
  let excludedQuery = db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .or(visible)
    .gte("posted_at", since)
    .is("closed_at", null)
    .in("verification_status", ["failed_validation", "unavailable", "expired"])
    .overlaps("countries", scope);
  // In Canada, the chosen provinces (and remote jobs); without a choice, all of Canada.
  if (inCanada && shownProvinces.length) {
    query_ = query_.or(placeOr);
    excludedQuery = excludedQuery.or(placeOr);
  }
  const tsq = searched.length ? titleQuery(searched) : null;
  if (tsq) {
    query_ = query_.textSearch("fts", tsq, { config: "english" });
    excludedQuery = excludedQuery.textSearch("fts", tsq, { config: "english" });
  }
  if (services.fixtures) {
    // Fixture mode (tests and demos): only fictional jobs and your own pastes, whatever real data the database holds.
    const fixtureOnly = `apply_url.like."${FIXTURE_LINK_PREFIX}*",user_id.not.is.null`;
    query_ = query_.or(fixtureOnly);
    excludedQuery = excludedQuery.or(fixtureOnly);
  }
  if (where && !whereProvince) {
    const like = `%${where.replace(/[%_,()]/g, " ")}%`;
    query_ = query_.or(`city.ilike.${like},location_text.ilike.${like}`);
  }
  const states = new Map((stateRows ?? []).map((s) => [s.job_id, s.status as Status]));
  const savedIds = (stateRows ?? []).filter((s) => s.status !== "dismissed").map((s) => s.job_id);
  const [fresh, excluded, ...savedParts] = await Promise.all([
    query_,
    excludedQuery,
    ...chunk(savedIds.slice(0, MAX_SAVED), 100).map((ids) => db.from("jobs").select(JOB_FIELDS).in("id", ids).or(visible)),
  ]);
  if (fresh.error || savedParts.some((p) => p.error)) return { error: "postings" };
  const freshRows = (fresh.data ?? []) as unknown as FeedJob[];
  const savedJobs = savedParts.flatMap((p) => (p.data ?? []) as unknown as FeedJob[]);

  // Where each posting came from (and a last guard: sample employers never show outside fixture mode).
  const employerIds = [...new Set([...freshRows, ...savedJobs].map((j) => j.employer_id).filter((id): id is string => Boolean(id)))];
  const employerParts = await Promise.all(chunk(employerIds, 100).map((ids) => db.from("employers").select("id, name, ats, careers_url").in("id", ids)));
  const employers = new Map<string, EmployerInfo>(employerParts.flatMap((p) => (p.data ?? []).map((e) => [e.id, { name: e.name, ats: e.ats as AtsKind, careers_url: e.careers_url }] as const)));
  const isReal = (j: FeedJob) => services.fixtures || ((!j.employer_id || employers.get(j.employer_id)?.ats !== "fixture") && (Boolean(j.user_id) || !isFixtureLink(j.apply_url)));

  // 3–4. Filters, freshness window, one copy of each job.
  const selection = selectFeed(freshRows, { resolved, settings, states, isReal, now, hidden });

  // 5. Fit: saved checks, and the rest now (rules and database queries; no outside calls).
  const matches = new Map<string, FeedMatch>();
  const scoreIds = [...new Set([...selection.rows, ...savedJobs].map((j) => j.id))];
  if (resume) {
    const parts = await Promise.all(chunk(scoreIds, 100).map((part) => db.from("job_matches").select("job_id, fit_score, tier, summary, requirement_results, updated_at").eq("user_id", userId).eq("resume_id", resume.id).in("job_id", part)));
    for (const m of parts.flatMap((p) => p.data ?? [])) if (Date.parse(m.updated_at) >= Date.parse(resume.updatedAt)) matches.set(m.job_id, { tier: m.tier, score: m.fit_score, summary: m.summary, results: m.requirement_results });
    const todo = scoreIds.filter((id) => !matches.has(id)).slice(0, MAX_SCORED_PER_VIEW);
    if (todo.length) {
      await scoreJobs(db, userId, resume, todo, services.embedder);
      const again = await Promise.all(chunk(todo, 100).map((part) => db.from("job_matches").select("job_id, fit_score, tier, summary, requirement_results").eq("user_id", userId).eq("resume_id", resume.id).in("job_id", part)));
      for (const m of again.flatMap((p) => p.data ?? [])) matches.set(m.job_id, { tier: m.tier, score: m.fit_score, summary: m.summary, results: m.requirement_results });
    }
  }

  // 6. Rank and split into tabs.
  const tabs = rankFeed(selection.rows, savedJobs, { resolved, settings, matches, resume, isReal, now });

  return {
    resolved,
    settings,
    resume,
    notices,
    newlyFetched: notices.filter((n) => n.outcome === "ok").reduce((sum, n) => sum + n.count, 0),
    loadedRows: freshRows.length,
    excludedCount: excluded.count ?? 0,
    range: selection.range,
    expandedFrom: selection.expandedFrom,
    firstCount: selection.firstCount,
    tabs,
    duplicatesOf: selection.duplicatesOf,
    matches,
    states,
    employers,
    providers: registry.providers.map((p) => p.name),
  };
}
