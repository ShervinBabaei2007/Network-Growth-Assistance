import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobForAll } from "@/lib/jobs/daily";
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
