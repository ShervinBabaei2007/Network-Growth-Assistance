import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The operator's view of real-user speed and errors: the 75th percentile of each Core Web Vital per route and
 * device, and the most recent distinct errors. Protected like the cron routes (`Authorization: Bearer $CRON_SECRET`).
 * Everything returned is already free of personal data. Try it with `npm run ops:report`.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 7));
  const admin = createAdminClient();
  const [vitals, errors] = await Promise.all([
    admin.rpc("monitoring_vitals", { p_days: days }),
    admin.from("client_errors").select("source, route, message, stack, digest, occurrences, first_seen, last_seen").order("last_seen", { ascending: false }).limit(50),
  ]);
  if (vitals.error || errors.error) return NextResponse.json({ error: "Could not read monitoring data." }, { status: 500 });
  return NextResponse.json({ days, vitals: vitals.data, errors: errors.data }, { headers: { "Cache-Control": "no-store" } });
}
