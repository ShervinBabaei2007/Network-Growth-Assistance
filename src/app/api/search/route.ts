import { NextResponse, type NextRequest } from "next/server";
import { cleanQuery, orIlike, PALETTE_PER_TYPE, type PaletteResults } from "@/lib/search/palette";
import { routeUser, unauthorized } from "@/lib/server/route-auth";

/**
 * Searches the signed-in user's own candidates, people, applications and jobs for the command palette.
 * Row-level security limits every query to what the user may see; at most a few rows per type come back.
 */
export async function GET(request: NextRequest) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const q = cleanQuery(request.nextUrl.searchParams.get("q"));
  const empty: PaletteResults = { candidates: [], people: [], applications: [], jobs: [] };
  if (!q) return NextResponse.json(empty);

  const db = user.supabase;
  const [candidates, people, applications, jobs] = await Promise.all([
    db.from("candidates").select("id, full_name, role").or(orIlike(["full_name", "role"], q)).order("full_name").limit(PALETTE_PER_TYPE),
    db.from("network_people").select("id, full_name, current_title, current_company").or(orIlike(["full_name", "current_company"], q)).order("full_name").limit(PALETTE_PER_TYPE),
    db.from("applications").select("id, title, company, stage").or(orIlike(["title", "company"], q)).order("updated_at", { ascending: false }).limit(PALETTE_PER_TYPE),
    db.from("jobs").select("id, title, company").or(orIlike(["title", "company"], q)).order("posted_at", { ascending: false }).limit(PALETTE_PER_TYPE),
  ]);
  if (candidates.error || people.error || applications.error || jobs.error) {
    return NextResponse.json({ error: "Search failed. Try again." }, { status: 500 });
  }

  const body: PaletteResults = {
    candidates: (candidates.data ?? []).map((r) => ({ id: r.id, label: r.full_name, detail: r.role ?? undefined, href: `/candidates/${r.id}` })),
    people: (people.data ?? []).map((r) => ({ id: r.id, label: r.full_name, detail: [r.current_title, r.current_company].filter(Boolean).join(" at ") || undefined, href: `/people/${r.id}` })),
    applications: (applications.data ?? []).map((r) => ({ id: r.id, label: r.title, detail: [r.company, r.stage].filter(Boolean).join(" · ") || undefined, href: `/applications/${r.id}` })),
    jobs: (jobs.data ?? []).map((r) => ({ id: r.id, label: r.title, detail: r.company ?? undefined, href: `/jobs/${r.id}` })),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
