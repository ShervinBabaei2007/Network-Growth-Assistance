import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobForAll } from "@/lib/jobs/daily";
import { cronAuthorized } from "@/lib/server/cron-auth";
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
    if (pruneError) console.error("[cron] jobs housekeeping failed:", pruneError.message);
    // Counts only: no names, profile data or user ids leave the server.
    return NextResponse.json({ ok: true, ...summary, jobsPruned: pruned ?? 0 });
  } catch (e) {
    console.error("[cron] daily job failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Daily job failed; see server logs." }, { status: 500 });
  }
}
