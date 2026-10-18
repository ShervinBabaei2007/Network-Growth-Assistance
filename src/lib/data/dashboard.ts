import "server-only";
import { loadCatalog } from "./catalog";
import { getClaims, getSettings } from "./settings";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { localDate, startOfLocalDay, weekStart } from "@/lib/dates";
import { computeProgress, type ProgressInput } from "@/lib/progress";
import { expandExportGroups, expandInvitationGroups } from "@/lib/progress/groups";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

// PostgREST returns at most 1,000 rows per request by default.
const PAGE_SIZE = 1000;

/**
 * Every invitation, as the progress calculations read them. One request for grouped rows; if the database can't
 * group them (an unknown time zone, say), they are read a page at a time instead.
 */
export async function loadInvitations(supabase: Client, userId: string, timezone: string): Promise<ProgressInput["invitations"]> {
  const { data, error } = await supabase.rpc("activity_invitation_groups", { p_user: userId, p_tz: timezone });
  if (!error && data) return expandInvitationGroups(data, timezone);
  return loadInvitationsByPage(supabase, userId);
}

async function loadInvitationsByPage(supabase: Client, userId: string): Promise<ProgressInput["invitations"]> {
  const rows: ProgressInput["invitations"] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("invitations")
      .select(
        "id, outcome, sent_at, resolved_at, candidates!inner(discipline, university, university_confidence, discipline_confidence, is_preexisting_connection)",
      )
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    for (const inv of data) {
      const c = inv.candidates;
      rows.push({
        outcome: inv.outcome,
        sentAt: inv.sent_at,
        resolvedAt: inv.resolved_at,
        discipline: c.discipline,
        university: c.university,
        classified:
          c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed",
        preexisting: c.is_preexisting_connection,
      });
    }
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function loadExportConnections(supabase: Client, userId: string, timezone: string): Promise<NonNullable<ProgressInput["exportConnections"]>> {
  const { data, error } = await supabase.rpc("activity_export_groups", { p_user: userId, p_tz: timezone });
  if (!error && data) return expandExportGroups(data, timezone);
  return loadExportConnectionsByPage(supabase, userId);
}

async function loadExportConnectionsByPage(supabase: Client, userId: string): Promise<NonNullable<ProgressInput["exportConnections"]>> {
  const rows: NonNullable<ProgressInput["exportConnections"]> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id, connected_at, discipline, university, university_confidence, discipline_confidence, is_preexisting_connection")
      .eq("user_id", userId)
      .eq("connected_via", "export")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const c of data) {
      rows.push({
        connectedAt: c.connected_at!,
        discipline: c.discipline,
        university: c.university,
        classified: c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed",
        preexisting: c.is_preexisting_connection,
      });
    }
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function countDiscoveredSince(supabase: Client, userId: string, since: Date): Promise<number> {
  const { count, error } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("discovered_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

type ProgressSettings = { overall_target: number | null; baseline_connections: number | null; project_start_date: string; timezone: string };

/**
 * Loads everything the dashboard needs for one user. Every query filters by
 * user_id explicitly so this is also safe with the service-role client used by
 * the daily job; with the signed-in client, RLS applies as well.
 */
export async function loadProgress(supabase: Client, userId: string, at?: Date, known?: ProgressSettings) {
  // Reading the clock makes this request-time work; tell Next.js before doing it.
  if (!at) await connection();
  const now = at ?? new Date();
  // Pages pass the settings they already have (one shared read per request); the daily job reads them here.
  let settings = known;
  if (!settings) {
    const { data, error: settingsError } = await supabase
      .from("settings")
      .select("overall_target, baseline_connections, project_start_date, timezone")
      .eq("user_id", userId)
      .single();
    if (settingsError) throw settingsError;
    settings = data;
  }

  const today = localDate(now, settings.timezone);
  const [targets, snapshot, counts, invitations, discoveredToday, discoveredThisWeek, exportConnections, catalog] =
    await Promise.all([
      supabase.from("targets").select("discipline, university, target_count").eq("user_id", userId),
      supabase
        .from("connection_snapshots")
        .select("total_connections, recorded_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("candidate_category_counts")
        .select("discipline, university, status, classified, candidate_count")
        .eq("user_id", userId),
      loadInvitations(supabase, userId, settings.timezone),
      countDiscoveredSince(supabase, userId, startOfLocalDay(today, settings.timezone)),
      countDiscoveredSince(supabase, userId, startOfLocalDay(weekStart(today), settings.timezone)),
      loadExportConnections(supabase, userId, settings.timezone),
      loadCatalog(supabase, userId),
    ]);
  for (const result of [targets, snapshot, counts]) if (result.error) throw result.error;

  return computeProgress({
    now,
    settings: {
      overallTarget: settings.overall_target,
      baselineConnections: settings.baseline_connections,
      projectStartDate: settings.project_start_date,
      timezone: settings.timezone,
    },
    catalog,
    targets: (targets.data ?? []).map((t) => ({
      discipline: t.discipline,
      university: t.university,
      targetCount: t.target_count,
    })),
    latestSnapshot: snapshot.data
      ? {
          totalConnections: snapshot.data.total_connections,
          recordedAt: snapshot.data.recorded_at,
        }
      : null,
    invitations,
    exportConnections,
    // View columns are typed nullable; group-by keys other than discipline/university never are.
    candidateCounts: (counts.data ?? []).map((r) => ({
      discipline: r.discipline,
      university: r.university,
      status: r.status!,
      classified: r.classified ?? false,
      count: r.candidate_count ?? 0,
    })),
    discovered: { today: discoveredToday, thisWeek: discoveredThisWeek },
  });
}

/** The signed-in user's id, for pages that call the loaders. */
export async function currentUserId(_supabase?: Client): Promise<string> {
  const id = (await getClaims())?.sub;
  if (!id) throw new Error("Not signed in");
  return id;
}

/**
 * The signed-in user's progress for a page. The settings row and the user's id come from the request's
 * shared reads, so the page's queries can start straight away instead of waiting on a settings round trip.
 */
export async function loadMyProgress() {
  const [supabase, userId, { row, error }] = await Promise.all([createClient(), currentUserId(), getSettings()]);
  if (error || !row) throw new Error(error ?? "Settings not found");
  return loadProgress(supabase, userId, undefined, row);
}
