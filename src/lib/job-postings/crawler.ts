import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { adapterFor } from "./ats";
import { BoardError, canadianPlace, type AtsAdapter, type AtsJob } from "./ats/types";
import { toVector, type Embedder } from "./embeddings";
import { FIXTURE_EMPLOYERS } from "./fixtures";
import { extractRequirements } from "./requirements";
import type { Db } from "./service";

/**
 * Reads employers' public job boards on a schedule and keeps the shared `jobs` table
 * current. Runs with the admin client from the cron route. Outside requests grow with
 * the number of employers, never with the number of users.
 */

type Employer = Pick<Database["public"]["Tables"]["employers"]["Row"], "id" | "name" | "ats" | "board_token" | "etag" | "last_crawled_at" | "failures" | "canada_jobs">;

export const ACTIVE_INTERVAL_MIN = 30;
export const QUIET_INTERVAL_MIN = 6 * 60;
const MAX_BACKOFF_MIN = 24 * 60;
const LEASE_MIN = 15;
const BOARDS_PER_TICK = 150;
const CONCURRENCY = 20;
const DETAILS_PER_BOARD = 30;
const EMBED_PER_TICK = 400;

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

/** In fixture mode, the sample employers exist and are due, so every crawl has something to read. */
export async function ensureFixtureEmployers(db: Db) {
  await db.from("employers").upsert(
    FIXTURE_EMPLOYERS.map((e) => ({ name: e.name, ats: "fixture" as const, board_token: e.token, careers_url: `https://jobs.example.com/${e.token}`, next_crawl_at: new Date().toISOString() })),
    { onConflict: "ats,board_token" },
  );
}

async function withDescriptions(adapter: AtsAdapter, token: string, jobs: { job: AtsJob; needs: boolean }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!adapter.fetchDetail) return out;
  const wanted = jobs.filter((j) => j.needs).slice(0, DETAILS_PER_BOARD);
  for (let i = 0; i < wanted.length; i += 5) {
    const batch = wanted.slice(i, i + 5);
    const texts = await Promise.all(batch.map(({ job }) => adapter.fetchDetail!(token, job.externalId, { signal: AbortSignal.timeout(10_000) }).catch(() => null)));
    batch.forEach(({ job }, k) => texts[k] && out.set(job.externalId, texts[k]!));
  }
  return out;
}

/** Reads one board and updates its jobs. Returns counts; never throws. */
export async function crawlEmployer(db: Db, emp: Employer): Promise<{ status: "ok" | "not_modified" | "failed"; newJobs: number; closedJobs: number }> {
  const adapter = adapterFor(emp.ats);
  try {
    const board = await adapter.fetchBoard(emp.board_token, { etag: emp.etag, signal: AbortSignal.timeout(20_000) });
    if (board.notModified) {
      await db.from("employers").update({ last_crawled_at: new Date().toISOString(), next_crawl_at: minutes(emp.canada_jobs > 0 ? ACTIVE_INTERVAL_MIN : QUIET_INTERVAL_MIN), failures: 0, last_error: null, status: "active" }).eq("id", emp.id);
      // Jobs on an unchanged board are still there.
      await db.from("jobs").update({ last_seen_at: new Date().toISOString() }).eq("employer_id", emp.id).is("closed_at", null);
      return { status: "not_modified", newJobs: 0, closedJobs: 0 };
    }

    const canadian = board.jobs.flatMap((job) => {
      const place = canadianPlace(job.places, job.remote);
      return place ? [{ job, place }] : [];
    });
    const { data: existingRows } = await db.from("jobs").select("id, external_id, posted_at, date_source, first_seen_at, description, closed_at").eq("employer_id", emp.id);
    const existing = new Map((existingRows ?? []).map((r) => [r.external_id, r]));
    const firstCrawl = emp.last_crawled_at === null;
    const details = await withDescriptions(
      adapter,
      emp.board_token,
      canadian.map(({ job }) => ({ job, needs: job.description === null && !existing.get(job.externalId)?.description })),
    );

    const now = new Date();
    const rows = canadian.map(({ job, place }) => {
      const old = existing.get(job.externalId);
      // A job keeps the date it was first given. Sample boards are re-dated each read so tests stay "recent".
      const dated = old && emp.ats !== "fixture" ? { postedAt: old.posted_at, dateSource: old.date_source as DatedJob["dateSource"] } : dateJob(job, firstCrawl && !old, now);
      return {
        employer_id: emp.id,
        external_id: job.externalId.slice(0, 200),
        company: (job.company ?? emp.name).slice(0, 300),
        title: job.title.trim().slice(0, 300),
        city: place.city?.slice(0, 120) ?? null,
        province: place.province,
        location_text: place.locationText || null,
        remote: place.remote,
        posted_at: dated.postedAt,
        date_source: dated.dateSource,
        first_seen_at: old?.first_seen_at ?? now.toISOString(),
        last_seen_at: now.toISOString(),
        closed_at: null,
        apply_url: job.applyUrl.slice(0, 2000),
        description: (job.description ?? details.get(job.externalId) ?? old?.description ?? "").slice(0, 60_000),
        salary: job.salary?.slice(0, 200) ?? null,
        employment_type: job.employmentType?.slice(0, 100) ?? null,
        department: job.department?.slice(0, 200) ?? null,
      };
    });
    const valid = rows.filter((r) => /^https?:\/\//i.test(r.apply_url) && r.title);

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

    const seen = new Set(valid.map((r) => r.external_id));
    const gone = (existingRows ?? []).filter((r) => r.closed_at === null && !seen.has(r.external_id)).map((r) => r.id);
    if (gone.length) await db.from("jobs").update({ closed_at: now.toISOString() }).in("id", gone);

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
        next_crawl_at: minutes(valid.length > 0 ? ACTIVE_INTERVAL_MIN : QUIET_INTERVAL_MIN),
        failures: 0,
        last_error: null,
        status: "active",
        etag: board.etag?.slice(0, 300) ?? null,
        canada_jobs: valid.length,
      })
      .eq("id", emp.id);
    return { status: "ok", newJobs, closedJobs: gone.length };
  } catch (e) {
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
  const { data: due } = await db
    .from("employers")
    .select("id, name, ats, board_token, etag, last_crawled_at, failures, canada_jobs")
    .neq("status", "disabled")
    .lte("next_crawl_at", new Date().toISOString())
    .order("next_crawl_at")
    .limit(opts.maxBoards ?? BOARDS_PER_TICK);
  const boards = due ?? [];
  if (boards.length) await db.from("employers").update({ next_crawl_at: minutes(LEASE_MIN) }).in("id", boards.map((b) => b.id));

  let next = 0;
  const worker = async () => {
    while (next < boards.length && Date.now() < opts.deadline) {
      const emp = boards[next++];
      const r = await crawlEmployer(db, emp);
      summary.boards++;
      if (r.status === "not_modified") summary.notModified++;
      if (r.status === "failed") summary.failed++;
      summary.newJobs += r.newJobs;
      summary.closedJobs += r.closedJobs;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, boards.length) }, worker));
  // Boards not reached before the deadline are due again right away.
  const unreached = boards.slice(next).map((b) => b.id);
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
