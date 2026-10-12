"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { localDate, startOfLocalDay } from "@/lib/dates";
import { failed, saved, type FormState } from "@/lib/form-state";
import { suggestNote } from "@/lib/notes";
import { rewriteNoteWithAI } from "@/lib/notes/ai-rewrite";
import { buildTodaysQueue } from "@/lib/jobs/daily-queue";
import { actionContext, logActivity } from "@/lib/server/action-context";
import { getUserLLM } from "@/lib/ai";

export async function rebuildQueue(): Promise<FormState> {
  const ctx = await actionContext();
  try {
    const { queued, plan } = await buildTodaysQueue(ctx.supabase, ctx.userId);
    await logActivity(ctx, "queue.built", { queued, blocked: plan.blocked });
    refresh();
    return saved(queued ? `Queued ${queued} candidate${queued === 1 ? "" : "s"}.` : "Nothing to queue right now.");
  } catch {
    return failed("Couldn't build the queue. Try again.");
  }
}

const itemSchema = z.object({ queueId: z.uuid(), candidateId: z.uuid(), note: z.string().max(1000).optional() });

/** The person sent the invitation on LinkedIn; record it and close the queue item. */
export async function markQueueItemSent(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed("Unknown queue item.");
  const ctx = await actionContext();
  if (ctx.settings.paused) return failed("Outreach is paused. Resume it in Settings first.");

  const { error } = await ctx.supabase.rpc("record_invitation_sent", {
    p_candidate_id: parsed.data.candidateId,
    p_note_text: parsed.data.note || undefined,
  });
  if (error) {
    const known = ["P0001", "P0002", "23505"].includes(error.code ?? "");
    return failed(known ? error.message : "Couldn't record the invitation.");
  }
  await ctx.supabase.from("daily_queue").update({ state: "sent", note_draft: parsed.data.note || null }).eq("id", parsed.data.queueId);

  await logActivity(ctx, "invitation.sent", { candidate: parsed.data.candidateId, via: "queue", note: Boolean(parsed.data.note) });
  refresh();
  return saved("Recorded as sent.");
}

export async function skipQueueItem(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed("Unknown queue item.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("daily_queue").update({ state: "skipped" }).eq("id", parsed.data.queueId).eq("state", "queued");
  if (error) return failed("Couldn't skip. Try again.");
  await logActivity(ctx, "queue.skipped", { candidate: parsed.data.candidateId });
  refresh();
  return saved("Skipped for today.");
}

/** Per-user cap on AI rewrites, to keep API use (and any cost) predictable. */
const DAILY_REWRITE_LIMIT = 25;

export type RewriteResponse = { ok: true; text: string; left: number } | { ok: false; message: string };

/** Asks the AI for a more natural version of the template note. Called from the note box. */
export async function suggestNoteWithAI(queueId: string): Promise<RewriteResponse> {
  if (!z.uuid().safeParse(queueId).success) return { ok: false, message: "Unknown queue item." };
  const ctx = await actionContext();

  const since = startOfLocalDay(localDate(new Date(), ctx.settings.timezone), ctx.settings.timezone).toISOString();
  const { count } = await ctx.supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "note.rewrite")
    .gte("created_at", since);
  const used = count ?? 0;
  if (used >= DAILY_REWRITE_LIMIT) return { ok: false, message: `You've used today's ${DAILY_REWRITE_LIMIT} AI suggestions. The template note is still there.` };

  const [{ data: item }, { data: me }] = await Promise.all([
    ctx.supabase
      .from("daily_queue")
      .select("candidate_id, candidates(full_name, university, discipline, raw_program_text, notes)")
      .eq("id", queueId)
      .single(),
    ctx.supabase.from("settings").select("my_school_text, my_program_text, my_interests, note_char_limit").single(),
  ]);
  if (!item || !me) return { ok: false, message: "Couldn't load this person." };

  const c = item.candidates;
  const facts = {
    candidateId: item.candidate_id,
    fullName: c.full_name,
    university: c.university,
    discipline: c.discipline,
    programText: c.raw_program_text,
    candidateNotes: c.notes,
    me: { school: me.my_school_text, program: me.my_program_text, interests: me.my_interests },
  };
  // The user's own key, or the server's within the daily allowance (charged before the call).
  const ai = await getUserLLM(ctx.supabase, ctx.userId);
  if (!ai.ok) return { ok: false, message: ai.reason };
  if (!(await ai.charge())) return { ok: false, message: "Today's free AI uses are used up. The template note is still there." };
  const result = await rewriteNoteWithAI(facts, suggestNote(facts, me.note_char_limit), me.note_char_limit, ai.llm);
  await logActivity(ctx, "note.rewrite", { candidate: item.candidate_id, ok: result.ok });
  if (!result.ok) return { ok: false, message: result.reason };

  await ctx.supabase.from("daily_queue").update({ note_draft: result.text }).eq("id", queueId);
  return { ok: true, text: result.text, left: DAILY_REWRITE_LIMIT - used - 1 };
}
