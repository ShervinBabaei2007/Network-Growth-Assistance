import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCandidate } from "@/lib/classify";
import { localDate, startOfLocalDay } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { buildTodaysQueue } from "./daily-queue";
import { errorMessage, log } from "@/lib/server/log";

type Client = SupabaseClient<Database>;
export const DAILY_JOB = "daily";
/** A run still marked "running" after this long is assumed to have crashed. */
const STALE_RUN_MS = 15 * 60_000;
const ATTEMPTS = 2;

export type DailyStats = {
  reclassified: number;
  markedPending: number;
  queued: number;
  blocked: string | null;
  shortfalls: number;
  stalePending: number;
};

/**
 * Claims today's run for a user. Returns false if it already succeeded today (or is
 * still running), so a repeated cron call does nothing. `force` re-runs a finished day.
 */
async function claim(db: Client, userId: string, runDate: string, force: boolean): Promise<boolean> {
  const { data: inserted, error } = await db
    .from("job_runs")
    .upsert({ user_id: userId, job: DAILY_JOB, run_date: runDate }, { onConflict: "user_id,job,run_date", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  if (inserted.length > 0) return true;

  const { data: existing, error: readError } = await db
    .from("job_runs")
    .select("id, status, started_at")
    .eq("user_id", userId)
    .eq("job", DAILY_JOB)
    .eq("run_date", runDate)
    .single();
  if (readError) throw readError;

  const crashed = existing.status === "running" && Date.now() - Date.parse(existing.started_at) > STALE_RUN_MS;
  const retry = existing.status === "failed" || crashed || (force && existing.status !== "running");
  if (!retry) return false;

  // Only take over if nobody else changed it in the meantime.
  const { data: taken, error: takeError } = await db
    .from("job_runs")
    .update({ status: "running", started_at: new Date().toISOString(), finished_at: null, error: null })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .eq("started_at", existing.started_at)
    .select("id");
  if (takeError) throw takeError;
  return taken.length > 0;
}

async function reclassifyNew(db: Client, userId: string, countUbcoAsUbc: boolean, autoApprove: boolean): Promise<number> {
  const { data, error } = await db
    .from("candidates")
    .select("id, raw_school_text, raw_program_text")
    .eq("user_id", userId)
    .eq("status", "new")
    .limit(2000);
  if (error) throw error;
  for (const c of data) {
    const r = classifyCandidate(c.raw_school_text, c.raw_program_text, { countUbcoAsUbc });
    const recognised = r.university.confidence === "confirmed" && r.discipline.confidence === "confirmed";
    const { error: upError } = await db
      .from("candidates")
      .update({
        university: r.university.value,
        discipline: r.discipline.value,
        university_confidence: r.university.confidence,
        discipline_confidence: r.discipline.confidence,
        status: autoApprove && recognised ? "approved" : "awaiting_review",
      })
      .eq("id", c.id)
      .eq("user_id", userId);
    if (upError) throw upError;
  }
  return data.length;
}

/** "Invitation sent" is for today's sends; older open invitations are "pending". */
async function markOlderSentAsPending(db: Client, userId: string, startOfToday: Date): Promise<number> {
  const { data, error } = await db
    .from("invitations")
    .select("candidate_id")
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .lt("sent_at", startOfToday.toISOString())
    .limit(5000);
  if (error) throw error;
  let changed = 0;
  const ids = data.map((r) => r.candidate_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: updated, error: upError } = await db
      .from("candidates")
      .update({ status: "invitation_pending" })
      .eq("user_id", userId)
      .eq("status", "invitation_sent")
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (upError) throw upError;
    changed += updated.length;
  }
  return changed;
}

async function countStalePending(db: Client, userId: string, days: number): Promise<number> {
  const { count, error } = await db
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .lt("sent_at", new Date(Date.now() - days * 86_400_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function runSteps(db: Client, userId: string, now: Date): Promise<DailyStats> {
  const { data: s, error } = await db
    .from("settings")
    .select("timezone, count_ubco_as_ubc, stale_pending_days, auto_approve")
    .eq("user_id", userId)
    .single();
  if (error) throw error;

  const today = localDate(now, s.timezone);
  const reclassified = await reclassifyNew(db, userId, s.count_ubco_as_ubc, s.auto_approve);
  const markedPending = await markOlderSentAsPending(db, userId, startOfLocalDay(today, s.timezone));
  // Stops preparing candidates for completed categories and respects pause/limits.
  const { plan, queued } = await buildTodaysQueue(db, userId, now);
  const stalePending = await countStalePending(db, userId, s.stale_pending_days);

  return { reclassified, markedPending, queued, blocked: plan.blocked, shortfalls: plan.shortfalls.length, stalePending };
}

/**
 * Runs the daily job for one user. Only does work LinkedIn permits without the
 * user: nothing here contacts LinkedIn. Idempotent per user and local day.
 */
export async function runDailyJobForUser(
  db: Client,
  userId: string,
  { now = new Date(), force = false }: { now?: Date; force?: boolean } = {},
): Promise<{ status: "skipped" | "succeeded" | "failed"; stats?: DailyStats; error?: string }> {
  const { data: s, error } = await db.from("settings").select("timezone").eq("user_id", userId).single();
  if (error) throw error;
  const runDate = localDate(now, s.timezone);

  if (!(await claim(db, userId, runDate, force))) return { status: "skipped" };

  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const stats = await runSteps(db, userId, now);
      await db
        .from("job_runs")
        .update({ status: "succeeded", stats: { ...stats }, finished_at: new Date().toISOString(), error: null })
        .eq("user_id", userId)
        .eq("job", DAILY_JOB)
        .eq("run_date", runDate);
      await db.from("activity_logs").insert({ user_id: userId, kind: "job.daily", payload: { ...stats } });
      return { status: "succeeded", stats };
    } catch (e) {
      lastError = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Unknown error";
    }
  }

  await db
    .from("job_runs")
    .update({ status: "failed", error: lastError.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("job", DAILY_JOB)
    .eq("run_date", runDate);
  await db.from("activity_logs").insert({ user_id: userId, kind: "job.daily.failed", payload: { error: lastError.slice(0, 200) } });
  return { status: "failed", error: lastError };
}

/** Runs the job for every workspace; one user's failure never stops the others. */
export async function runDailyJobForAll(db: Client, now = new Date()) {
  const summary = { users: 0, succeeded: 0, skipped: 0, failed: 0 };
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("settings").select("user_id").order("user_id").range(from, from + 499);
    if (error) throw error;
    for (const { user_id } of data) {
      summary.users++;
      try {
        const r = await runDailyJobForUser(db, user_id, { now });
        summary[r.status]++;
      } catch (e) {
        summary.failed++;
        log("error", "cron.daily", "user_run_failed", { message: errorMessage(e) });
      }
    }
    if (data.length < 500) return summary;
  }
}
