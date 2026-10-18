import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobForAll } from "@/lib/jobs/daily";
import { serverEnv } from "@/lib/env";
import { DEFAULT_DB_LIMIT_MB, storageAlert, storageStatus, type StorageUsage } from "@/lib/ops/storage";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { errorMessage, log } from "@/lib/server/log";
import { createAdminClient } from "@/lib/supabase/admin";

// Hobby-plan functions may run for up to 60 seconds.
export const maxDuration = 60;

/** Called once a day by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const summary = await runDailyJobForAll(admin);
    // Jobs housekeeping: close jobs gone from their boards and delete old ones. Never fails the daily job.
    const { data: pruned, error: pruneError } = await admin.rpc("prune_jobs");
    if (pruneError) log("error", "cron.daily", "jobs_prune_failed", { message: pruneError.message });
    // Storage: shorten old postings, drop unused vectors, and warn the operator when the database fills up. Never fails the daily job.
    const { error: trimError } = await admin.rpc("trim_stale_job_data");
    if (trimError) log("error", "cron.daily", "storage_trim_failed", { message: trimError.message });
    await warnIfStorageHigh(admin);
    const { data: limitsPruned, error: limitsError } = await admin.rpc("prune_rate_limits");
    if (limitsError) log("error", "cron.daily", "rate_limits_prune_failed", { message: limitsError.message });
    const { error: monitoringError } = await admin.rpc("prune_monitoring");
    if (monitoringError) log("error", "cron.daily", "monitoring_prune_failed", { message: monitoringError.message });
    const { error: notesError } = await admin.rpc("prune_notifications");
    if (notesError) log("error", "cron.daily", "notifications_prune_failed", { message: notesError.message });
    log(summary.failed ? "warn" : "info", "cron.daily", "finished", { ...summary, jobsPruned: pruned ?? 0, rateLimitsPruned: limitsPruned ?? 0 });
    // Counts only: no names, profile data or user ids leave the server.
    return NextResponse.json({ ok: true, ...summary, jobsPruned: pruned ?? 0 });
  } catch (e) {
    log("error", "cron.daily", "failed", { message: errorMessage(e) });
    return NextResponse.json({ ok: false, error: "Daily job failed; see server logs." }, { status: 500 });
  }
}

/** Logs a warning and, when OPERATOR_USER_ID is set, notifies that account once a month while the database is above 70% of its limit. */
async function warnIfStorageHigh(admin: ReturnType<typeof createAdminClient>) {
  try {
    const { data, error } = await admin.rpc("storage_usage");
    if (error || !data) return log("error", "cron.daily", "storage_usage_failed", { message: error?.message ?? "no data" });
    const env = serverEnv();
    const status = storageStatus(data as unknown as StorageUsage, env.DB_LIMIT_MB ?? DEFAULT_DB_LIMIT_MB);
    const alert = storageAlert(status, new Date());
    if (!alert) return;
    log("warn", "cron.daily", "storage_high", { usedMb: status.usedMb, limitMb: status.limitMb, level: status.level });
    if (env.OPERATOR_USER_ID) await admin.rpc("notify_user", { p_user: env.OPERATOR_USER_ID, p_kind: "source_problem", p_title: alert.title, p_body: alert.body, p_href: "/notifications", p_dedupe: alert.dedupe });
  } catch (e) {
    log("error", "cron.daily", "storage_check_failed", { message: errorMessage(e) });
  }
}
