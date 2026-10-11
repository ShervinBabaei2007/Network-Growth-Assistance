import { NextResponse } from "next/server";
import { crawlDue } from "@/lib/job-postings/crawler";
import { jobServices } from "@/lib/job-postings/services";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
/** Stop starting new boards with this much of the route's time left. */
const SAFETY_MS = 12_000;

/**
 * Reads the employer job boards that are due. Called every 10 minutes by Supabase
 * pg_cron (see docs/DEPLOYMENT.md) with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const services = jobServices();
  try {
    const summary = await crawlDue(createAdminClient(), { deadline: Date.now() + maxDuration * 1000 - SAFETY_MS, embedder: services.embedder, fixtures: services.fixtures });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[crawl] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Crawl failed; see server logs." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
