import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { DEFAULT_DB_LIMIT_MB, storageStatus, type StorageUsage } from "@/lib/ops/storage";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The operator's storage and AI-use report: database size against the plan, the largest tables, how many postings were
 * shortened and how many vectors kept, and AI calls today and over 30 days. Counts only, no personal data.
 * Protected like the cron routes (`Authorization: Bearer $CRON_SECRET`). Try it with `npm run ops:report`.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("storage_usage");
  if (error || !data) return NextResponse.json({ error: "Could not read usage." }, { status: 500 });
  const usage = data as unknown as StorageUsage;
  const env = serverEnv();
  return NextResponse.json({ ...usage, status: storageStatus(usage, env.DB_LIMIT_MB ?? DEFAULT_DB_LIMIT_MB), ai_daily_quota: process.env.AI_DAILY_QUOTA || null }, { headers: { "Cache-Control": "no-store" } });
}
