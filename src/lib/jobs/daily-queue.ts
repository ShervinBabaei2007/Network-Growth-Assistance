import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalog } from "@/lib/domain";
import { loadProgress } from "@/lib/data/dashboard";
import { suggestNote } from "@/lib/notes";
import { planQueue, type EligibleCandidate } from "@/lib/prioritize";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
const PAGE_SIZE = 1000;

async function loadEligible(supabase: Client, userId: string): Promise<EligibleCandidate[]> {
  const out: EligibleCandidate[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id, discipline, university, discovered_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .eq("university_confidence", "confirmed")
      .eq("discipline_confidence", "confirmed")
      .not("university", "is", null)
      .not("discipline", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const c of data) {
      out.push({ id: c.id, discipline: c.discipline!, university: c.university!, discoveredAt: c.discovered_at });
    }
    if (data.length < PAGE_SIZE) return out;
  }
}

/** Computes today's plan without writing anything. */
export async function computeTodaysPlan(supabase: Client, userId: string, now?: Date) {
  const [{ data: settings, error }, progress, eligible] = await Promise.all([
    supabase
      .from("settings")
      .select("paused, daily_invite_target, weekly_invite_cap")
      .eq("user_id", userId)
      .single(),
    loadProgress(supabase, userId, now),
    loadEligible(supabase, userId),
  ]);
  if (error) throw error;

  const { data: todays, error: qError } = await supabase
    .from("daily_queue")
    .select("candidate_id, state")
    .eq("user_id", userId)
    .eq("queue_date", progress.today);
  if (qError) throw qError;

  const plan = planQueue({
    disciplines: progress.disciplines,
    catalog: progress.catalog,
    eligible,
    skippedToday: todays.filter((r) => r.state === "skipped").map((r) => r.candidate_id),
    outcomes: progress.outcomes,
    settings: {
      paused: settings.paused,
      dailyInviteTarget: settings.daily_invite_target,
      weeklyInviteCap: settings.weekly_invite_cap,
    },
    sentToday: progress.activity.sentToday,
    sentThisWeek: progress.activity.sentThisWeek,
  });
  return { plan, progress, todays };
}

/**
 * Rebuilds today's queue: items already sent or skipped stay as they are, and the
 * still-open items are replaced by a fresh plan. Safe to run any number of times.
 */
export async function buildTodaysQueue(supabase: Client, userId: string, now?: Date) {
  const { plan, progress, todays } = await computeTodaysPlan(supabase, userId, now);
  const today = progress.today;

  const { error: delError } = await supabase
    .from("daily_queue")
    .delete()
    .eq("user_id", userId)
    .eq("queue_date", today)
    .eq("state", "queued");
  if (delError) throw delError;

  const kept = todays.filter((r) => r.state !== "queued").length;
  if (plan.items.length > 0) {
    const notes = await draftNotes(supabase, userId, plan.items.map((i) => i.candidateId), progress.catalog);
    const { error } = await supabase.from("daily_queue").upsert(
      plan.items.map((i) => ({
        user_id: userId,
        queue_date: today,
        candidate_id: i.candidateId,
        rank: kept + i.rank,
        reason: i.reason,
        is_alternate: i.isAlternate,
        note_draft: notes.get(i.candidateId) ?? null,
      })),
      { onConflict: "user_id,queue_date,candidate_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  return { plan, today, queued: plan.items.length };
}

/** Template note drafts for the queued people (no AI here; that's on request only). */
async function draftNotes(supabase: Client, userId: string, candidateIds: string[], catalog: Catalog) {
  const [{ data: me, error: meError }, { data: people, error }] = await Promise.all([
    supabase.from("settings").select("my_school_text, my_program_text, my_interests, note_char_limit").eq("user_id", userId).single(),
    supabase
      .from("candidates")
      .select("id, full_name, university, discipline, raw_program_text, notes")
      .eq("user_id", userId)
      .in("id", candidateIds),
  ]);
  if (meError) throw meError;
  if (error) throw error;
  return new Map(
    people.map((c) => [
      c.id,
      suggestNote(
        {
          candidateId: c.id,
          fullName: c.full_name,
          university: catalog.universities.find((u) => u.id === c.university) ?? null,
          discipline: catalog.disciplines.find((d) => d.id === c.discipline) ?? null,
          programText: c.raw_program_text,
          candidateNotes: c.notes,
          me: { school: me.my_school_text, program: me.my_program_text, interests: me.my_interests },
        },
        me.note_char_limit,
      ),
    ]),
  );
}
