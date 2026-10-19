import { NextResponse, type NextRequest } from "next/server";
import { advanceSearch } from "@/lib/discovery/agent";
import { discoveryAi } from "@/lib/discovery/ai-access";
import { discoveryServices } from "@/lib/discovery/providers/registry";
import { loadSearchView } from "@/lib/discovery/service";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

// Each research step is bounded to fit within this, including the Vercel Hobby limit.
export const maxDuration = 60;

/**
 * Status of a search. While it's running, each poll also advances it by one
 * bounded step (if no other request is already doing so), so progress is real
 * and survives serverless time limits.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/network/searches/[id]">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();

  let view = await loadSearchView(user.supabase, id);
  if (!view) return notFound();
  if (view.status === "queued" || view.status === "running") {
    // A failed step is recorded on the search itself; the poll still reports the current state.
    const ai = await discoveryAi(user.supabase, id);
    await advanceSearch(user.supabase, user.userId, id, discoveryServices(ai.llm)).catch(() => undefined);
    view = (await loadSearchView(user.supabase, id)) ?? view;
  }
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

/** Cancels a running search; results found so far are kept. */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/network/searches/[id]">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const { data } = await user.supabase
    .from("network_searches")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), lease_until: null })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select("id");
  if (!data?.length) return notFound();
  return NextResponse.json({ ok: true });
}
