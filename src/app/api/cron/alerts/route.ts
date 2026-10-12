import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts/run";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { errorMessage, log } from "@/lib/server/log";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
/** Stop starting new searches with this much of the route's time left. */
const SAFETY_MS = 12_000;

/**
 * Saved-search alerts, due reminders, upcoming interviews, weekly summaries, broken job
 * boards, and queued emails. Reads stored jobs only. Called every 15 minutes by Supabase
 * pg_cron (see docs/DEPLOYMENT.md) with `Authorization: Bearer $CRON_SECRET`; safe to call
 * more often or twice at once.
 */
async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runAlerts(createAdminClient(), Date.now() + maxDuration * 1000 - SAFETY_MS);
    log(summary.failed ? "warn" : "info", "cron.alerts", "finished", { searches: summary.searches, newJobs: summary.newJobs, notifications: summary.notifications, failed: summary.failed, reminders: summary.reminders, interviews: summary.interviews, emailsSent: summary.email.sent });
    // Counts only.
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    log("error", "cron.alerts", "failed", { message: errorMessage(e) });
    return NextResponse.json({ ok: false, error: "Alerts failed; see server logs." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
