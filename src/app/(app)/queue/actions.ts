"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, saved, type FormState } from "@/lib/form-state";
import { buildTodaysQueue } from "@/lib/jobs/daily-queue";
import { actionContext, logActivity } from "@/lib/server/action-context";

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
