import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { localDate, startOfLocalDay, weekStart } from "@/lib/dates";
import { computeProgress, type ProgressInput } from "@/lib/progress";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

// PostgREST returns at most 1,000 rows per request by default.
const PAGE_SIZE = 1000;

async function loadInvitations(supabase: Client): Promise<ProgressInput["invitations"]> {
  const rows: ProgressInput["invitations"] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("invitations")
      .select(
        "id, outcome, sent_at, resolved_at, candidates!inner(discipline, university, university_confidence, discipline_confidence, is_preexisting_connection)",
      )
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

async function countDiscoveredSince(supabase: Client, since: Date): Promise<number> {
  const { count, error } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .gte("discovered_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Loads everything the dashboard needs for the signed-in user (RLS scopes every query). */
export async function loadProgress(supabase: Client, at?: Date) {
  // Reading the clock makes this request-time work; tell Next.js before doing it.
  if (!at) await connection();
  const now = at ?? new Date();
  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select(
      "overall_target, baseline_connections, project_start_date, timezone, discipline_priority",
    )
    .single();
  if (settingsError) throw settingsError;

  const today = localDate(now, settings.timezone);
  const [targets, snapshot, counts, invitations, discoveredToday, discoveredThisWeek] =
    await Promise.all([
      supabase.from("targets").select("discipline, university, target_count"),
      supabase
        .from("connection_snapshots")
        .select("total_connections, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("candidate_category_counts")
        .select("discipline, university, status, classified, candidate_count"),
      loadInvitations(supabase),
      countDiscoveredSince(supabase, startOfLocalDay(today, settings.timezone)),
      countDiscoveredSince(supabase, startOfLocalDay(weekStart(today), settings.timezone)),
    ]);
  for (const result of [targets, snapshot, counts]) if (result.error) throw result.error;

  return computeProgress({
    now,
    settings: {
      overallTarget: settings.overall_target,
      baselineConnections: settings.baseline_connections,
      projectStartDate: settings.project_start_date,
      timezone: settings.timezone,
      disciplinePriority: settings.discipline_priority,
    },
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
