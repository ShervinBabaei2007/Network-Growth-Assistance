"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { failed, firstIssue, saved, type FormState } from "@/lib/form-state";
import { withStableIds } from "@/lib/job-postings/profile-ids";
import { analyzeResume, confirmFields, importSummary } from "@/lib/job-postings/resume-fields";
import { saveResumeLines } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { FieldMetaMap, ResumeFacts, ResumeProfile, WORK_AUTHORIZATION } from "@/lib/job-postings/types";
import { actionContext, logActivity } from "@/lib/server/action-context";
import type { Json } from "@/lib/supabase/database.types";
import { plural, toastSpec } from "@/lib/toast";

/**
 * Changes to the user's own resume profile. The original text, the parsed original and
 * the uploaded file are never changed here (the database refuses it too); only the
 * working profile is, and a restore keeps the previous one for Undo.
 */

const uuid = z.uuid();
const asJson = (v: unknown) => v as NonNullable<Json>;

const Facts = z.object({
  workAuthorization: z.enum(WORK_AUTHORIZATION),
  securityClearance: z.boolean(),
  willingToRelocate: z.boolean(),
  yearsOverride: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number({ error: "Years must be a number." }).min(0).max(50).nullable()),
});

export async function saveResumeFacts(_: FormState, formData: FormData): Promise<FormState> {
  const id = formData.get("resumeId")?.toString() ?? "";
  if (!uuid.safeParse(id).success) return failed("Unknown resume.");
  const parsed = Facts.safeParse({
    workAuthorization: formData.get("workAuthorization"),
    securityClearance: formData.get("securityClearance") === "on",
    willingToRelocate: formData.get("willingToRelocate") === "on",
    yearsOverride: formData.get("yearsOverride")?.toString().trim(),
  });
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("resumes").update({ facts: asJson(ResumeFacts.parse(parsed.data)) }).eq("id", id);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Your situation was saved. Fit checks update as you browse.");
}

/** Saves the working profile, keeping ids stable and clearing review flags on what the user changed or confirmed. */
export async function saveResumeProfile(resumeId: string, profile: unknown, confirmed: string[] = []): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const parsed = ResumeProfile.safeParse(profile);
  if (!parsed.success) return err("Some fields aren't valid. Check them and try again.");
  const next = withStableIds(parsed.data);
  if (JSON.stringify(next).length > 120_000) return err("That's too long for a resume.");
  const ctx = await actionContext();
  const { data: current } = await ctx.supabase.from("resumes").select("profile, field_meta").eq("id", resumeId).maybeSingle();
  if (!current) return err("Unknown resume.");
  const before = ResumeProfile.safeParse(current.profile);
  const meta = confirmFields(before.success ? before.data : next, next, FieldMetaMap.catch({}).parse(current.field_meta), confirmed.filter((p) => /^[\w.]{1,60}$/.test(p)));
  const { error } = await ctx.supabase.from("resumes").update({ profile: asJson(next), field_meta: asJson(meta) }).eq("id", resumeId);
  if (error) return err("Couldn't save your profile. Your earlier version is unchanged; try again.");
  await saveResumeLines(ctx.supabase, ctx.userId, resumeId, next, jobServices().embedder);
  refresh();
  const left = importSummary(next, meta).needsReview.length;
  return ok("Profile saved.", {
    toast: left ? toastSpec("warning", "Profile saved.", `${plural(left, "field")} still ${left === 1 ? "needs" : "need"} review.`) : toastSpec("success", "Profile saved.", "Fit checks update as you browse."),
  });
}

const FIELD_PATH = /^(name|email|phone|location|summary|skills|certifications|awards|activities|contact\.(linkedin|github|website)|(experience|projects|education)\.[a-z]\d{1,3}(\.(degree|major|graduation))?)$/;

/** "This is correct": clears a review flag without changing the value. */
export async function confirmResumeField(resumeId: string, path: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success || !FIELD_PATH.test(path)) return err("Unknown field.");
  const ctx = await actionContext();
  const { data } = await ctx.supabase.from("resumes").select("field_meta").eq("id", resumeId).maybeSingle();
  if (!data) return err("Unknown resume.");
  const meta = FieldMetaMap.catch({}).parse(data.field_meta);
  meta[path] = { confidence: 1, needsReview: false, reason: "Checked by you." };
  const { error } = await ctx.supabase.from("resumes").update({ field_meta: asJson(meta) }).eq("id", resumeId);
  if (error) return err("Couldn't save. Try again.");
  refresh();
  return ok("Marked as checked.");
}

/** Puts the parsed original back as the working profile. The current profile is kept for Undo. */
export async function restoreOriginalProfile(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  const { data } = await ctx.supabase.from("resumes").select("profile, original_profile, raw_text").eq("id", resumeId).maybeSingle();
  if (!data) return err("Unknown resume.");
  const original = ResumeProfile.safeParse(data.original_profile);
  if (!data.original_profile || !original.success) return err("The parsed original isn't available for resumes imported before versions were kept. Import the file again to start from it.");
  const { error } = await ctx.supabase
    .from("resumes")
    .update({ previous_profile: data.profile, profile: asJson(original.data), field_meta: asJson(analyzeResume(data.raw_text, original.data)) })
    .eq("id", resumeId);
  if (error) return err("Couldn't restore. Nothing was changed; try again.");
  await saveResumeLines(ctx.supabase, ctx.userId, resumeId, original.data, jobServices().embedder);
  await logActivity(ctx, "jobs.resume_restored", { resume: resumeId });
  refresh();
  return ok("Your profile was restored to the parsed original.");
}

/** Undoes a restore: the profile from before it comes back. */
export async function undoRestoreProfile(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  const { data } = await ctx.supabase.from("resumes").select("previous_profile, raw_text").eq("id", resumeId).maybeSingle();
  const previous = ResumeProfile.safeParse(data?.previous_profile);
  if (!data?.previous_profile || !previous.success) return err("There's nothing to undo.");
  const { error } = await ctx.supabase
    .from("resumes")
    .update({ profile: asJson(previous.data), previous_profile: null, field_meta: asJson(analyzeResume(data.raw_text, previous.data)) })
    .eq("id", resumeId);
  if (error) return err("Couldn't undo. Try again.");
  await saveResumeLines(ctx.supabase, ctx.userId, resumeId, previous.data, jobServices().embedder);
  refresh();
  return ok("Changes reverted. Your edited profile is back.");
}

export async function setActiveResume(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  await ctx.supabase.from("resumes").update({ is_active: false }).eq("is_active", true);
  const { error } = await ctx.supabase.from("resumes").update({ is_active: true }).eq("id", resumeId);
  if (error) return err("Couldn't switch. Try again.");
  refresh();
  return ok("This resume is now used for fit checks and tailoring.");
}

/** Deletes a whole resume, its stored file and what was made from it. Asked for explicitly, with a confirmation. */
export async function deleteResume(resumeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(resumeId).success) return err("Unknown resume.");
  const ctx = await actionContext();
  const { data } = await ctx.supabase.from("resumes").select("original_file_path").eq("id", resumeId).maybeSingle();
  if (!data) return err("Unknown resume.");
  const { error } = await ctx.supabase.from("resumes").delete().eq("id", resumeId);
  if (error) return err("Couldn't delete. Try again.");
  if (data.original_file_path) await ctx.supabase.storage.from("resumes").remove([data.original_file_path]);
  await logActivity(ctx, "jobs.resume_deleted", { resume: resumeId });
  refresh();
  return ok("Resume deleted, with its fit checks and tailored documents.");
}
