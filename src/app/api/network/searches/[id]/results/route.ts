import { NextResponse, type NextRequest } from "next/server";
import { loadSearchResults } from "@/lib/discovery/results";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/** The people a search found, grouped by tier. Only the owner can read them (RLS). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/network/searches/[id]/results">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const { data: search } = await user.supabase.from("network_searches").select("id").eq("id", id).maybeSingle();
  if (!search) return notFound();
  const sp = req.nextUrl.searchParams;
  const results = await loadSearchResults(user.supabase, id, {
    institution: sp.get("institution") ?? undefined,
    program: sp.get("program") ?? undefined,
    company: sp.get("company") ?? undefined,
    role: sp.get("role") ?? undefined,
    location: sp.get("location") ?? undefined,
    gradYear: sp.get("gradYear") ?? undefined,
    minScore: Number(sp.get("minScore")) || 0,
  });
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
