import { NextResponse } from "next/server";
import { interviewsToIcs } from "@/lib/applications/ics";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/**
 * The application's interviews as a calendar file (.ics). Re-downloading after a change
 * updates the same events: each keeps its UID, and its SEQUENCE grows when the time moves.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/applications/[id]/interviews">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data: app } = await user.supabase.from("applications").select("title, company").eq("id", id).maybeSingle();
  if (!app) return notFound();
  const { data: interviews, error } = await user.supabase
    .from("application_interviews")
    .select("id, starts_at, duration_minutes, timezone, kind, location, notes, ics_sequence, updated_at")
    .eq("application_id", id)
    .order("starts_at");
  if (error) return NextResponse.json({ error: "Couldn't load the interviews. Try again." }, { status: 500 });
  if (!interviews.length) return NextResponse.json({ error: "This application has no interviews yet." }, { status: 404 });

  const ics = interviewsToIcs(
    app,
    interviews.map((i) => ({ id: i.id, startsAt: i.starts_at, durationMinutes: i.duration_minutes, timezone: i.timezone, kind: i.kind, location: i.location, notes: i.notes, sequence: i.ics_sequence, updatedAt: i.updated_at })),
  );
  const slug = `${app.company ?? ""} ${app.title}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "interviews";
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interviews-${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
