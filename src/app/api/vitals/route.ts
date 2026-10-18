import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deviceFromUserAgent, normalizeRoute } from "@/lib/monitoring/route";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Receives one page-speed measurement (a Core Web Vital) from a browser. Open to everyone, including signed-out
 * visitors, so it checks every field strictly and stores only: the route pattern, the metric, its value, its
 * rating and "phone" or "desktop". No user id, IP address, cookie or page content is read or kept.
 */

const body = z.object({
  name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().finite().min(0).max(600_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  path: z.string().max(300),
});

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new NextResponse(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const { error } = await createAdminClient().rpc("record_vital", {
    p_route: normalizeRoute(parsed.data.path),
    p_metric: parsed.data.name,
    p_value: parsed.data.value,
    p_rating: parsed.data.rating ?? "",
    p_device: deviceFromUserAgent(request.headers.get("user-agent")),
  });
  // Monitoring must never get in the way: a failure is quietly dropped.
  return new NextResponse(null, { status: error ? 202 : 204 });
}
