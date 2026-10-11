import { NextResponse, type NextRequest } from "next/server";
import { loadPersonDetail } from "@/lib/discovery/results";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/** One researched person with every fact, its source and the search that found it. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/network/people/[id]">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const detail = await loadPersonDetail(user.supabase, id);
  if (!detail) return notFound();
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
