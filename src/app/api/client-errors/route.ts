import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeRoute } from "@/lib/monitoring/route";
import { scrubError } from "@/lib/monitoring/scrub";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Receives an error from a browser. The text is scrubbed here, on the server, before anything is stored: emails,
 * keys, tokens, ids, hosts, query strings and profile links are removed, and only the route pattern is kept.
 */

const body = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(100).optional(),
  path: z.string().max(300),
});

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return new NextResponse(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const route = normalizeRoute(parsed.data.path);
  const clean = scrubError({ message: parsed.data.message, stack: parsed.data.stack, source: "browser", route });
  const { error } = await createAdminClient().rpc("record_client_error", {
    p_fingerprint: clean.fingerprint,
    p_source: "browser",
    p_route: route,
    p_message: clean.message,
    p_stack: clean.stack ?? "",
    p_digest: parsed.data.digest?.replace(/[^\w-]/g, "").slice(0, 100) ?? "",
  });
  return new NextResponse(null, { status: error ? 202 : 204 });
}
