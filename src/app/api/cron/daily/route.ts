import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { runDailyJobForAll } from "@/lib/jobs/daily";
import { createAdminClient } from "@/lib/supabase/admin";

// Hobby-plan functions may run for up to 60 seconds.
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called once a day by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDailyJobForAll(createAdminClient());
    // Counts only: no names, profile data or user ids leave the server.
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[cron] daily job failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Daily job failed; see server logs." }, { status: 500 });
  }
}
