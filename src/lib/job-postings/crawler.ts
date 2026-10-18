import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { adapterFor } from "./ats";
import { BoardError, jobPlace, RateLimitedError, wantedScope, type AtsAdapter, type AtsJob, type JobDetail, type JobPlace } from "./ats/types";
import { jobDedupeKey, simhash64 } from "./dedupe";
import { toVector, type Embedder } from "./embeddings";
import { FIXTURE_EMPLOYERS } from "./fixtures";
import { jobLevel, workplaceFromText } from "./levels";
import { extractRequirements } from "./requirements";
import type { Db } from "./service";
import { checkJobLink } from "./verify-url";

/**
 * Reads employers' public job boards on a schedule and keeps the shared `jobs` table
 * current. Runs with the admin client from the cron route. Outside requests grow with
 * the number of employers, never with the number of users.
 *
 * Boards list jobs worldwide; only jobs open to a country some user searches are kept
 * (jobs there, or remote jobs open to it, its region or anywhere), so storage grows with
 * the countries people choose, not with every board's whole list.
 */

/** The countries users search (each user's chosen country). Canada when nobody has chosen. */
export async function searchedCountries(db: Db, fixtures = false): Promise<string[]> {
  const { data } = await db.rpc("job_search_countries");
  const list = (data ?? []).filter((c): c is string => typeof c === "string");
  return [...new Set([...(list.length ? list : ["CA"]), ...(fixtures ? ["CA"] : [])])];
}

type Employer = Pick<Database["public"]["Tables"]["employers"]["Row"], "id" | "name" | "ats" | "board_token" | "etag" | "last_crawled_at" | "failures" | "matching_jobs" | "careers_url">;

export const ACTIVE_INTERVAL_MIN = 30;
export const QUIET_INTERVAL_MIN = 6 * 60;
const MAX_BACKOFF_MIN = 24 * 60;
const LEASE_MIN = 15;
const BOARDS_PER_TICK = 150;
const CONCURRENCY = 30;
const DETAILS_PER_BOARD = 30;
const EMBED_PER_TICK = 400;
/** How long one board read may take, unless its adapter says otherwise. */
const BOARD_TIMEOUT_MS = 20_000;

export type CrawlSummary = { boards: number; notModified: number; failed: number; newJobs: number; closedJobs: number; embedded: number };

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Minutes until the next crawl after `failures` failures in a row: 30, 60, 120… up to a day. */
export function backoffMinutes(failures: number): number {
  return Math.min(MAX_BACKOFF_MIN, ACTIVE_INTERVAL_MIN * 2 ** Math.max(0, failures - 1));
}

export type DatedJob = { postedAt: string; dateSource: "source" | "first_seen" | "unknown" };

/**
 * When a job was posted. The board's own time when it gives one. Otherwise, a job that
 * appears on a board we've read before was posted since that read ("first_seen"); a job
 * already there the first time we look has an unknown age and is never shown as recent.
 */
export function dateJob(job: Pick<AtsJob, "postedAt" | "precision">, firstCrawl: boolean, now = new Date()): DatedJob {
  if (job.postedAt && job.precision === "time" && !Number.isNaN(Date.parse(job.postedAt))) return { postedAt: new Date(job.postedAt).toISOString(), dateSource: "source" };
  if (!firstCrawl) return { postedAt: now.toISOString(), dateSource: "first_seen" };
  if (job.postedAt && !Number.isNaN(Date.parse(job.postedAt))) return { postedAt: new Date(job.postedAt).toISOString(), dateSource: "unknown" };
  return { postedAt: now.toISOString(), dateSource: "unknown" };
}

/**
 * Which boards a crawl may read. Sample boards are read only in fixture mode, so fictional
 * jobs never reach real users; and in fixture mode only sample boards are read: every board
 * is served canned data there, so a real board would look empty and its real jobs would be
 * closed as "no longer listed".
 */
export function dueBoardKinds(fixtures: boolean): { only: "fixture"; never?: undefined } | { only?: undefined; never: "fixture" } {
  return fixtures ? { only: "fixture" } : { never: "fixture" };
}

/** In fixture mode, the sample employers exist and are due, so every crawl has something to read. */
export async function ensureFixtureEmployers(db: Db) {
  await db.from("employers").upsert(
    FIXTURE_EMPLOYERS.map((e) => ({ name: e.name, ats: "fixture" as const, board_token: e.token, careers_url: `https://jobs.example.com/${e.token}`, next_crawl_at: new Date().toISOString() })),
    { onConflict: "ats,board_token" },
  );
}

async function withDetails(adapter: AtsAdapter, token: string, jobs: { job: AtsJob; needs: boolean }[], deadline = Number.POSITIVE_INFINITY): Promise<Map<string, JobDetail>> {
  const out = new Map<string, JobDetail>();
  if (!adapter.fetchDetail) return out;
  const wanted = jobs.filter((j) => j.needs).slice(0, adapter.detailsPerRead ?? DETAILS_PER_BOARD);
  // Details left unread now are read on the board's next crawl.
  for (let i = 0; i < wanted.length && Date.now() + 10_000 < deadline; i += 5) {
    const batch = wanted.slice(i, i + 5);
    const details = await Promise.all(batch.map(({ job }) => adapter.fetchDetail!(token, job.externalId, { signal: AbortSignal.timeout(10_000) }).catch(() => null)));
    batch.forEach(({ job }, k) => details[k] && out.set(job.externalId, details[k]!));
  }
  return out;
}

type KnownPlace = Pick<Database["public"]["Tables"]["jobs"]["Row"], "city" | "province" | "country" | "countries" | "location_text" | "remote">;

/**
 * Where a job is: the posting's own detail when it was read (exact places), else the list,
 * unless the list is vaguer than an earlier read ("2 Locations" after the detail named
 * them), in which case the earlier place stands.
 */
export function bestPlace(listed: JobPlace, fromDetail: JobPlace | null, old: KnownPlace | null | undefined): JobPlace {
  if (fromDetail) return fromDetail;
  if (old && !listed.city && !listed.province && (old.city || old.province) && (!listed.country || listed.country === old.country)) {
    return { country: old.country, province: old.province, city: old.city, locationText: old.location_text ?? listed.locationText, remote: old.remote, countries: old.countries.length ? old.countries : listed.countries };
  }
  return listed;
}

/**
 * Whether a board job's link can be shown as verified. The evidence is the employer's own
 * board listing the job in this read, with a link that belongs to that board or employer.
 */
export function verifyBoardLink(applyUrl: string | null, emp: Pick<Employer, "ats" | "board_token" | "careers_url" | "name">, externalId: string, company: string | null, now: Date) {
  const check = checkJobLink(applyUrl, { source: "ats", ats: emp.ats, boardToken: emp.board_token, externalId, careersUrl: emp.careers_url, company: company ?? emp.name });
  return check.ok
    ? { verification_status: "verified" as const, verified_at: now.toISOString(), verification_note: null, canonical_url: check.canonical }
    : { verification_status: check.status, verified_at: null, verification_note: check.reason.slice(0, 300), canonical_url: null };
}

/** Reads one board and updates its jobs. Returns counts; never throws. */
export async function crawlEmployer(
  db: Db,
  emp: Employer,
  wanted: ReadonlySet<string> = wantedScope(["CA"]),
  countries: readonly string[] = ["CA"],
  deadline = Number.POSITIVE_INFINITY,
): Promise<{ status: "ok" | "not_modified" | "failed"; newJobs: number; closedJobs: number }> {
  const adapter = adapterFor(emp.ats);
  const activeInterval = adapter.activeIntervalMin ?? ACTIVE_INTERVAL_MIN;
  try {
    const board = await adapter.fetchBoard(emp.board_token, { etag: emp.etag, signal: AbortSignal.timeout(adapter.boardTimeoutMs ?? BOARD_TIMEOUT_MS), countries });
    if (board.notModified) {
      await db.from("employers").update({ last_crawled_at: new Date().toISOString(), next_crawl_at: minutes(emp.matching_jobs > 0 ? activeInterval : QUIET_INTERVAL_MIN), failures: 0, last_error: null, status: "active" }).eq("id", emp.id);
      // Jobs on an unchanged board are still there.
      await db.from("jobs").update({ last_seen_at: new Date().toISOString() }).eq("employer_id", emp.id).is("closed_at", null);
      return { status: "not_modified", newJobs: 0, closedJobs: 0 };
    }

    const kept = board.jobs.flatMap((job) => {
      const place = jobPlace(job.places, job.remote, wanted);
      return place ? [{ job, place }] : [];
    });
    const { data: existingRows } = await db
      .from("jobs")
      .select("id, external_id, posted_at, date_source, first_seen_at, description, description_trimmed_at, desc_fingerprint, closed_at, apply_url, city, province, country, countries, location_text, remote")
      .eq("employer_id", emp.id);
    const existing = new Map((existingRows ?? []).map((r) => [r.external_id, r]));
    const firstCrawl = emp.last_crawled_at === null;
    const details = await withDetails(
      adapter,
      emp.board_token,
      kept.map(({ job }) => {
        const old = existing.get(job.externalId);
        return { job, needs: (job.description === null && !old?.description) || (job.applyUrl === null && !old?.apply_url) };
      }),
      deadline,
    );

    const now = new Date();
    const rows = kept.map(({ job, place: listed }) => {
      const old = existing.get(job.externalId);
      const detail = details.get(job.externalId);
      const place = bestPlace(listed, detail?.places ? jobPlace(detail.places, job.remote, wanted) : null, old);
      // A job keeps the date it was first given. Sample boards are re-dated each read so tests stay "recent".
      const dated = old && emp.ats !== "fixture" ? { postedAt: old.posted_at, dateSource: old.date_source as DatedJob["dateSource"] } : dateJob(job, firstCrawl && !old, now);
      // Links come only from the board: the list, the posting's own detail, or an earlier read of either.
      const applyUrl = job.applyUrl ?? detail?.applyUrl ?? old?.apply_url ?? null;
      const company = (job.company ?? emp.name).slice(0, 300);
      const title = job.title.trim().slice(0, 300);
      const incoming = job.description ?? detail?.description ?? null;
      // An old posting that was shortened to save space stays shortened while the board's text is unchanged, so the
      // daily shortening isn't undone by every read. A changed text replaces it in full.
      const keepShortened = Boolean(old?.description_trimmed_at && (incoming === null || incoming.slice(0, old.description.length) === old.description));
      const description = keepShortened ? old!.description : (incoming ?? old?.description ?? "").slice(0, 60_000);
      const level = jobLevel(title, job.level);
      const pay = job.salaryRange;
      return {
        employer_id: emp.id,
        source: "ats" as const,
        external_id: job.externalId.slice(0, 200),
        company,
        title,
        city: place.city?.slice(0, 120) ?? null,
        province: place.province,
        country: place.country,
        countries: place.countries.slice(0, 60),
        location_text: place.locationText || null,
        remote: place.remote,
        workplace_type: job.workplace ?? workplaceFromText(place.locationText, title) ?? (place.remote ? "remote" : null),
        experience_level: level.level,
        level_source: level.source,
        posted_at: dated.postedAt,
        date_source: dated.dateSource,
        date_note: dated.dateSource === "source" ? (job.dateNote ?? null) : null,
        first_seen_at: old?.first_seen_at ?? now.toISOString(),
        last_seen_at: now.toISOString(),
        closed_at: null,
        apply_url: applyUrl?.slice(0, 2000) ?? null,
        ...verifyBoardLink(applyUrl, emp, job.externalId, company, now),
        description,
        salary: job.salary?.slice(0, 200) ?? null,
        salary_min: pay?.min ?? null,
        salary_max: pay?.max ?? null,
        salary_currency: pay?.currency && /^[A-Z]{3}$/.test(pay.currency) ? pay.currency : null,
        salary_period: pay?.period ?? null,
        employment_type: job.employmentType?.slice(0, 100) ?? null,
        department: job.department?.slice(0, 200) ?? null,
        dedupe_key: jobDedupeKey({ company, title, city: place.city, province: place.province, remote: place.remote }),
        desc_fingerprint: keepShortened ? old!.desc_fingerprint : simhash64(description),
        description_trimmed_at: keepShortened ? old!.description_trimmed_at : null,
      };
    });
    const valid = rows.filter((r) => r.title);

    let newJobs = 0;
    const needRequirements: { id: string; description: string }[] = [];
    for (let i = 0; i < valid.length; i += 200) {
      const { data: saved, error } = await db.from("jobs").upsert(valid.slice(i, i + 200), { onConflict: "employer_id,external_id" }).select("id, external_id, description");
      if (error) throw new BoardError(`Couldn't save jobs: ${error.message}`);
      for (const s of saved ?? []) {
        const old = existing.get(s.external_id);
        if (!old) newJobs++;
        // Requirements are read once, as soon as the job has a description.
        if (s.description && (!old || !old.description)) needRequirements.push({ id: s.id, description: s.description });
      }
    }

    // A partial read (the board has more jobs than we page through) can't tell us what closed.
    // Every job on the board counts as still listed, kept here or not.
    const seen = new Set(board.jobs.map((j) => j.externalId.slice(0, 200)));
    const gone = board.partial ? [] : (existingRows ?? []).filter((r) => r.closed_at === null && !seen.has(r.external_id)).map((r) => r.id);
    if (gone.length) await db.from("jobs").update({ closed_at: now.toISOString(), verification_status: "expired", verified_at: null, verification_note: "No longer listed on the employer's board" }).in("id", gone);

    for (const job of needRequirements) {
      const reqs = extractRequirements(job.description);
      await db.from("job_requirements").delete().eq("job_id", job.id);
      if (reqs.length) {
        await db.from("job_requirements").insert(
          reqs.map((r, idx) => ({ job_id: job.id, idx, text: r.text.slice(0, 400), kind: r.kind, category: r.category, years: r.years, degree_level: r.degreeLevel })),
        );
      }
    }

    await db
      .from("employers")
      .update({
        last_crawled_at: now.toISOString(),
        next_crawl_at: minutes(valid.length > 0 ? activeInterval : QUIET_INTERVAL_MIN),
        failures: 0,
        last_error: null,
        status: "active",
        etag: board.etag?.slice(0, 300) ?? null,
        matching_jobs: valid.length,
      })
      .eq("id", emp.id);
    return { status: "ok", newJobs, closedJobs: gone.length };
  } catch (e) {
    if (e instanceof RateLimitedError) {
      // Being asked to wait isn't a failure of the board.
      await db
        .from("employers")
        .update({ last_error: e.message, next_crawl_at: new Date(Date.now() + Math.max(60, e.retryAfterSeconds ?? ACTIVE_INTERVAL_MIN * 60) * 1000).toISOString() })
        .eq("id", emp.id);
      return { status: "failed", newJobs: 0, closedJobs: 0 };
    }
    const failures = emp.failures + 1;
    const gone = e instanceof BoardError && e.gone;
    await db
      .from("employers")
      .update({
        failures,
        last_error: (e instanceof Error ? e.message : "Crawl failed.").slice(0, 300),
        next_crawl_at: minutes(gone ? MAX_BACKOFF_MIN : backoffMinutes(failures)),
        status: failures >= 10 ? "disabled" : failures >= 3 || gone ? "failing" : "active",
      })
      .eq("id", emp.id);
    return { status: "failed", newJobs: 0, closedJobs: 0 };
  }
}

/** Embeds requirements that don't have a vector yet. */
export async function embedPending(db: Db, embedder: Embedder, limit = EMBED_PER_TICK): Promise<number> {
  if (!embedder.enabled) return 0;
  const { data } = await db.rpc("pending_requirement_embeddings", { p_limit: limit });
  if (!data?.length) return 0;
  const vectors = await embedder.embed(data.map((r) => r.text));
  if (!vectors) return 0;
  let done = 0;
  // Updates, not upserts: only the embedding changes.
  for (let i = 0; i < data.length; i += 25) {
    const chunk = data.slice(i, i + 25);
    const results = await Promise.all(chunk.map((r, k) => db.from("job_requirements").update({ embedding: toVector(vectors[i + k]) }).eq("job_id", r.job_id).eq("idx", r.idx)));
    done += results.filter((r) => !r.error).length;
  }
  return done;
}

/**
 * One tick: crawls the boards due soonest until the deadline, then embeds new
 * requirements. Boards are leased first so overlapping ticks don't read them twice.
 */
export async function crawlDue(db: Db, opts: { deadline: number; embedder: Embedder; fixtures: boolean; maxBoards?: number }): Promise<CrawlSummary> {
  if (opts.fixtures) await ensureFixtureEmployers(db);
  const summary: CrawlSummary = { boards: 0, notModified: 0, failed: 0, newJobs: 0, closedJobs: 0, embedded: 0 };
  const { data: run } = await db.from("job_crawl_runs").insert({}).select("id").single();
  let dueQuery = db
    .from("employers")
    .select("id, name, ats, board_token, etag, last_crawled_at, failures, matching_jobs, careers_url")
    .neq("status", "disabled");
  const kinds = dueBoardKinds(opts.fixtures);
  dueQuery = kinds.only ? dueQuery.eq("ats", kinds.only) : dueQuery.neq("ats", kinds.never);
  const { data: due } = await dueQuery
    .lte("next_crawl_at", new Date().toISOString())
    .order("next_crawl_at")
    .limit(opts.maxBoards ?? BOARDS_PER_TICK);
  const boards = due ?? [];
  const countries = await searchedCountries(db, opts.fixtures);
  const wanted = wantedScope(countries);
  if (boards.length) await db.from("employers").update({ next_crawl_at: minutes(LEASE_MIN) }).in("id", boards.map((b) => b.id));

  let next = 0;
  const notStarted: string[] = [];
  const worker = async () => {
    while (next < boards.length && Date.now() < opts.deadline) {
      const emp = boards[next++];
      // A board that can't be read in the time left waits for the next tick instead of overrunning this one.
      if (Date.now() + (adapterFor(emp.ats).boardTimeoutMs ?? BOARD_TIMEOUT_MS) > opts.deadline) {
        notStarted.push(emp.id);
        continue;
      }
      const r = await crawlEmployer(db, emp, wanted, countries, opts.deadline);
      summary.boards++;
      if (r.status === "not_modified") summary.notModified++;
      if (r.status === "failed") summary.failed++;
      summary.newJobs += r.newJobs;
      summary.closedJobs += r.closedJobs;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, boards.length) }, worker));
  // Boards not reached before the deadline are due again right away.
  const unreached = [...notStarted, ...boards.slice(next).map((b) => b.id)];
  if (unreached.length) await db.from("employers").update({ next_crawl_at: new Date().toISOString() }).in("id", unreached);

  if (Date.now() < opts.deadline) summary.embedded = await embedPending(db, opts.embedder);
  if (run) {
    await db
      .from("job_crawl_runs")
      .update({ finished_at: new Date().toISOString(), boards: summary.boards, not_modified: summary.notModified, failed: summary.failed, new_jobs: summary.newJobs, closed_jobs: summary.closedJobs, embedded: summary.embedded })
      .eq("id", run.id);
  }
  return summary;
}
