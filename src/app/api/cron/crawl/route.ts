import { NextResponse } from "next/server";
import { crawlDue } from "@/lib/job-postings/crawler";
import { syncFeeds } from "@/lib/job-postings/search";
import { jobServices } from "@/lib/job-postings/services";
import { verifyPending } from "@/lib/job-postings/verify-job";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { errorMessage, log } from "@/lib/server/log";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
/** Stop starting new boards with this much of the route's time left. */
const SAFETY_MS = 12_000;

/**
 * Reads the employer job boards that are due, reads the scheduled job-site feeds when
 * they're due (Remotive and Arbeitnow, at most every 6 hours), then checks the links of
 * search results that haven't been verified yet (with whatever time is left). Called every 10 minutes by Supabase
 * pg_cron (see docs/DEPLOYMENT.md) with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const services = jobServices();
  try {
    const deadline = Date.now() + maxDuration * 1000 - SAFETY_MS;
    const summary = await crawlDue(createAdminClient(), { deadline, embedder: services.embedder, fixtures: services.fixtures });
    // A feed failing never fails the crawl: board jobs and link checks still run.
    const feeds = Date.now() < deadline ? await syncFeeds({ fixtures: services.fixtures }) : null;
    const linksChecked = Date.now() < deadline ? await verifyPending(30, deadline) : 0;
    log("info", "cron.crawl", "finished", { boards: summary.boards, newJobs: summary.newJobs, linksChecked });
    return NextResponse.json({ ok: true, ...summary, feeds, linksChecked });
  } catch (e) {
    log("error", "cron.crawl", "failed", { message: errorMessage(e) });
    return NextResponse.json({ ok: false, error: "Crawl failed; see server logs." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
