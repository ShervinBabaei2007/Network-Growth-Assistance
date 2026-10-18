"use server";

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
  if (error) return err(error.code === "P0001" ? error.message : "Couldn't hide that. Try again.");
  await logActivity(ctx, "jobs.hide", { kind });
  refresh();
  return ok(kind === "company" ? `Hiding jobs from ${pattern}.` : `Hiding titles with "${pattern}".`, { data: { filterId: data.id } });
}

/** Hides every posting from this job's company, from the feed and from alerts. */
export async function hideCompanyOfJob(jobId: string): Promise<ActionResult<{ filterId: string | null }>> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const ctx = await actionContext();
  const { data: job } = await ctx.supabase.from("jobs").select("company").eq("id", jobId).maybeSingle();
  if (!job?.company) return err("This posting has no company name to hide.");
  return addFilter("company", job.company);
}

export async function hideTitlePattern(pattern: string): Promise<ActionResult<{ filterId: string | null }>> {
  return addFilter("title", z.string().max(200).parse(pattern));
}

/** Also the Undo for hiding. */
export async function removeJobFilter(filterId: string): Promise<ActionResult> {
  if (!uuid.safeParse(filterId).success) return err("Unknown filter.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_filters").delete().eq("id", filterId);
  if (error) return err("Couldn't remove that. Try again.");
  refresh();
  return ok("Showing those jobs again.");
}

export async function saveJobNote(jobId: string, body: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const text = body.trim();
  if (text.length === 0) return err("Write something first, or use Delete note.");
  if (text.length > 2000) return err("Notes are limited to 2,000 characters. Shorten it and save again.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_notes").upsert({ user_id: ctx.userId, job_id: jobId, body: text }, { onConflict: "user_id,job_id" });
  if (error) return err("Couldn't save your note. Try again.");
  refresh();
  return ok("Note saved.");
}

export async function deleteJobNote(jobId: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return err("Unknown job.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("job_notes").delete().eq("job_id", jobId);
  if (error) return err("Couldn't delete your note. Try again.");
  refresh();
  return ok("Note deleted.");
}
