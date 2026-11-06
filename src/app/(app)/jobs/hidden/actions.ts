"use server";

import { getT } from "@/lib/i18n/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { MAX_PATTERN, MIN_PATTERN, normalizePattern, type HiddenKind } from "@/lib/job-postings/hidden";
import { actionContext, logActivity } from "@/lib/server/action-context";

/**
 * Hiding companies and title patterns from the Jobs feed (and saved-search alerts), and private notes on a job.
 * All rows are the signed-in user's own; row-level security enforces it as well.
 */

const uuid = z.uuid();
const PG_UNIQUE = "23505";

async function addFilter(kind: HiddenKind, rawPattern: string): Promise<ActionResult<{ filterId: string | null }>> {
  const pattern = normalizePattern(rawPattern);
  if (pattern.length < MIN_PATTERN || pattern.length > MAX_PATTERN) return err(`Use between ${MIN_PATTERN} and ${MAX_PATTERN} characters.`);
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("job_filters").insert({ kind, pattern }).select("id").single();
  if (error?.code === PG_UNIQUE) return ok(`Already hidden: ${pattern}.`, { data: { filterId: null } });
  if (error) return err(error.code === "P0001" ? error.message : (await getT())("msg.couldnTHideThatf21b"));
  await logActivity(ctx, "jobs.hide", { kind });
  refresh();
  return ok(kind === "company" ? `Hiding jobs from ${pattern}.` : `Hiding titles with "${pattern}".`, { data: { filterId: data.id } });
}

/** Hides every posting from this job's company, from the feed and from alerts. */
export async function hideCompanyOfJob(jobId: string): Promise<ActionResult<{ filterId: string | null }>> {
  if (!uuid.safeParse(jobId).success) return err((await getT())("msg.weCouldnTFind0db8"));
  const ctx = await actionContext();
  const { data: job } = await ctx.supabase.from("jobs").select("company").eq("id", jobId).maybeSingle();
  if (!job?.company) return err((await getT())("msg.thisPostingHasNoa402"));
  return addFilter("company", job.company);
}

export async function hideTitlePattern(pattern: string): Promise<ActionResult<{ filterId: string | null }>> {
  return addFilter("title", z.string().max(200).parse(pattern));
}

/** Also the Undo for hiding. */
export async function removeJobFilter(filterId: string): Promise<ActionResult> {
  if (!uuid.safeParse(filterId).success) return err((await getT())("msg.weCouldnTFind33ab"));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_filters").delete().eq("id", filterId);
  if (error) return err((await getT())("msg.couldnTRemoveThat69f3"));
  refresh();
  return ok((await getT())("msg.showingThoseJobsAgain92d3"));
}

export async function saveJobNote(jobId: string, body: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err((await getT())("msg.weCouldnTFind0db8"));
  const text = body.trim();
  if (text.length === 0) return err((await getT())("msg.writeSomethingFirstOr4ac4"));
  if (text.length > 2000) return err((await getT())("msg.notesAreLimitedTob766"));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_notes").upsert({ user_id: ctx.userId, job_id: jobId, body: text }, { onConflict: "user_id,job_id" });
  if (error) return err((await getT())("msg.couldnTSaveYour34ad"));
  refresh();
  return ok((await getT())("msg.noteSaved57c0"));
}

export async function deleteJobNote(jobId: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err((await getT())("msg.weCouldnTFind0db8"));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_notes").delete().eq("job_id", jobId);
  if (error) return err((await getT())("msg.couldnTDeleteYourc010"));
  refresh();
  return ok((await getT())("msg.noteDeleted07c9"));
}
